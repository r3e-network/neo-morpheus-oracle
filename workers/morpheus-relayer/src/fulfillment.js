import crypto from 'node:crypto';
import { callNitro } from './nitro.js';
import {
  buildFulfillmentDigestBytes,
  buildWorkerPayload,
  decodePayloadText,
  encodeFulfillmentResult,
  isOperatorOnlyRequestType,
  resolveKernelIntent,
  resolveWorkerRoute,
} from './router.js';
import {
  guardQueuedAutomationExecution,
  handleAutomationControlRequest,
  isAutomationControlRequestType,
} from './automation.js';
import { buildUpkeepDispatch } from './automation-supervisor.js';
import { fulfillNeoN3Request } from './neo-n3.js';
import { fulfillNeoXRequest, signNeoXFulfillment } from './neox.js';
import {
  buildEventKey,
  clearRetryItem,
  enqueueRetryItem,
  incrementMetric,
  recordProcessedEvent,
  scheduleRetry,
} from './state.js';
import {
  claimDurableJobForProcessing,
  ensureDurableQueueAvailable,
  isTransientDurableQueueError,
  maybeUpsertJob,
  upsertJobOrThrow,
} from './queue.js';
import { reportPinnedNeoN3Role, resolvePinnedNeoN3VerifierPublicKey } from './lib/neo-signers.js';
import { wallet as neonWallet } from '@cityofzion/neon-js';

import { normalizeErrorMessage } from './feed-sync.js';
import { trimString } from '@neo-morpheus-oracle/shared/utils';
export { normalizeErrorMessage };

export function trimOnchainErrorMessage(value, maxLength = 240) {
  // Finalized error text lands in immutable chain state and Supabase last_error;
  // redact URLs so infrastructure endpoints (and any credentials embedded in
  // authenticated RPC URLs) can never leak through an error message.
  const text = normalizeErrorMessage(value)
    .replace(/https?:\/\/[^\s\]]+/gi, '[redacted-url]')
    .trim();
  if (!text) return 'request execution failed';
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

export function isAlreadyFulfilledError(message) {
  const normalized = normalizeErrorMessage(message).toLowerCase();
  return (
    normalized.includes('already fulfilled') ||
    normalized.includes('request already fulfilled') ||
    normalized.includes('reason: request already fulfilled')
  );
}

export function isTerminalConfigurationError(message) {
  const normalized = normalizeErrorMessage(message).toLowerCase();
  return (
    normalized.includes('reason: unauthorized') ||
    normalized.includes('invalid signature') ||
    normalized.includes('verifier rejected signature') ||
    normalized.includes('oracle verifier') ||
    normalized.includes('updater not set') ||
    normalized.includes('callback not allowed') ||
    (normalized.includes('called contract') && normalized.includes('not found'))
  );
}

/**
 * Classify an error as transient (network/rate-limit), permanent (auth/not-found),
 * or unknown to guide retry decisions.  Transient errors are always retried;
 * permanent errors skip straight to the dead-letter / finalize path.
 */
export function classifyError(err) {
  const msg = normalizeErrorMessage(err).toLowerCase();
  if (isAlreadyFulfilledError(msg)) return 'settled';
  if (isTerminalConfigurationError(msg)) return 'permanent';
  if (
    msg.includes('etimedout') ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset') ||
    msg.includes('rate limit') ||
    msg.includes('socket hang up') ||
    msg.includes('503') ||
    msg.includes('502') ||
    msg.includes('504') ||
    msg.includes('network') ||
    msg.includes('timed out') ||
    msg.includes('unavailable')
  )
    return 'transient';
  if (
    msg.includes('not found') ||
    msg.includes('fault') ||
    msg.includes('unauthorized') ||
    msg.includes('forbidden') ||
    msg.includes('invalid')
  )
    return 'permanent';
  return 'unknown';
}

export function computeRetryDelayMs(config, attempts) {
  return Math.min(config.retryBaseDelayMs * 2 ** Math.max(attempts - 1, 0), config.retryMaxDelayMs);
}

/**
 * Ceiling on callback-delivery / failure-finalize redelivery attempts. The
 * prepared-fulfillment and finalize-only retry lanes bypass scheduleRetry's
 * maxRetries check (the payload is already prepared, only the on-chain
 * submission is retried), so without this cap a poison request would redeliver
 * forever. Defaults to maxRetries * 2 when MORPHEUS_RELAYER_MAX_CALLBACK_RETRIES
 * is not configured.
 */
export function resolveCallbackRetryCeiling(config) {
  const explicit = Number(config?.maxCallbackRetries);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return Math.max(Number(config?.maxRetries || 0) * 2, 1);
}

export function resolveFulfillmentSigningContext(chain, fulfillment = {}) {
  const normalizedChain = trimString(chain || '') || 'neo_n3';
  // Identifier hygiene: pass the identifier bytes through VERBATIM. The on-chain
  // digest hashes the stored request identifiers exactly as written, so trimming
  // here would produce a signature the contract rejects whenever an identifier
  // carries whitespace (malformed identifiers are rejected at ingestion instead,
  // and the failure-finalize path must still sign a digest the contract accepts).
  const appId = String(fulfillment.appId ?? '');
  const moduleId = String(fulfillment.moduleId ?? '');
  const operation = String(fulfillment.operation ?? '');

  // Legacy Neo N3 requests do not carry appId and still verify against the
  // legacy digest domain, even though the relayer can infer a synthetic
  // moduleId/operation from requestType.
  if (normalizedChain === 'neo_n3' && !appId) {
    return { chain: 'legacy', appId: '', moduleId: '', operation: '' };
  }

  return {
    chain: normalizedChain,
    appId,
    moduleId,
    operation,
  };
}

