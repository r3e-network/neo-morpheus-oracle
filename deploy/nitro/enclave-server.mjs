// Morpheus Oracle — compute-in-enclave server (Phase 0, LOCAL).
//
// A single Node process that does the oracle COMPUTE and the on-chain SIGN
// atomically: it computes the result IN-PROCESS by reusing the worker `handler`
// (no host hop between compute and signature) and signs the EXACT on-chain
// fulfillment digest the relayer produces — byte-for-byte — so the on-chain
// `fulfillRequest` verification is unchanged.
//
// CONSENSUS-CRITICAL: the digest, the result envelope and the compact callback
// bytes are NEVER re-derived here. We IMPORT the canonical builders from the
// relayer (`router.js` / `neox.js`) and feed them the same inputs the relayer's
// `prepareOracleFulfillment` feeds them, so the produced signature is identical
// to today's relayer-path signature. The only thing this server changes is WHERE
// the compute happens (in-process, inside the measured boundary) and that the
// signer never sees a caller-supplied `data_hex` for the attested tier.
//
// Phase 0 scope: `POST /oracle/fulfill` (atomic compute+sign) + `GET /health`.
// `/attestation`, `/feed/sign` and `/sign/payload` are out of scope here.

import http from 'node:http';

// Canonical compute reuse — the worker's default export `handler(Request)=>Response`.
import workerHandler from '../../workers/nitro-worker/src/worker.js';

// Canonical digest/result builders — IMPORTED, never re-derived.
//   - encodeFulfillmentResult wraps resolveCompactCallbackBytes + buildOnchainResultEnvelope
//     (resolveCompactCallbackBytes is NOT exported from router.js, so we use the
//     exported wrapper that the relayer itself uses to produce {success, result,
//     result_bytes_base64?, error}). See router.js:586 encodeFulfillmentResult.
//   - buildOnchainResultEnvelope is imported separately for the `verification` field
//     (it equals the JSON the relayer puts on-chain as `result`).
import {
  buildFulfillmentDigestBytes,
  buildWorkerPayload,
  buildOnchainResultEnvelope,
  encodeFulfillmentResult,
  resolveKernelIntent,
  resolveWorkerRoute,
} from '../../workers/morpheus-relayer/src/router.js';

// Canonical EVM digest + signer.
import { buildNeoXDigest, signNeoXFulfillment, resolveResultBytesHex } from '../../workers/morpheus-relayer/src/neox.js';

// Signer role/key resolution — the SAME resolution the enclave signer
// (nitro-signer-server.mjs) uses: reportPinnedNeoN3Role -> materialized key ->
// neon-js wallet.sign (secp256r1). Those functions are not exported from the
// signer server, so we reuse the shared resolver + sign inline with neon-js.
import { reportPinnedNeoN3Role, normalizeMorpheusNetwork } from '../../scripts/lib-neo-signers.mjs';
import { wallet as neoWallet } from '@cityofzion/neon-js';

const DEFAULT_PORT = 8787;
const MAX_BODY_BYTES = Math.max(Number(process.env.ENCLAVE_MAX_BODY_BYTES || 262144), 1024);

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeHex(value) {
  return trimString(value).replace(/^0x/i, '').toLowerCase();
}

function resolveNetwork() {
  return normalizeMorpheusNetwork(process.env.MORPHEUS_NETWORK || 'testnet');
}

// Worker auth: the worker `handler` requires an Authorization header matching one
// of its configured secrets (platform/auth.js requireAuth). We resolve the same
// secret from env and attach it to the in-process Request so the compute call is
// authorized exactly as a host->worker call would be.
function resolveWorkerAuthToken() {
  for (const name of [
    'NITRO_API_TOKEN',
    'PHALA_API_TOKEN',
    'NITRO_SHARED_SECRET',
    'PHALA_SHARED_SECRET',
  ]) {
    const value = trimString(process.env[name]);
    if (value) return value;
  }
  return '';
}

// ---------------------------------------------------------------------------
// In-process compute (reuses worker `handler`) -> {ok, status, body}
// ---------------------------------------------------------------------------
// Mirrors callNitro's return shape (nitro.js: {ok, status, body}) so the imported
// encodeFulfillmentResult / buildOnchainResultEnvelope consume it unchanged.

// The active worker handler. Defaults to the REAL imported worker `handler`
// (so production computes in-process via the real worker). Tests override it via
// __setWorkerHandlerForTests to make compute deterministic WITHOUT touching the
// worker source — the test then asserts the digest/envelope/signature pipeline
// (the consensus-critical part) against a fixed result body.
let activeWorkerHandler = workerHandler;

export function __setWorkerHandlerForTests(fn) {
  activeWorkerHandler = typeof fn === 'function' ? fn : workerHandler;
}

