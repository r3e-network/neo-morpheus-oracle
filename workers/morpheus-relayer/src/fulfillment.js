import { callPhala } from './phala.js';
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
  maybeUpsertJob,
  upsertJobOrThrow,
} from './queue.js';
import { reportPinnedNeoN3Role, resolvePinnedNeoN3VerifierPublicKey } from './lib/neo-signers.js';
import { wallet as neonWallet } from '@cityofzion/neon-js';

import { normalizeErrorMessage } from './feed-sync.js';
import { trimString } from '@neo-morpheus-oracle/shared/utils';
export { normalizeErrorMessage };

export function trimOnchainErrorMessage(value, maxLength = 240) {
  const text = normalizeErrorMessage(value).trim();
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

export function resolveFulfillmentSigningContext(chain, fulfillment = {}) {
  const normalizedChain = trimString(chain || '') || 'neo_n3';
  const appId = trimString(fulfillment.appId || '');
  const moduleId = trimString(fulfillment.moduleId || '');
  const operation = trimString(fulfillment.operation || '');

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
  const digestContext = resolveFulfillmentSigningContext(chain, fulfillment);
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
  const response = await callPhala(config, '/sign/payload', {
    target_chain: chain,
    key_role: 'oracle_verifier',
    data_hex: digestBytes.toString('hex'),
  });
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
      const oracleContract = trimString(config?.neo_n3?.oracleContract || '');
      const rpcUrl = trimString(config?.neo_n3?.rpcUrl || '');
      throw new Error(
        `${message} [chain=${event.chain} request_id=${event.requestId} oracle_contract=${oracleContract} rpc_url=${rpcUrl}]`
      );
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
      await upsertJobOrThrow(event, details);
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
  const verification = await signFulfillmentPayload(config, event.chain, {
    requestId: event.requestId,
    requestType: event.requestType,
    appId: event.appId || '',
    moduleId: kernelIntent.moduleId,
    operation: kernelIntent.operation,
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

async function prepareOracleFulfillment(config, event, logger = null) {
  const payload = enrichAutomationExecutionPayload(event, decodePayloadText(event.payloadText));
  const kernelIntent = resolveKernelIntent(event.requestType);
  if (isAutomationControlRequestType(event.requestType)) {
    const automationResponse = await handleAutomationControlRequest(event, payload);
    const fulfillment = encodeFulfillmentResult(event.requestType, automationResponse);
    const verification = await signFulfillmentPayload(config, event.chain, {
      requestId: event.requestId,
      requestType: event.requestType,
      appId: event.appId || '',
      moduleId: kernelIntent.moduleId,
      operation: kernelIntent.operation,
      success: fulfillment.success,
      result: fulfillment.result || '',
      result_bytes_base64: fulfillment.result_bytes_base64 || '',
      error: fulfillment.error || '',
    });

    return buildPreparedFulfillment(fulfillment, {
      route: automationResponse.route,
      module_id: kernelIntent.moduleId,
      operation: kernelIntent.operation,
      worker_response: automationResponse.body,
      worker_status: automationResponse.status,
      verification_signature: verification.signature,
    });
  }
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
      appId: event.appId || '',
      moduleId: kernelIntent.moduleId,
      operation: kernelIntent.operation,
      success: fulfillment.success,
      result: fulfillment.result || '',
      result_bytes_base64: fulfillment.result_bytes_base64 || '',
      error: fulfillment.error || '',
    });

    return buildPreparedFulfillment(fulfillment, {
      route: automationGuard.route,
      module_id: kernelIntent.moduleId,
      operation: kernelIntent.operation,
      worker_response: guardResponse.body,
      worker_status: guardResponse.status,
      verification_signature: verification.signature,
    });
  }
  if (isOperatorOnlyRequestType(event.requestType)) {
    const verification = await signFulfillmentPayload(config, event.chain, {
      requestId: event.requestId,
      requestType: event.requestType,
      appId: event.appId || '',
      moduleId: kernelIntent.moduleId,
      operation: kernelIntent.operation,
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
        module_id: kernelIntent.moduleId,
        operation: kernelIntent.operation,
        worker_response: null,
        worker_status: null,
        verification_signature: verification.signature,
      }
    );
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
  const workerResponse = await callPhala(config, route, workerPayload);
  const workerDurationMs = Date.now() - workerStartedAt;
  const fulfillment = encodeFulfillmentResult(event.requestType, workerResponse);
  const verificationStartedAt = Date.now();
  const verification = await signFulfillmentPayload(config, event.chain, {
    requestId: event.requestId,
    requestType: event.requestType,
    appId: event.appId || '',
    moduleId: kernelIntent.moduleId,
    operation: kernelIntent.operation,
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
    module_id: kernelIntent.moduleId,
    operation: kernelIntent.operation,
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