export function resolveEventFulfillmentContext(event = {}, kernelIntent = {}) {
  // Verbatim on-chain identifiers; the internal kernel-intent mapping only fills
  // genuinely absent (empty) fields so the digest always covers the exact bytes
  // the contract stored.
  return {
    appId: String(event.appId ?? ''),
    moduleId: String(event.moduleId ?? '') || String(kernelIntent.moduleId ?? ''),
    operation: String(event.operation ?? '') || String(kernelIntent.operation ?? ''),
  };
}

/**
 * Identifier hygiene gate (ingestion): kernel identifiers (appId, moduleId,
 * operation — and requestType, which mirrors operation) are routing keys and
 * fulfillment-digest inputs. None of the kernel-defined identifier vocabularies
 * contain whitespace, so any whitespace-bearing identifier is malformed (or
 * adversarial — e.g. an id crafted to alias a different worker route after
 * normalization). Returns the first offending field or null.
 */
export function findWhitespaceIdentifier(event = {}) {
  for (const field of ['appId', 'moduleId', 'operation', 'requestType']) {
    const value = event[field];
    if (typeof value === 'string' && /\s/.test(value)) {
      return { field, value };
    }
  }
  return null;
}

// Throws the classified ingestion-rejection error for whitespace-bearing
// identifiers. The message classifies as 'permanent' (classifyError matches
// 'invalid'), so processEvent skips the worker/retry lanes and finalizes the
// request on-chain with a failure callback — which verifies because the digest
// now covers the on-chain identifier bytes verbatim.
function assertEventIdentifiersClean(event) {
  const offending = findWhitespaceIdentifier(event);
  if (offending) {
    throw new Error(
      `invalid identifier: request ${String(event.requestId || '')} field ${offending.field} contains whitespace`
    );
  }
}

function normalizePublicKey(value) {
  return trimString(value).replace(/^0x/i, '').toLowerCase();
}

function buildLocalNeoN3Account(keyMaterial = '') {
  const raw = trimString(keyMaterial);
  if (!raw) return null;
  try {
    return new neonWallet.Account(raw);
  } catch {
    return null;
  }
}

function resolveLocalVerifierAccount(config) {
  const expectedPublicKey = normalizePublicKey(
    resolvePinnedNeoN3VerifierPublicKey(config.network, process.env)
  );
  const candidates = [];

  const explicitVerifier = reportPinnedNeoN3Role(config.network, 'oracle_verifier', {
    env: process.env,
    allowMissing: true,
  }).materialized;
  if (explicitVerifier?.private_key)
    candidates.push(buildLocalNeoN3Account(explicitVerifier.private_key));
  if (explicitVerifier?.wif) candidates.push(buildLocalNeoN3Account(explicitVerifier.wif));
  if (config?.neo_n3?.updaterPrivateKey)
    candidates.push(buildLocalNeoN3Account(config.neo_n3.updaterPrivateKey));
  if (config?.neo_n3?.updaterWif) candidates.push(buildLocalNeoN3Account(config.neo_n3.updaterWif));

  const workerSigner = reportPinnedNeoN3Role(config.network, 'worker', {
    env: process.env,
    allowMissing: true,
  }).materialized;
  if (workerSigner?.private_key) candidates.push(buildLocalNeoN3Account(workerSigner.private_key));
  if (workerSigner?.wif) candidates.push(buildLocalNeoN3Account(workerSigner.wif));

  return (
    candidates.find(
      (account) => account && normalizePublicKey(account.publicKey) === expectedPublicKey
    ) || null
  );
}

export async function signFulfillmentPayload(config, chain, fulfillment) {
  // Neo X (EVM): keccak digest + secp256k1 EIP-191 signature (ecrecover on-chain).
  // The Nitro enclave signs secp256r1 only, so this never touches /sign/payload.
  if (chain === 'neox') {
    return signNeoXFulfillment(config, fulfillment);
  }
  const digestContext = resolveFulfillmentSigningContext(chain, fulfillment);
  // Bind the digest to the exact deployed contract + network so the signature
  // cannot be replayed across deployments/networks (matches the kernel's
  // ComputeFulfillmentDigest which appends the executing script hash + magic).
  if (chain === 'neo_n3') {
    digestContext.contractScriptHash = config?.neo_n3?.oracleContract || '';
    digestContext.networkMagic = config?.neo_n3?.networkMagic;
  }
  // Pass chain + kernel envelope fields so the digest matches the on-chain
  // contract's ComputeFulfillmentDigest. Legacy Neo N3 callbacks still use
  // the requestType-based digest when appId/moduleId/operation are absent.
  const digestBytes = buildFulfillmentDigestBytes(
    fulfillment.requestId,
    fulfillment.requestType,
    fulfillment.success,
    fulfillment.result,
    fulfillment.error,
    fulfillment.result_bytes_base64 || '',
    digestContext
  );
  if (chain === 'neo_n3') {
    const localVerifier = resolveLocalVerifierAccount(config);
    if (localVerifier) {
      return {
        signature: neonWallet.sign(digestBytes.toString('hex'), localVerifier.privateKey),
        public_key: localVerifier.publicKey,
        address: localVerifier.address,
        script_hash: `0x${localVerifier.scriptHash}`,
        source: 'relayer_local',
      };
    }
  }
  const response = await callNitro(
    config,
    '/sign/payload',
    {
      target_chain: chain,
      key_role: 'oracle_verifier',
      data_hex: digestBytes.toString('hex'),
    },
    { baseUrl: config.nitro.signerUrl }
  );
  if (!response.ok || typeof response.body?.signature !== 'string' || !response.body.signature) {
    throw new Error(
      typeof response.body?.error === 'string'
        ? response.body.error
        : `worker signing failed with status ${response.status}`
    );
  }
  return response.body;
}