export function __resetWorkerHandlerForTests() {
  activeWorkerHandler = workerHandler;
}

async function computeViaWorker(route, workerPayload) {
  const token = resolveWorkerAuthToken();
  const headers = new Headers({ 'content-type': 'application/json' });
  if (token) {
    headers.set('authorization', `Bearer ${token}`);
    headers.set('x-nitro-token', token);
  }
  const request = new Request(`http://127.0.0.1${route}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(workerPayload),
  });
  const response = await activeWorkerHandler(request);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  return { ok: response.ok, status: response.status, body };
}

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

// Resolve + sign with the oracle_verifier secp256r1 (Neo N3) key, using the SAME
// role/key resolution the enclave signer uses (reportPinnedNeoN3Role) and the
// SAME signing primitive (neon-js wallet.sign over the digest hex).
function signNeoN3OracleVerifier(digestBytes) {
  const network = resolveNetwork();
  const report = reportPinnedNeoN3Role(network, 'oracle_verifier', {
    env: process.env,
    allowMissing: false,
  });
  if (!report.ok || !report.materialized) {
    throw new Error('oracle_verifier signer is not configured or does not match pinned identity');
  }
  const secret = report.materialized.private_key || report.materialized.wif;
  const account = new neoWallet.Account(secret);
  const digestHex = Buffer.isBuffer(digestBytes) ? digestBytes.toString('hex') : normalizeHex(digestBytes);
  const signature = neoWallet.sign(digestHex, account.privateKey);
  return {
    signature,
    public_key: account.publicKey,
    address: account.address,
    script_hash: `0x${account.scriptHash}`,
    source: 'enclave_oracle_verifier',
  };
}

// Build a config-shaped object for the EVM digest/sign builders from the request's
// fulfillment_context (chain_id + oracle_contract) + the verifier key from env.
function resolveNeoXConfig(fulfillmentContext) {
  const chainId = Number(fulfillmentContext.chain_id ?? fulfillmentContext.chainId);
  const oracleContract = trimString(
    fulfillmentContext.oracle_contract || fulfillmentContext.oracleContract || ''
  );
  const verifierPrivateKey = trimString(
    process.env.MORPHEUS_NEOX_VERIFIER_PRIVATE_KEY ||
      process.env.MORPHEUS_NEOX_VERIFIER_KEY ||
      process.env.NEOX_VERIFIER_PK ||
      ''
  );
  const updaterPrivateKey = trimString(
    process.env.MORPHEUS_NEOX_UPDATER_PRIVATE_KEY || process.env.NEOX_UPDATER_PK || ''
  );
  if (!Number.isFinite(chainId) || chainId <= 0) {
    throw new Error('neox fulfillment_context.chain_id is required');
  }
  if (!oracleContract) {
    throw new Error('neox fulfillment_context.oracle_contract is required');
  }
  if (!verifierPrivateKey && !updaterPrivateKey) {
    throw new Error('neox verifier private key is not configured');
  }
  return { neox: { chainId, oracleContract, verifierPrivateKey, updaterPrivateKey } };
}

// ---------------------------------------------------------------------------
// /oracle/fulfill — atomic compute + sign
// ---------------------------------------------------------------------------

function normalizeChain(value) {
  const chain = trimString(value).toLowerCase();
  if (chain === 'neox') return 'neox';
  if (chain === 'legacy') return 'legacy';
  return 'neo_n3';
}

// The arbitrary-URL fetch lane cannot be covered by the enclave egress allow-list,
// so it stays host-tier and is NOT signed in-enclave (Phase 0 returns a
// host-unattested marker without computing/signing). The smart-fetch route serves
// BOTH a named-provider lane (payload.symbol -> twelvedata/binance/coinbase, which
// IS allow-listable + attestable) and the arbitrary-URL lane (payload.url, which
// is NOT). Only the latter — an explicit arbitrary URL — is host-tier; a
// symbol/provider smart-fetch is treated as attested (it hits named providers).
// (Matches oracle/fetch.js: payload.url present == arbitrary URL fetch.)
function isHostUnattestedLane(kernelIntent, payload) {
  if (kernelIntent.workerRoute !== '/oracle/smart-fetch') return false;
  return Boolean(trimString(payload?.url || ''));
}

// Build the {ok, status, body} workerResponse for the request, computing in-process.
// Mirrors prepareOracleFulfillment's lane selection:
//   - confidential.decrypt -> /oracle/decrypt with {envelope: payloadText}
//   - everything else (incl. random.generate VRF) -> the kernel route with the
//     buildWorkerPayload-decorated payload (VRF computed in-enclave via /vrf/random,
//     which the relayer today short-circuits with crypto.randomBytes — moving it
//     in-enclave is the intended Phase >=0 behavior).
async function computeWorkerResponse(chain, requestType, payload, requestId, kernelIntent, context) {
  if (kernelIntent.moduleId === 'confidential.decrypt') {
    const envelope = trimString(context.payloadText || payload?.envelope || '');
    return computeViaWorker('/oracle/decrypt', { ...payload, envelope });
  }
  const route = resolveWorkerRoute(requestType, payload);
  const workerPayload = buildWorkerPayload(chain, requestType, payload, requestId, {
    requester: context.requester,
    callbackContract: context.callbackContract,
    callbackMethod: context.callbackMethod,
  });
  return computeViaWorker(route, workerPayload);
}

export async function handleOracleFulfill(requestBody) {
  const chain = normalizeChain(requestBody?.chain);
  const requestType = trimString(requestBody?.request_type || requestBody?.requestType || '');
  const requestId = trimString(
    requestBody?.request_id ?? requestBody?.requestId ?? ''
  );
  const payload =
    requestBody?.payload && typeof requestBody.payload === 'object' && !Array.isArray(requestBody.payload)
      ? requestBody.payload
      : {};
  const fulfillmentContext =
    requestBody?.fulfillment_context && typeof requestBody.fulfillment_context === 'object'
      ? requestBody.fulfillment_context
      : {};
  const nonce = normalizeHex(requestBody?.nonce || '');

  if (!requestType) throw httpError(400, 'request_type is required');
  if (!requestId) throw httpError(400, 'request_id is required');

  const kernelIntent = resolveKernelIntent(requestType);

  // Kernel envelope fields the digest binds (verbatim — matches the relayer's
  // resolveEventFulfillmentContext: prefer the on-chain identifiers, fall back to
  // the kernel-intent mapping only for genuinely absent fields).
  const appId = String(fulfillmentContext.app_id ?? fulfillmentContext.appId ?? '');
  const moduleId =
    String(fulfillmentContext.module_id ?? fulfillmentContext.moduleId ?? '') ||
    String(kernelIntent.moduleId ?? '');
  const operation =
    String(fulfillmentContext.operation ?? '') || String(kernelIntent.operation ?? '');

  // Host-unattested tier: arbitrary-URL fetch is not computed/signed in-enclave.
  if (isHostUnattestedLane(kernelIntent, payload)) {
    return {
      status: 'host-unattested',
      success: false,
      result: '',
      error: 'arbitrary-url fetch is host-tier (not attested in-enclave)',
      signature: null,
      public_key: null,
      fulfillment_digest_hex: null,
      verification: null,
      trust_tier: 'host-unattested',
    };
  }

  const context = {
    requester: trimString(payload.requester || ''),
    callbackContract: trimString(payload.callback_contract || ''),
    callbackMethod: trimString(payload.callback_method || ''),
    payloadText: requestBody?.payload_text ?? payload?.payload_text ?? payload?.envelope ?? '',
  };

  // (a)+(b) COMPUTE in-process.
  const workerResponse = await computeWorkerResponse(
    chain,
    requestType,
    payload,
    requestId,
    kernelIntent,
    context
  );

  // (c) Encode the on-chain fulfillment fields + result envelope via the CANONICAL
  // builders (identical to the relayer's prepareOracleFulfillment encoding).
  const fulfillment = encodeFulfillmentResult(requestType, workerResponse);
  const verification = buildOnchainResultEnvelope(requestType, workerResponse);

  const success = Boolean(fulfillment.success);
  const result = fulfillment.result || '';
  const resultBytesBase64 = fulfillment.result_bytes_base64 || '';
  const error = fulfillment.error || '';

  // (d)+(e) BUILD the digest with the imported canonical builder + SIGN atomically.
  let signed;
  let digestHex;
  if (chain === 'neox') {
    const neoxConfig = resolveNeoXConfig(fulfillmentContext);
    const evmFulfillment = {
      requestId,
      appId,
      moduleId,
      operation,
      success,
      result,
      result_bytes_base64: resultBytesBase64,
      error,
    };
    const resultBytesHex = resolveResultBytesHex(result, resultBytesBase64);
    digestHex = buildNeoXDigest(neoxConfig, evmFulfillment, resultBytesHex);
    signed = await signNeoXFulfillment(neoxConfig, evmFulfillment);
  } else {
    // Neo N3 / legacy: bind to the executing contract + network magic when supplied
    // (matches signFulfillmentPayload, which appends contractScriptHash + magic).
    const digestContext = {
      chain,
      appId,
      moduleId,
      operation,
      contractScriptHash: trimString(
        fulfillmentContext.contract_script_hash || fulfillmentContext.contractScriptHash || ''
      ),
      networkMagic: fulfillmentContext.network_magic ?? fulfillmentContext.networkMagic,
    };
    const digestBytes = buildFulfillmentDigestBytes(
      requestId,
      requestType,
      success,
      result,
      error,
      resultBytesBase64,
      digestContext
    );
    digestHex = digestBytes.toString('hex');
    signed = signNeoN3OracleVerifier(digestBytes);
  }

  // (f) Return the contract. result_bytes_base64 only present for compact lanes
  // (vrf/neodid). nonce echoed for the relayer/verifier freshness binding.
  const response = {
    status: 'ok',
    success,
    result,
    error,
    signature: signed.signature,
    public_key: signed.public_key,
    fulfillment_digest_hex: digestHex,
    verification,
    trust_tier: 'enclave-attested',
  };
  if (resultBytesBase64) response.result_bytes_base64 = resultBytesBase64;
  if (nonce) response.nonce = nonce;
  return response;
}

// ---------------------------------------------------------------------------
// /health — compute + signer readiness
// ---------------------------------------------------------------------------

export function handleHealth() {
  const network = resolveNetwork();
  let signerOk = false;
  let signerError = null;
  let verifierPublicKey = null;
  try {
    const report = reportPinnedNeoN3Role(network, 'oracle_verifier', {
      env: process.env,
      allowMissing: false,
    });
    signerOk = report.ok && Boolean(report.materialized);
    verifierPublicKey = report.public_key || null;
    if (!signerOk && report.issues?.length) signerError = report.issues.join('; ');
  } catch (error) {
    signerError = error instanceof Error ? error.message : String(error);
  }
  const computeReady = typeof activeWorkerHandler === 'function';
  const ready = computeReady && signerOk;
  return {
    status: ready ? 'ok' : 'degraded',
    ready,
    runtime: 'morpheus-enclave-server',
    network,
    checks: {
      compute: computeReady,
      signer: signerOk,
      ...(verifierPublicKey ? { oracle_verifier_public_key: verifierPublicKey } : {}),
    },
    ...(signerError ? { signer_error: signerError } : {}),
  };
}

// ---------------------------------------------------------------------------
// dispatch — pure (no socket), unit-testable
// ---------------------------------------------------------------------------

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/**
 * Pure request dispatcher. Returns { status, body } with body a plain object.
 *   method  — HTTP method
 *   rawUrl  — request URL (path; absolute or relative)
 *   headers — header map (object)
 *   body    — raw request body string (or already-parsed object)
 */
export async function dispatch(method, rawUrl, headers = {}, body = '') {
  const hostHeader = trimString(headers.host || headers.Host || '') || '127.0.0.1';
  const url = new URL(rawUrl || '/', `http://${hostHeader}`);
  const path = url.pathname.replace(/\/$/, '') || '/';
  const httpMethod = trimString(method || 'GET').toUpperCase();

  try {
    if (httpMethod === 'GET' && path.endsWith('/health')) {
      const health = handleHealth();
      return { status: health.ready ? 200 : 503, body: health };
    }

    if (httpMethod === 'POST' && path.endsWith('/oracle/fulfill')) {
      const parsed = parseBody(body);
      const result = await handleOracleFulfill(parsed);
      return { status: 200, body: result };
    }

    return { status: 404, body: { error: 'not found', path } };
  } catch (error) {
    const status = Number(error?.status) || 500;
    return {
      status,
      body: {
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        runtime: 'morpheus-enclave-server',
      },
    };
  }
}

function parseBody(body) {
  if (body && typeof body === 'object') return body;
  const text = trimString(body);
  if (!text) return {};
  return JSON.parse(text);
}

// ---------------------------------------------------------------------------
// HTTP server (thin shim over dispatch)
// ---------------------------------------------------------------------------

async function readBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      throw httpError(413, 'request body too large');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function createServer() {
  return http.createServer(async (req, res) => {
    let bodyText = '';
    try {
      bodyText = req.method === 'GET' || req.method === 'HEAD' ? '' : await readBody(req);
    } catch (error) {
      const status = Number(error?.status) || 400;
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ status: 'error', error: error.message }));
      return;
    }
    const result = await dispatch(req.method || 'GET', req.url || '/', req.headers || {}, bodyText);
    res.writeHead(result.status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(result.body));
  });
}

// Start the server only when run directly (never when imported by the test).
const isMain = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}`;
  } catch {
    return false;
  }
})();

if (isMain) {
  const port = Math.max(Number(process.env.PORT || process.env.ENCLAVE_PORT || DEFAULT_PORT), 1);
  const host = trimString(process.env.ENCLAVE_HOST || process.env.HOST || '0.0.0.0');
  createServer().listen(port, host, () => {
    console.log(
      JSON.stringify({
        level: 'info',
        msg: 'morpheus enclave-server listening',
        host,
        port,
        network: resolveNetwork(),
      })
    );
  });
}