async function fulfillNeoRequest(config, event, fulfillment, verification) {
  if (typeof config?.hooks?.fulfillNeoRequest === 'function') {
    return config.hooks.fulfillNeoRequest({
      event,
      requestId: event.requestId,
      fulfillment,
      verification,
    });
  }
  // Neo X (EVM): submit fulfillRequest via ethers to the MorpheusOracleEVM kernel.
  if (event.chain === 'neox') {
    return fulfillNeoXRequest(
      config,
      event.requestId,
      fulfillment.success,
      fulfillment.result,
      fulfillment.error,
      verification.signature,
      fulfillment.result_bytes_base64
    );
  }
  try {
    return await fulfillNeoN3Request(
      config,
      event.requestId,
      fulfillment.success,
      fulfillment.result,
      fulfillment.error,
      verification.signature,
      fulfillment.result_bytes_base64
    );
  } catch (error) {
    const message = normalizeErrorMessage(error);
    if (message.toLowerCase().includes('request not found') && event.chain === 'neo_n3') {
      // Keep the disambiguating chain/request context, but never inject the
      // oracle contract or RPC URL into the message — it can be finalized
      // on-chain as the request error. Endpoint diagnostics belong in logger
      // fields (processEvent already logs chain/request_id alongside the error).
      throw new Error(`${message} [chain=${event.chain} request_id=${event.requestId}]`);
    }
    throw error;
  }
}

export function buildPreparedFulfillmentRetryMeta(prepared = {}) {
  return {
    success: Boolean(prepared.success),
    result: typeof prepared.result === 'string' ? prepared.result : '',
    result_bytes_base64:
      typeof prepared.result_bytes_base64 === 'string' ? prepared.result_bytes_base64 : '',
    error: typeof prepared.error === 'string' ? prepared.error : '',
    route: typeof prepared.route === 'string' ? prepared.route : '',
    module_id: typeof prepared.module_id === 'string' ? prepared.module_id : '',
    operation: typeof prepared.operation === 'string' ? prepared.operation : '',
    worker_status: Number.isFinite(Number(prepared.worker_status))
      ? Number(prepared.worker_status)
      : null,
    worker_response:
      prepared.worker_response && typeof prepared.worker_response === 'object'
        ? prepared.worker_response
        : null,
    verification_signature:
      typeof prepared.verification_signature === 'string' ? prepared.verification_signature : '',
  };
}

function buildPreparedFulfillment(fulfillment, details = {}) {
  return buildPreparedFulfillmentRetryMeta({
    success: fulfillment.success,
    result: fulfillment.result || '',
    result_bytes_base64: fulfillment.result_bytes_base64 || '',
    error: fulfillment.error || '',
    route: details.route || '',
    module_id: details.module_id || '',
    operation: details.operation || '',
    worker_status: details.worker_status ?? null,
    worker_response: details.worker_response || null,
    verification_signature: details.verification_signature || '',
  });
}

function buildCallbackPendingWorkerResponse(prepared, kernelIntent) {
  const retryMeta = {
    prepared_fulfillment: buildPreparedFulfillmentRetryMeta(prepared),
    module_id: prepared.module_id || kernelIntent.moduleId,
    operation: prepared.operation || kernelIntent.operation,
  };
  if (prepared.worker_response && typeof prepared.worker_response === 'object') {
    return {
      ...prepared.worker_response,
      retry_meta: {
        ...(prepared.worker_response.retry_meta &&
        typeof prepared.worker_response.retry_meta === 'object'
          ? prepared.worker_response.retry_meta
          : {}),
        ...retryMeta,
      },
    };
  }
  return {
    retry_meta: retryMeta,
  };
}

async function checkpointPreparedFulfillment(
  config,
  logger,
  event,
  prepared,
  attempts,
  kernelIntent
) {
  const details = {
    event_key: buildEventKey(event),
    status: 'callback_pending',
    attempts,
    route: prepared.route,
    worker_status: prepared.worker_status,
    worker_response: buildCallbackPendingWorkerResponse(prepared, kernelIntent),
    next_retry_at: null,
  };

  if (config.durableQueue?.enabled) {
    if (ensureDurableQueueAvailable(config, logger, `${event.chain}:callback-pending-checkpoint`)) {
      try {
        await upsertJobOrThrow(event, details);
      } catch (error) {
        if (!isTransientDurableQueueError(error)) throw error;
        logger.warn(
          {
            chain: event.chain,
            request_id: event.requestId,
            event_key: details.event_key,
            error,
          },
          'Durable Supabase callback checkpoint unavailable; local prepared fulfillment is persisted'
        );
      }
      return;
    }
  }

  await maybeUpsertJob(logger, event, details);
}

async function deliverPreparedFulfillment(config, event, prepared) {
  const fulfillStartedAt = Date.now();
  const fulfillTx = await fulfillNeoRequest(
    config,
    event,
    {
      success: Boolean(prepared.success),
      result: prepared.result || '',
      error: prepared.error || '',
      result_bytes_base64: prepared.result_bytes_base64 || '',
    },
    { signature: prepared.verification_signature || '' }
  );
  const fulfillDurationMs = Date.now() - fulfillStartedAt;
  return {
    ...prepared,
    fulfill_tx: fulfillTx,
    durations_ms: {
      ...(prepared.durations_ms && typeof prepared.durations_ms === 'object'
        ? prepared.durations_ms
        : {}),
      fulfill: fulfillDurationMs,
    },
  };
}

async function finalizeFailedRequest(config, event, errorMessage) {
  const safeError = trimOnchainErrorMessage(errorMessage);
  const kernelIntent = resolveKernelIntent(event.requestType);
  const fulfillmentContext = resolveEventFulfillmentContext(event, kernelIntent);
  const verification = await signFulfillmentPayload(config, event.chain, {
    requestId: event.requestId,
    requestType: event.requestType,
    ...fulfillmentContext,
    success: false,
    result: '',
    result_bytes_base64: '',
    error: safeError,
  });
  const fulfillTx = await fulfillNeoRequest(
    config,
    event,
    {
      success: false,
      result: '',
      error: safeError,
      result_bytes_base64: '',
    },
    verification
  );
  return {
    success: false,
    result: '',
    error: safeError,
    route: 'failure-finalize',
    worker_response: null,
    worker_status: null,
    fulfill_tx: fulfillTx,
    verification_signature: verification.signature,
  };
}

export function enrichAutomationExecutionPayload(event, payload) {
  const normalizedRequestType = trimString(event?.requestType || '')
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (!normalizedRequestType.startsWith('automation_')) return payload;

  const automationId = trimString(payload?.automation_id || '');
  if (!automationId) return payload;

  const dispatch = buildUpkeepDispatch({
    chain: event.chain,
    automation_id: automationId,
    execution_id: trimString(payload.execution_id || '') || String(event.requestId || ''),
    workflow_id: trimString(payload.workflow_id || 'automation.upkeep'),
    request_id: trimString(payload.request_id || ''),
    idempotency_key: trimString(payload.idempotency_key || ''),
  });

  return {
    ...payload,
    workflow_id: payload.workflow_id || dispatch.workflow_id,
    workflow_version: payload.workflow_version || dispatch.workflow_version,
    execution_id: payload.execution_id || dispatch.execution_id,
    idempotency_key: payload.idempotency_key || dispatch.idempotency_key,
    replay_window: payload.replay_window || dispatch.replay_window,
    delivery_mode: payload.delivery_mode || dispatch.delivery_mode,
  };
}

export function isQueuedAutomationExecutionPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const automationId = trimString(payload.automation_id || payload.automationId || '');
  if (!automationId) return false;
  return Boolean(
    trimString(payload.workflow_id || payload.workflowId || '') ||
    trimString(payload.execution_id || payload.executionId || '') ||
    trimString(payload.idempotency_key || payload.idempotencyKey || '') ||
    trimString(payload.delivery_mode || payload.deliveryMode || '')
  );
}

async function prepareOracleFulfillment(config, event, logger = null) {
  // Ingestion gate: reject whitespace-bearing identifiers before any routing or
  // worker call (classified permanent -> on-chain failure finalize).
  assertEventIdentifiersClean(event);
  const payload = enrichAutomationExecutionPayload(event, decodePayloadText(event.payloadText));
  const kernelIntent = resolveKernelIntent(event.requestType);
  const fulfillmentContext = resolveEventFulfillmentContext(event, kernelIntent);
  if (isAutomationControlRequestType(event.requestType)) {
    const automationResponse = await handleAutomationControlRequest(event, payload);
    const fulfillment = encodeFulfillmentResult(event.requestType, automationResponse);
    const verification = await signFulfillmentPayload(config, event.chain, {
      requestId: event.requestId,
      requestType: event.requestType,
      ...fulfillmentContext,
      success: fulfillment.success,
      result: fulfillment.result || '',
      result_bytes_base64: fulfillment.result_bytes_base64 || '',
      error: fulfillment.error || '',
    });

    return buildPreparedFulfillment(fulfillment, {
      route: automationResponse.route,
      module_id: fulfillmentContext.moduleId,
      operation: fulfillmentContext.operation,
      worker_response: automationResponse.body,
      worker_status: automationResponse.status,
      verification_signature: verification.signature,
    });
  }
  if (isQueuedAutomationExecutionPayload(payload)) {
    const automationGuard = await guardQueuedAutomationExecution(event);
    if (automationGuard.blocked) {
      const guardResponse = {
        ok: false,
        status: 409,
        body: {
          mode: 'automation',
          action: 'execute',
          automation_id: automationGuard.automation_id,
          status: automationGuard.job?.status || 'cancelled',
          chain: event.chain,
          error: automationGuard.error,
        },
      };
      const fulfillment = encodeFulfillmentResult(event.requestType, guardResponse);
      const verification = await signFulfillmentPayload(config, event.chain, {
        requestId: event.requestId,
        requestType: event.requestType,
        ...fulfillmentContext,
        success: fulfillment.success,
        result: fulfillment.result || '',
        result_bytes_base64: fulfillment.result_bytes_base64 || '',
        error: fulfillment.error || '',
      });

      return buildPreparedFulfillment(fulfillment, {
        route: automationGuard.route,
        module_id: fulfillmentContext.moduleId,
        operation: fulfillmentContext.operation,
        worker_response: guardResponse.body,
        worker_status: guardResponse.status,
        verification_signature: verification.signature,
      });
    }
  }
  if (isOperatorOnlyRequestType(event.requestType)) {
    const verification = await signFulfillmentPayload(config, event.chain, {
      requestId: event.requestId,
      requestType: event.requestType,
      ...fulfillmentContext,
      success: false,
      result: '',
      result_bytes_base64: '',
      error:
        'datafeed requests are operator-only; users should read synchronized on-chain feed data',
    });
    return buildPreparedFulfillment(
      {
        success: false,
        result: '',
        error:
          'datafeed requests are operator-only; users should read synchronized on-chain feed data',
        result_bytes_base64: '',
      },
      {
        route: 'operator-only:rejected',
        module_id: fulfillmentContext.moduleId,
        operation: fulfillmentContext.operation,
        worker_response: null,
        worker_status: null,
        verification_signature: verification.signature,
      }
    );
  }
  // Local VRF handler: kernel random.generate needs no compute worker — verifiable
  // randomness is just 32 CSPRNG bytes signed by the oracle_verifier. Mirrors the
  // operator-only / automation local branches above (no callNitro). The on-chain
  // compact callback is the raw 32-byte randomness (resolveCompactCallbackBytes).
  if (kernelIntent.moduleId === 'random.generate') {
    const randomness = crypto.randomBytes(32).toString('hex');
    const vrfResponse = { ok: true, status: 200, body: { randomness } };
    const vrfFulfillment = encodeFulfillmentResult(event.requestType, vrfResponse);
    const vrfVerification = await signFulfillmentPayload(config, event.chain, {
      requestId: event.requestId,
      requestType: event.requestType,
      ...fulfillmentContext,
      success: vrfFulfillment.success,
      result: vrfFulfillment.result || '',
      result_bytes_base64: vrfFulfillment.result_bytes_base64 || '',
      error: vrfFulfillment.error || '',
    });
    return buildPreparedFulfillment(vrfFulfillment, {
      route: 'local:vrf',
      module_id: fulfillmentContext.moduleId,
      operation: fulfillmentContext.operation,
      worker_response: vrfResponse.body,
      worker_status: 200,
      verification_signature: vrfVerification.signature,
    });
  }
  // Confidential reveal: the request payload is an X25519 sealed envelope; the
  // enclave decrypts it and the plaintext becomes the on-chain fulfillment result
  // (Neo Message time-locked reveal). The kernel/contract already gated the
  // unlock time, so this is a trusted, relayer-mediated decrypt.
  if (kernelIntent.moduleId === 'confidential.decrypt') {
    const envelope = trimString(event.payloadText || '');
    const decResponse = await callNitro(config, '/oracle/decrypt', { envelope });
    const ok = decResponse.ok && typeof decResponse.body?.plaintext === 'string';
    const decryptFulfillment = ok
      ? {
          success: true,
          result: '',
          result_bytes_base64: Buffer.from(decResponse.body.plaintext, 'utf8').toString('base64'),
          error: '',
        }
      : {
          success: false,
          result: '',
          result_bytes_base64: '',
          error: trimOnchainErrorMessage(decResponse.body?.error || 'confidential decrypt failed'),
        };
    const decryptVerification = await signFulfillmentPayload(config, event.chain, {
      requestId: event.requestId,
      requestType: event.requestType,
      ...fulfillmentContext,
      success: decryptFulfillment.success,
      result: decryptFulfillment.result,
      result_bytes_base64: decryptFulfillment.result_bytes_base64,
      error: decryptFulfillment.error,
    });
    return buildPreparedFulfillment(decryptFulfillment, {
      route: 'oracle:decrypt',
      module_id: fulfillmentContext.moduleId,
      operation: fulfillmentContext.operation,
      worker_response: decResponse.body,
      worker_status: decResponse.status,
      verification_signature: decryptVerification.signature,
    });
  }
  const route = resolveWorkerRoute(event.requestType, payload);
  const workerPayload = buildWorkerPayload(
    event.chain,
    event.requestType,
    payload,
    event.requestId,
    {
      requester: event.requester,
      callbackContract: event.callbackContract,
      callbackMethod: event.callbackMethod,
    }
  );
  const workerStartedAt = Date.now();
  const workerResponse = await callNitro(config, route, workerPayload);
  const workerDurationMs = Date.now() - workerStartedAt;
  const fulfillment = encodeFulfillmentResult(event.requestType, workerResponse);
  const verificationStartedAt = Date.now();
  const verification = await signFulfillmentPayload(config, event.chain, {
    requestId: event.requestId,
    requestType: event.requestType,
    ...fulfillmentContext,
    success: fulfillment.success,
    result: fulfillment.result || '',
    result_bytes_base64: fulfillment.result_bytes_base64 || '',
    error: fulfillment.error || '',
  });
  const verificationDurationMs = Date.now() - verificationStartedAt;

  logger?.info(
    {
      chain: event.chain,
      request_id: event.requestId,
      request_type: event.requestType,
      route,
      worker_status: workerResponse.status,
      fulfillment_success: fulfillment.success,
      result_bytes_base64_present: Boolean(fulfillment.result_bytes_base64),
      result_length: typeof fulfillment.result === 'string' ? fulfillment.result.length : null,
      error_text: fulfillment.error || '',
    },
    'Prepared oracle fulfillment payload'
  );

  return buildPreparedFulfillment(fulfillment, {
    route,
    module_id: fulfillmentContext.moduleId,
    operation: fulfillmentContext.operation,
    worker_response: workerResponse.body,
    worker_status: workerResponse.status,
    verification_signature: verification.signature,
    durations_ms: {
      worker: workerDurationMs,
      verification: verificationDurationMs,
      total: workerDurationMs + verificationDurationMs,
    },
  });
}

async function processOracleRequest(config, event, logger = null) {
  const prepared = await prepareOracleFulfillment(config, event, logger);
  return deliverPreparedFulfillment(config, event, prepared);
}

// Dead-letter a delivery lane that is permanently failing or has exceeded the
// callback retry ceiling: record 'exhausted' locally (recordProcessedEvent
// pushes it into the chain's dead_letters) and mirror the status to the durable
// Supabase queue, which the /api/relayer/dead-letters lane already reads for
// manual replay.
async function recordDeliveryExhaustion(
  config,
  state,
  persistState,
  logger,
  event,
  kernelIntent,
  { attempts, route, errorMessage, errorClass, terminalError = null }
) {
  const eventKey = buildEventKey(event);
  const lastError = trimOnchainErrorMessage(errorMessage);
  incrementMetric(state, 'retries_exhausted_total');
  recordProcessedEvent(
    state,
    event.chain,
    event,
    'exhausted',
    {
      attempts,
      route,
      module_id: kernelIntent.moduleId,
      operation: kernelIntent.operation,
      last_error: lastError,
      ...(terminalError ? { terminal_error: terminalError } : {}),
    },
    config
  );
  clearRetryItem(state, event.chain, eventKey);
  persistState();

  await maybeUpsertJob(logger, event, {
    event_key: eventKey,
    status: 'exhausted',
    attempts,
    route,
    last_error: lastError,
    completed_at: new Date().toISOString(),
    next_retry_at: null,
  });

  logger.error(
    {
      chain: event.chain,
      request_id: event.requestId,
      request_type: event.requestType,
      module_id: kernelIntent.moduleId,
      operation: kernelIntent.operation,
      event_key: eventKey,
      attempts,
      route,
      error_class: errorClass,
      error: lastError,
      terminal_error: terminalError,
    },
    'Callback delivery retries exhausted; dead-lettered oracle request for manual replay'
  );
  return {
    event,
    error: lastError,
    retry_status: 'exhausted',
    event_key: eventKey,
    attempts,
  };
}

export async function processEvent(config, state, persistState, logger, event, retryItem = null) {
  const eventKey = buildEventKey(event);
  const kernelIntent = resolveKernelIntent(event.requestType);
  const attempts = retryItem?.attempts || 0;
  const processingStartedAt = Date.now();
  const requestAgeMs =
    Number.isFinite(Number(event.createdAtMs || 0)) && Number(event.createdAtMs || 0) > 0
      ? Math.max(processingStartedAt - Number(event.createdAtMs || 0), 0)
      : null;
  const isFinalizeOnly = Boolean(retryItem?.finalize_only);
  let preparedForRedelivery =
    retryItem?.prepared_fulfillment && typeof retryItem.prepared_fulfillment === 'object'
      ? buildPreparedFulfillmentRetryMeta(retryItem.prepared_fulfillment)
      : null;
  const terminalError = trimOnchainErrorMessage(
    retryItem?.terminal_error || retryItem?.last_error || 'request execution failed'
  );

  logger.info(
    {
      chain: event.chain,
      request_id: event.requestId,
      request_type: event.requestType,
      module_id: kernelIntent.moduleId,
      operation: kernelIntent.operation,
      event_key: eventKey,
      attempts,
      tx_hash: event.txHash,
      request_age_ms: requestAgeMs,
    },
    'Processing Morpheus oracle request'
  );

  const claimed = await claimDurableJobForProcessing(config, logger, event, retryItem);
  if (!claimed) {
    incrementMetric(state, 'claim_conflicts_total');
    clearRetryItem(state, event.chain, eventKey);
    persistState();
    return {
      event,
      skipped: true,
      event_key: eventKey,
      attempts,
      retry_status: 'claimed_elsewhere',
    };
  }

  await maybeUpsertJob(logger, event, {
    event_key: eventKey,
    status: retryItem ? 'retrying' : 'processing',
    attempts,
    next_retry_at: null,
  });

  try {
    let result;
    if (isFinalizeOnly) {
      result = await finalizeFailedRequest(config, event, terminalError);
      incrementMetric(state, 'fulfill_failure_total');
    } else if (preparedForRedelivery) {
      result = await deliverPreparedFulfillment(config, event, preparedForRedelivery);
      incrementMetric(state, result.success ? 'fulfill_success_total' : 'fulfill_failure_total');
    } else {
      incrementMetric(state, 'worker_calls_total');
      preparedForRedelivery = await prepareOracleFulfillment(config, event, logger);
      if (!preparedForRedelivery.success) incrementMetric(state, 'worker_failures_total');
      enqueueRetryItem(state, event.chain, event, {
        attempts,
        next_retry_at: Date.now() + computeRetryDelayMs(config, attempts + 1),
        first_failed_at: retryItem?.first_failed_at || new Date().toISOString(),
        last_error: 'callback_pending',
        prepared_fulfillment: buildPreparedFulfillmentRetryMeta(preparedForRedelivery),
        durable_claimed: retryItem?.durable_claimed,
      });
      persistState();
      await checkpointPreparedFulfillment(
        config,
        logger,
        event,
        preparedForRedelivery,
        attempts,
        kernelIntent
      );
      result = await deliverPreparedFulfillment(config, event, preparedForRedelivery);
      incrementMetric(state, result.success ? 'fulfill_success_total' : 'fulfill_failure_total');
    }
    incrementMetric(state, 'events_processed_total');

    recordProcessedEvent(
      state,
      event.chain,
      event,
      result.success ? 'fulfilled' : 'failed',
      {
        attempts,
        route: result.route,
        module_id: result.module_id || kernelIntent.moduleId,
        operation: result.operation || kernelIntent.operation,
        fulfill_tx: result.fulfill_tx,
        worker_status: result.worker_status,
        last_error: result.error || null,
        request_age_ms: requestAgeMs,
        total_duration_ms: Date.now() - processingStartedAt,
        durations_ms: result.durations_ms || null,
      },
      config
    );
    clearRetryItem(state, event.chain, eventKey);
    persistState();

    await maybeUpsertJob(logger, event, {
      event_key: eventKey,
      status: result.success ? 'fulfilled' : 'failed',
      attempts,
      route: result.route,
      worker_status: result.worker_status,
      worker_response:
        result.worker_response && typeof result.worker_response === 'object'
          ? {
              ...result.worker_response,
              kernel_intent: {
                module_id: result.module_id || kernelIntent.moduleId,
                operation: result.operation || kernelIntent.operation,
                legacy_request_type: kernelIntent.legacyRequestType,
              },
            }
          : result.worker_response,
      fulfill_tx: result.fulfill_tx,
      completed_at: new Date().toISOString(),
      next_retry_at: null,
    });

    logger.info(
      {
        chain: event.chain,
        request_id: event.requestId,
        request_type: event.requestType,
        module_id: result.module_id || kernelIntent.moduleId,
        operation: result.operation || kernelIntent.operation,
        event_key: eventKey,
        success: result.success,
        route: result.route,
        worker_status: result.worker_status,
        request_age_ms: requestAgeMs,
        total_duration_ms: Date.now() - processingStartedAt,
        durations_ms: result.durations_ms || null,
      },
      'Fulfilled Morpheus oracle request'
    );
    return { event, result, event_key: eventKey, attempts };
  } catch (error) {
    const message = normalizeErrorMessage(error);
    if (isAlreadyFulfilledError(message)) {
      recordProcessedEvent(
        state,
        event.chain,
        event,
        'settled',
        {
          attempts,
          route: isFinalizeOnly ? 'failure-finalize:already-fulfilled' : 'already-fulfilled',
          module_id: kernelIntent.moduleId,
          operation: kernelIntent.operation,
          last_error: trimOnchainErrorMessage(message),
        },
        config
      );
      clearRetryItem(state, event.chain, eventKey);
      persistState();

      await maybeUpsertJob(logger, event, {
        event_key: eventKey,
        status: 'settled',
        attempts,
        last_error: trimOnchainErrorMessage(message),
        completed_at: new Date().toISOString(),
        next_retry_at: null,
      });

      logger.info(
        {
          chain: event.chain,
          request_id: event.requestId,
          request_type: event.requestType,
          module_id: kernelIntent.moduleId,
          operation: kernelIntent.operation,
          event_key: eventKey,
          attempts,
        },
        'Oracle request was already settled on-chain'
      );
      return { event, result: null, event_key: eventKey, attempts, retry_status: 'settled' };
    }

    if (isTerminalConfigurationError(message)) {
      const terminalError = trimOnchainErrorMessage(message);
      incrementMetric(state, 'retries_exhausted_total');
      recordProcessedEvent(
        state,
        event.chain,
        event,
        'exhausted',
        {
          attempts,
          route: isFinalizeOnly ? 'failure-finalize:config-error' : 'config-error',
          module_id: kernelIntent.moduleId,
          operation: kernelIntent.operation,
          last_error: terminalError,
        },
        config
      );
      clearRetryItem(state, event.chain, eventKey);
      persistState();

      await maybeUpsertJob(logger, event, {
        event_key: eventKey,
        status: 'failed_config',
        attempts,
        last_error: terminalError,
        completed_at: new Date().toISOString(),
        next_retry_at: null,
      });

      logger.error(
        {
          chain: event.chain,
          request_id: event.requestId,
          request_type: event.requestType,
          module_id: kernelIntent.moduleId,
          operation: kernelIntent.operation,
          event_key: eventKey,
          attempts,
          error: terminalError,
        },
        'Relayer stopped retrying due to a terminal configuration or authorization error'
      );
      return {
        event,
        error: terminalError,
        retry_status: 'terminal',
        event_key: eventKey,
        attempts,
      };
    }

    if (preparedForRedelivery) {
      const nextAttempts = attempts + 1;
      // Delivery errors never reach scheduleRetry, so enforce the callback
      // ceiling here and short-circuit permanently failing callbacks (e.g. a
      // consumer contract that FAULTs on every test invoke) to the dead-letter
      // lane instead of redelivering the same prepared payload forever.
      const deliveryErrorClass = classifyError(message);
      if (
        deliveryErrorClass === 'permanent' ||
        nextAttempts > resolveCallbackRetryCeiling(config)
      ) {
        return recordDeliveryExhaustion(config, state, persistState, logger, event, kernelIntent, {
          attempts: nextAttempts,
          route: preparedForRedelivery.route || 'callback-delivery',
          errorMessage: message,
          errorClass: deliveryErrorClass,
        });
      }
      const retryItemNext = enqueueRetryItem(state, event.chain, event, {
        attempts: nextAttempts,
        next_retry_at: Date.now() + computeRetryDelayMs(config, nextAttempts),
        first_failed_at: retryItem?.first_failed_at || new Date().toISOString(),
        last_error: trimOnchainErrorMessage(message),
        prepared_fulfillment: buildPreparedFulfillmentRetryMeta(preparedForRedelivery),
      });
      incrementMetric(state, 'retries_scheduled_total');
      persistState();

      await maybeUpsertJob(logger, event, {
        event_key: eventKey,
        status: 'callback_retry_scheduled',
        attempts: retryItemNext.attempts,
        route: preparedForRedelivery.route,
        worker_status: preparedForRedelivery.worker_status,
        last_error: retryItemNext.last_error,
        next_retry_at: new Date(retryItemNext.next_retry_at).toISOString(),
        worker_response: buildCallbackPendingWorkerResponse(preparedForRedelivery, kernelIntent),
      });

      logger.warn(
        {
          chain: event.chain,
          request_id: event.requestId,
          request_type: event.requestType,
          module_id: preparedForRedelivery.module_id || kernelIntent.moduleId,
          operation: preparedForRedelivery.operation || kernelIntent.operation,
          event_key: eventKey,
          attempts: retryItemNext.attempts,
          retry_at: retryItemNext.next_retry_at,
          error: retryItemNext.last_error,
        },
        'Retrying prepared Morpheus oracle callback delivery'
      );
      return {
        event,
        error: retryItemNext.last_error,
        retry_status: 'callback_retry_scheduled',
        event_key: eventKey,
        attempts: retryItemNext.attempts,
      };
    }

    if (isFinalizeOnly) {
      const nextAttempts = attempts + 1;
      // The failure-finalize lane re-enqueues without scheduleRetry too: cap it
      // and dead-letter a finalize callback that fails permanently.
      const finalizeErrorClass = classifyError(message);
      if (
        finalizeErrorClass === 'permanent' ||
        nextAttempts > resolveCallbackRetryCeiling(config)
      ) {
        return recordDeliveryExhaustion(config, state, persistState, logger, event, kernelIntent, {
          attempts: nextAttempts,
          route: 'failure-finalize',
          errorMessage: message,
          errorClass: finalizeErrorClass,
          terminalError,
        });
      }
      const retryItemNext = enqueueRetryItem(state, event.chain, event, {
        attempts: nextAttempts,
        next_retry_at: Date.now() + computeRetryDelayMs(config, nextAttempts),
        first_failed_at: retryItem?.first_failed_at || new Date().toISOString(),
        last_error: trimOnchainErrorMessage(message),
        finalize_only: true,
        terminal_error: terminalError,
      });
      incrementMetric(state, 'retries_scheduled_total');
      persistState();

      await maybeUpsertJob(logger, event, {
        event_key: eventKey,
        status: 'failure_callback_retry_scheduled',
        attempts: retryItemNext.attempts,
        last_error: retryItemNext.last_error,
        next_retry_at: new Date(retryItemNext.next_retry_at).toISOString(),
        worker_response: {
          retry_meta: {
            finalize_only: true,
            terminal_error: terminalError,
            module_id: kernelIntent.moduleId,
            operation: kernelIntent.operation,
          },
        },
      });

      logger.warn(
        {
          chain: event.chain,
          request_id: event.requestId,
          request_type: event.requestType,
          module_id: kernelIntent.moduleId,
          operation: kernelIntent.operation,
          event_key: eventKey,
          attempts: retryItemNext.attempts,
          retry_at: retryItemNext.next_retry_at,
          error: retryItemNext.last_error,
        },
        'Retrying terminal failure callback delivery'
      );
      return {
        event,
        error: retryItemNext.last_error,
        retry_status: 'scheduled',
        event_key: eventKey,
        attempts: retryItemNext.attempts,
      };
    }

    const errorClass = classifyError(message);
    const forceDead = errorClass === 'permanent';
    const retry = forceDead
      ? { status: 'exhausted', key: eventKey, attempts: attempts + 1, error: message }
      : scheduleRetry(state, event.chain, event, message, config);

    if (retry.status === 'exhausted') {
      incrementMetric(state, 'retries_exhausted_total');
      try {
        const result = await finalizeFailedRequest(config, event, message);
        incrementMetric(state, 'events_processed_total');
        incrementMetric(state, 'events_failed_total');
        incrementMetric(state, 'fulfill_failure_total');
        recordProcessedEvent(
          state,
          event.chain,
          event,
          'failed',
          {
            attempts: retry.attempts,
            route: result.route,
            module_id: result.module_id || kernelIntent.moduleId,
            operation: result.operation || kernelIntent.operation,
            fulfill_tx: result.fulfill_tx,
            worker_status: null,
            last_error: result.error,
          },
          config
        );
        clearRetryItem(state, event.chain, eventKey);
        persistState();

        await maybeUpsertJob(logger, event, {
          event_key: eventKey,
          status: 'failed',
          attempts: retry.attempts,
          last_error: result.error,
          fulfill_tx: result.fulfill_tx,
          completed_at: new Date().toISOString(),
          next_retry_at: null,
        });

        logger.warn(
          {
            chain: event.chain,
            request_id: event.requestId,
            request_type: event.requestType,
            event_key: eventKey,
            attempts: retry.attempts,
            error: result.error,
          },
          'Finalized oracle request with an on-chain failure callback'
        );
        return { event, result, event_key: eventKey, attempts: retry.attempts };
      } catch (finalizeError) {
        const nextAttempts = retry.attempts + 1;
        const finalizeErrorClass = classifyError(finalizeError);
        if (
          finalizeErrorClass === 'permanent' ||
          nextAttempts > resolveCallbackRetryCeiling(config)
        ) {
          return recordDeliveryExhaustion(
            config,
            state,
            persistState,
            logger,
            event,
            kernelIntent,
            {
              attempts: nextAttempts,
              route: 'failure-finalize',
              errorMessage: finalizeError,
              errorClass: finalizeErrorClass,
              terminalError: trimOnchainErrorMessage(message),
            }
          );
        }
        const retryItemNext = enqueueRetryItem(state, event.chain, event, {
          attempts: nextAttempts,
          next_retry_at: Date.now() + computeRetryDelayMs(config, nextAttempts),
          first_failed_at: new Date().toISOString(),
          last_error: trimOnchainErrorMessage(finalizeError),
          finalize_only: true,
          terminal_error: trimOnchainErrorMessage(message),
        });
        incrementMetric(state, 'retries_scheduled_total');
        persistState();

        await maybeUpsertJob(logger, event, {
          event_key: eventKey,
          status: 'failure_callback_retry_scheduled',
          attempts: retryItemNext.attempts,
          last_error: retryItemNext.last_error,
          next_retry_at: new Date(retryItemNext.next_retry_at).toISOString(),
          worker_response: {
            retry_meta: {
              finalize_only: true,
              terminal_error: trimOnchainErrorMessage(message),
              module_id: kernelIntent.moduleId,
              operation: kernelIntent.operation,
            },
          },
        });

        logger.error(
          {
            chain: event.chain,
            request_id: event.requestId,
            request_type: event.requestType,
            module_id: kernelIntent.moduleId,
            operation: kernelIntent.operation,
            event_key: eventKey,
            attempts: retryItemNext.attempts,
            error: retryItemNext.last_error,
          },
          'Primary execution exhausted; retrying terminal failure callback'
        );
        return {
          event,
          error: retryItemNext.last_error,
          retry_status: 'scheduled',
          event_key: eventKey,
          attempts: retryItemNext.attempts,
        };
      }
    }

    incrementMetric(state, 'retries_scheduled_total');
    persistState();

    await maybeUpsertJob(logger, event, {
      event_key: eventKey,
      status: 'retry_scheduled',
      attempts: retry.item.attempts,
      last_error: message,
      next_retry_at: new Date(retry.item.next_retry_at).toISOString(),
    });

    logger.warn(
      {
        chain: event.chain,
        request_id: event.requestId,
        request_type: event.requestType,
        module_id: kernelIntent.moduleId,
        operation: kernelIntent.operation,
        event_key: eventKey,
        attempts: retry.item.attempts,
        retry_at: retry.item.next_retry_at,
        error_class: errorClass,
        error: message,
      },
      'Scheduled Morpheus oracle request retry'
    );
    return {
      event,
      error: message,
      error_class: errorClass,
      retry_status: 'scheduled',
      event_key: eventKey,
      attempts: retry.item.attempts,
    };
  }
}

export { finalizeFailedRequest, processOracleRequest };
