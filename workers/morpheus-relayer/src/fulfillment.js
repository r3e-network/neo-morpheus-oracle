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
  TRUST_TIER_ENCLAVE_ATTESTED,
  TRUST_TIER_HOST_UNATTESTED,
} from './router.js';
import {
  guardQueuedAutomationExecution,
  handleAutomationControlRequest,
  isAutomationControlRequestType,
} from './automation.js';
import { buildUpkeepDispatch } from './automation-supervisor.js';
import { fulfillNeoN3Request } from './neo-n3.js';
import {
  buildNeoXDigest,
  fulfillNeoXRequest,
  resolveResultBytesHex,
  signNeoXFulfillment,
} from './neox.js';
import {
  buildEventKey,
  clearRetryItem,
  enqueueRetryItem,
  incrementLabeledFailure,
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
import { sendHeartbeat } from './heartbeat.js';
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
    // The enclave signer surfaces the role with an underscore ("oracle_verifier
    // signing key not configured"); match both so a real verifier-misprovision
    // fast-fails as terminal instead of burning the full retry budget.
    normalized.includes('oracle_verifier') ||
    normalized.includes('updater not set') ||
    normalized.includes('callback not allowed') ||
    (normalized.includes('called contract') && normalized.includes('not found'))
  );
}

// Worker/upstream HTTP status codes that are retryable (transient infrastructure
// failures), NOT deterministic request rejections. A worker HTTP 5xx/429/408/425
// — or a 0 (no response / aborted) — is a momentary overload, an upstream rate
// limit, or a connectivity blip; it must be retried, never burned into a
// permanent on-chain failure callback. Deterministic 4xx (400/401/403/404/409/422)
// stay on the deliver-as-failure path because re-running the same request would
// produce the same rejection.
const TRANSIENT_WORKER_HTTP_STATUSES = new Set([0, 408, 425, 429, 500, 502, 503, 504]);

/**
 * True when a worker HTTP status is a retryable infrastructure failure (5xx
 * family, 429 rate-limit, 408/425 request-timeout, or 0 no-response). Used by
 * the prepare lanes to short-circuit a transient worker failure into a retry
 * BEFORE it is encoded into an on-chain failure callback. Deterministic 4xx
 * (400/401/403/404/409/422) are NOT transient.
 */
export function isTransientWorkerStatus(status) {
  // Only treat an actual numeric status as transient. null/undefined/non-numeric
  // must NOT coerce to 0 (Number(null) === 0) and accidentally match.
  if (typeof status !== 'number' && typeof status !== 'string') return false;
  if (typeof status === 'string' && status.trim() === '') return false;
  const numeric = Number(status);
  if (!Number.isFinite(numeric)) return false;
  return TRANSIENT_WORKER_HTTP_STATUSES.has(numeric);
}

// Sentinel marker appended to the message of a transient-worker-failure error so
// the (already-thrown, then re-classified) error reliably routes through the
// retry path even if the raw status text alone would not match classifyError's
// transient keyword set.
const TRANSIENT_WORKER_ERROR_MARKER = '[transient-worker-status]';

/**
 * Build a transient-classified error for a retryable worker/upstream HTTP status
 * so the prepare lanes can throw instead of finalizing a permanent failure
 * callback. The thrown error is caught by processEvent's catch block and
 * re-classified via classifyError (which recognizes the status code), so the
 * request is retried like any other transient failure.
 */
export function buildTransientWorkerError(status, detail = '') {
  const numeric = Number(status);
  const statusText = Number.isFinite(numeric) ? numeric : 'unknown';
  const suffix = detail ? `: ${normalizeErrorMessage(detail)}` : '';
  return new Error(
    `worker request failed with transient status ${statusText}${suffix} ${TRANSIENT_WORKER_ERROR_MARKER}`
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
    msg.includes(TRANSIENT_WORKER_ERROR_MARKER) ||
    msg.includes('etimedout') ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset') ||
    msg.includes('rate limit') ||
    msg.includes('socket hang up') ||
    // Retryable upstream/worker HTTP statuses: 5xx family, 429 rate-limit,
    // 408/425 request-timeout, plus 0 (no response). Matched as standalone
    // tokens so a code embedded in unrelated text does not over-match.
    /\b(429|408|425|500|502|503|504)\b/.test(msg) ||
    msg.includes('network') ||
    msg.includes('timed out') ||
    msg.includes('unavailable')
  )
    return 'transient';
  // Permanent (deterministic) request rejections. Tightened (classifyError LOW):
  // anchor each keyword to a LEADING word boundary (\b<word>) so an ambiguous
  // message that merely contains the substring MID-WORD (e.g. "default" -> not
  // "fault", "revalidate" -> not "invalid") is NOT force-finalized as permanent,
  // while the genuine stem forms ("fault"/"faulted"/"faulting",
  // "invalid"/"invalidated") still match. An ambiguous error that matches neither
  // the transient block above nor a leading-boundary permanent keyword here falls
  // through to 'unknown', which the retry path RETRIES (not force-dead) —
  // finalizing a recoverable failure as a permanent on-chain failure is the worse
  // outcome, so we bias ambiguity toward retry.
  if (
    /\bnot found\b/.test(msg) ||
    /\bfault/.test(msg) ||
    /\bunauthori[sz]ed/.test(msg) ||
    /\bforbidden/.test(msg) ||
    /\binvalid/.test(msg)
  )
    return 'permanent';
  return 'unknown';
}

export function computeRetryDelayMs(config, attempts, rng = Math.random) {
  const ceiling = Math.min(
    config.retryBaseDelayMs * 2 ** Math.max(attempts - 1, 0),
    config.retryMaxDelayMs
  );
  // Full/equal jitter: spread the delay across [0.5, 1.0] * ceiling so a shared
  // dependency outage (RPC, Nitro signer, Supabase 402) does not bucket every
  // queued retry into the same next_retry_at and re-stampede the recovering
  // dependency on one tick. Math.round keeps integer-millisecond timestamps.
  const jitterFactor = 0.5 + 0.5 * rng();
  return Math.round(ceiling * jitterFactor);
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

// ---------------------------------------------------------------------------
// Minimal CBOR / COSE_Sign1 decoder (no external deps) — mirrors the encoder/
// decoder in deploy/nitro/enclave-server.mjs. A Nitro NSM attestation document is
// a COSE_Sign1 (CBOR array [protected, unprotected, payload(bstr), signature]),
// possibly wrapped in CBOR tag 18; the payload is a CBOR map with the measured
// `pcrs`, `user_data`, `public_key`, `nonce`. We decode just enough to read those
// committed fields so the relayer can VERIFY (C1) the document binds the digest +
// matches the pinned PCR0 — without bundling a CBOR/COSE library.
// ---------------------------------------------------------------------------
function cborRead(buf, offset) {
  if (offset >= buf.length) throw new Error('cbor: truncated');
  const initial = buf[offset];
  const major = initial >> 5;
  const minor = initial & 0x1f;
  let pos = offset + 1;
  const readUint = (n) => {
    let value = 0n;
    for (let i = 0; i < n; i += 1) {
      if (pos >= buf.length) throw new Error('cbor: truncated uint');
      value = (value << 8n) | BigInt(buf[pos]);
      pos += 1;
    }
    return value;
  };
  let length;
  if (minor < 24) length = BigInt(minor);
  else if (minor === 24) length = readUint(1);
  else if (minor === 25) length = readUint(2);
  else if (minor === 26) length = readUint(4);
  else if (minor === 27) length = readUint(8);
  else throw new Error(`cbor: unsupported minor ${minor}`);

  switch (major) {
    case 0:
      return { value: Number(length), pos };
    case 1:
      return { value: -1 - Number(length), pos };
    case 2:
    case 3: {
      const len = Number(length);
      const slice = buf.subarray(pos, pos + len);
      pos += len;
      return { value: major === 2 ? Buffer.from(slice) : slice.toString('utf8'), pos };
    }
    case 4: {
      const arr = [];
      const len = Number(length);
      for (let i = 0; i < len; i += 1) {
        const item = cborRead(buf, pos);
        arr.push(item.value);
        pos = item.pos;
      }
      return { value: arr, pos };
    }
    case 5: {
      const map = {};
      const len = Number(length);
      for (let i = 0; i < len; i += 1) {
        const key = cborRead(buf, pos);
        pos = key.pos;
        const val = cborRead(buf, pos);
        pos = val.pos;
        const keyName = Buffer.isBuffer(key.value) ? key.value.toString('hex') : String(key.value);
        map[keyName] = val.value;
      }
      return { value: map, pos };
    }
    case 6: {
      const inner = cborRead(buf, pos);
      return { value: inner.value, pos: inner.pos };
    }
    case 7: {
      if (minor === 20) return { value: false, pos };
      if (minor === 21) return { value: true, pos };
      if (minor === 22) return { value: null, pos };
      return { value: null, pos };
    }
    default:
      throw new Error(`cbor: unsupported major ${major}`);
  }
}

function decodeCoseSign1(coseBuffer) {
  const { value: cose } = cborRead(coseBuffer, 0);
  if (!Array.isArray(cose) || cose.length !== 4) {
    throw new Error('cose: not a 4-element COSE_Sign1');
  }
  const [protectedHeaderBytes, , payloadBytes, signature] = cose;
  if (!Buffer.isBuffer(payloadBytes)) throw new Error('cose: payload is not a byte string');
  const { value: payload } = cborRead(payloadBytes, 0);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('cose: payload is not a map');
  }
  return {
    protectedHeaderBytes: Buffer.isBuffer(protectedHeaderBytes)
      ? protectedHeaderBytes
      : Buffer.alloc(0),
    payloadBytes,
    payload,
    signature: Buffer.isBuffer(signature) ? signature : Buffer.alloc(0),
  };
}

// Build the COSE Sig_structure for a COSE_Sign1 (RFC 8152 §4.4):
//   Sig_structure = [ "Signature1", body_protected(bstr), external_aad(bstr ""), payload(bstr) ]
// This is the exact byte string the enclave's ES384 signature is computed over.
function buildCoseSign1SigStructure(protectedHeaderBytes, payloadBytes) {
  return cborEncodeSigStructure([
    'Signature1',
    protectedHeaderBytes,
    Buffer.alloc(0),
    payloadBytes,
  ]);
}

// Minimal deterministic CBOR encoder for the 4-element Sig_structure array (text
// string + three byte strings). Self-contained so no CBOR/COSE library is bundled.
function cborEncodeSigStructure(items) {
  const head = (major, len) => {
    if (len < 24) return Buffer.from([(major << 5) | len]);
    if (len < 256) return Buffer.from([(major << 5) | 24, len]);
    if (len < 65536) return Buffer.from([(major << 5) | 25, (len >> 8) & 0xff, len & 0xff]);
    const b = Buffer.alloc(5);
    b[0] = (major << 5) | 26;
    b.writeUInt32BE(len, 1);
    return b;
  };
  const parts = [head(4, items.length)];
  for (const item of items) {
    if (typeof item === 'string') {
      const b = Buffer.from(item, 'utf8');
      parts.push(head(3, b.length), b);
    } else {
      const b = Buffer.isBuffer(item) ? item : Buffer.from(item || []);
      parts.push(head(2, b.length), b);
    }
  }
  return Buffer.concat(parts);
}

// Convert a 96-byte COSE raw (r||s) ES384 signature into the DER-encoded ECDSA
// signature Node's crypto.verify expects. Returns null if the input is not a
// 96-byte raw signature (e.g. a placeholder), so the caller treats it as
// unverifiable rather than throwing.
function coseEs384SignatureToDer(rawSignature) {
  if (!Buffer.isBuffer(rawSignature) || rawSignature.length !== 96) return null;
  const encodeInt = (bytes) => {
    let i = 0;
    while (i < bytes.length - 1 && bytes[i] === 0) i += 1;
    let trimmed = bytes.subarray(i);
    if (trimmed[0] & 0x80) trimmed = Buffer.concat([Buffer.from([0]), trimmed]);
    return Buffer.concat([Buffer.from([0x02, trimmed.length]), trimmed]);
  };
  const r = encodeInt(rawSignature.subarray(0, 48));
  const s = encodeInt(rawSignature.subarray(48, 96));
  const body = Buffer.concat([r, s]);
  return Buffer.concat([Buffer.from([0x30, body.length]), body]);
}

// The AWS Nitro attestation certificate chain (cabundle + leaf) lives in the COSE
// payload map: `certificate` (leaf, DER bstr) and `cabundle` (array of DER bstr,
// root-first). Return the chain leaf-first as DER buffers, or null when absent.
function extractAttestationCertChain(payload) {
  const leaf = payload.certificate;
  const cabundle = Array.isArray(payload.cabundle) ? payload.cabundle : [];
  if (!Buffer.isBuffer(leaf)) return null;
  const intermediates = cabundle.filter(Buffer.isBuffer);
  return { leaf, intermediates };
}

// Best-effort COSE_Sign1 ES384 signature + certificate-chain verification against a
// pinned AWS Nitro root certificate. Returns one of:
//   { verified: true }                     — signature + chain to the pinned root OK
//   { verified: false, checked: false }    — not checkable (no root pinned / no cert
//                                            / placeholder signature) — caller does
//                                            NOT treat this as attested but does NOT
//                                            hard-fail (backward compatible)
//   throws                                 — a real, checkable signature/chain that
//                                            FAILS verification (forged document)
function verifyCoseSign1Crypto(rootCertPem, cose, payload) {
  if (!trimString(rootCertPem)) return { verified: false, checked: false };
  const chain = extractAttestationCertChain(payload);
  if (!chain) return { verified: false, checked: false };
  const der = coseEs384SignatureToDer(cose.signature);
  if (!der) return { verified: false, checked: false };

  let leafCert;
  let rootCert;
  let intermediateCerts;
  try {
    const { X509Certificate } = crypto;
    leafCert = new X509Certificate(chain.leaf);
    rootCert = new X509Certificate(rootCertPem);
    intermediateCerts = chain.intermediates.map((der509) => new X509Certificate(der509));
  } catch {
    // Malformed certs in a doc we were ASKED to verify (root pinned) is a hard fail.
    throw new Error(
      'invalid signature: enclave attestation certificate chain is malformed — refusing to submit'
    );
  }

  // Chain validation: each cert must be issued by the next; the top must chain to
  // the pinned root. AWS publishes the chain root-first in cabundle, leaf separate.
  const ordered = [leafCert, ...intermediateCerts.slice().reverse()];
  for (let i = 0; i < ordered.length; i += 1) {
    const issuer = ordered[i + 1] || rootCert;
    if (!ordered[i].verify(issuer.publicKey)) {
      throw new Error(
        'invalid signature: enclave attestation certificate chain does not verify to the pinned ' +
          'AWS Nitro root — refusing to submit'
      );
    }
  }
  // The top intermediate (or the leaf, if no intermediates) must chain to the root.
  const topCert = ordered[ordered.length - 1];
  if (topCert !== rootCert && !topCert.verify(rootCert.publicKey)) {
    throw new Error(
      'invalid signature: enclave attestation certificate chain does not verify to the pinned ' +
        'AWS Nitro root — refusing to submit'
    );
  }

  // COSE_Sign1 signature over the Sig_structure using the LEAF cert's P-384 key.
  const sigStructure = buildCoseSign1SigStructure(cose.protectedHeaderBytes, cose.payloadBytes);
  let ok = false;
  try {
    ok = crypto.verify(
      'sha384',
      sigStructure,
      { key: leafCert.publicKey, dsaEncoding: 'der' },
      der
    );
  } catch {
    ok = false;
  }
  if (!ok) {
    throw new Error(
      'invalid signature: enclave attestation COSE_Sign1 ES384 signature does not verify against ' +
        'the leaf certificate — refusing to submit'
    );
  }
  return { verified: true, checked: true };
}

// The PCR0 the live enclave is pinned to. Sourced from MORPHEUS_EXPECTED_PCR0 (or
// config.nitro.expectedPcr0). When unset, PCR0 cannot be asserted — the relayer
// still verifies the digest binding but cannot claim the document came from the
// expected measured image, so trust is downgraded. Lowercase hex, no 0x.
export function resolveExpectedPcr0(config) {
  return normalizePublicKey(
    trimString(config?.nitro?.expectedPcr0 || '') ||
      trimString(process.env.MORPHEUS_EXPECTED_PCR0 || '')
  );
}

// Whether the enclave signature cross-check (digest-sig) is enabled. Opt-in via
// config.nitro.verifyEnclaveSignature OR MORPHEUS_RELAYER_VERIFY_ENCLAVE_SIGNATURE
// (read directly so it is operable without a config.js change). Default OFF so the
// current deployment (which has not pinned strict verification) keeps fulfilling.
export function enclaveSignatureVerificationEnabled(config) {
  if (config?.nitro?.verifyEnclaveSignature) return true;
  const raw = trimString(process.env.MORPHEUS_RELAYER_VERIFY_ENCLAVE_SIGNATURE || '').toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

/**
 * Verify the enclave attestation document (C1) against the relayer's INDEPENDENTLY
 * recomputed fulfillment digest. Returns { attested, reason, pcr0 }:
 *   - attested true  => the document proves the result was produced inside the
 *     measured enclave (user_data == sha256(localDigest) AND, when a PCR0 is
 *     pinned, the document's PCR0 matches it).
 *   - attested false => attestation absent or unprovable; the caller MUST NOT label
 *     the result enclave-attested (it downgrades trust_tier). `reason` explains why.
 *
 * Backward-compatible: when no attestation doc is present (today's enclave images
 * pre-cutover) this returns attested:false WITHOUT throwing, so the lane keeps
 * fulfilling. A doc that IS present but binds the WRONG digest (or wrong PCR0 when
 * one is pinned) is a HARD failure — the caller treats it like a digest mismatch
 * and refuses to submit.
 */
// Pinned AWS Nitro attestation ROOT certificate (PEM). When set, the relayer
// best-effort verifies the COSE_Sign1 ES384 signature + the document's certificate
// chain up to this root. Sourced from config.nitro.nitroRootCertPem or
// MORPHEUS_NITRO_ROOT_CERT_PEM. Unset = crypto verification skipped (binding+PCR0
// still enforced) so pre-cutover deployments keep fulfilling.
export function resolveNitroRootCertPem(config) {
  return (
    trimString(config?.nitro?.nitroRootCertPem || '') ||
    trimString(process.env.MORPHEUS_NITRO_ROOT_CERT_PEM || '')
  );
}

// Maximum accepted age (ms) of an attestation document's echoed timestamp. 0 (the
// default) disables the timestamp-age gate; the nonce-echo binding is the primary
// anti-replay control. Sourced from config.nitro.attestationMaxAgeMs or
// MORPHEUS_ATTESTATION_MAX_AGE_MS.
export function resolveAttestationMaxAgeMs(config) {
  const fromConfig = Number(config?.nitro?.attestationMaxAgeMs);
  if (Number.isFinite(fromConfig) && fromConfig > 0) return fromConfig;
  const fromEnv = Number(process.env.MORPHEUS_ATTESTATION_MAX_AGE_MS || 0);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 0;
}

export function verifyEnclaveAttestation(config, body, localDigestHex, options = {}) {
  const docBase64 = trimString(body?.attestation_doc_base64 || '');
  if (!docBase64) {
    return { attested: false, reason: 'no attestation document', pcr0: '' };
  }
  let cose;
  let payload;
  try {
    cose = decodeCoseSign1(Buffer.from(docBase64, 'base64'));
    payload = cose.payload;
  } catch (error) {
    return {
      attested: false,
      reason: `attestation parse failed: ${normalizeErrorMessage(error)}`,
      pcr0: '',
    };
  }
  // user_data MUST commit to sha256(the relayer-recomputed digest bytes). A doc that
  // commits to a DIFFERENT digest is an active attempt to attest a result the relayer
  // did not compute — treat it as a hard failure (throw), not a downgrade.
  const userData = Buffer.isBuffer(payload.user_data)
    ? payload.user_data.toString('hex')
    : normalizePublicKey(payload.user_data || '');
  const expectedUserData = crypto
    .createHash('sha256')
    .update(Buffer.from(localDigestHex, 'hex'))
    .digest('hex');
  if (userData && userData !== expectedUserData) {
    throw new Error(
      'invalid signature: enclave attestation user_data does not bind the fulfillment digest ' +
        `(doc=${userData} expected=${expectedUserData}) — refusing to submit`
    );
  }
  if (!userData) {
    return { attested: false, reason: 'attestation document has no user_data binding', pcr0: '' };
  }

  // FRESHNESS / ANTI-REPLAY (a): when the relayer supplied a per-request nonce AND the
  // document carries a nonce, the document MUST echo that exact nonce. A
  // captured-but-genuine document for the same digest carries a DIFFERENT (older)
  // nonce, so a mismatch is a replay attempt — hard fail. Backward compatibility: a
  // pre-cutover enclave image that does NOT echo a nonce leaves the doc nonce empty;
  // we cannot prove freshness then, so the nonce-echo gate stays inert (the
  // digest+PCR0 binding below still applies). Once the enclave echoes nonces, a
  // replayed doc (wrong nonce) is rejected.
  const expectedNonce = normalizePublicKey(options.expectedNonce || '');
  const docNonce = Buffer.isBuffer(payload.nonce)
    ? payload.nonce.toString('hex')
    : normalizePublicKey(payload.nonce || '');
  if (expectedNonce && docNonce && docNonce !== expectedNonce) {
    throw new Error(
      'invalid signature: enclave attestation nonce does not echo the relayer-supplied nonce ' +
        `(doc=${docNonce} expected=${expectedNonce}) — refusing to submit (possible replay)`
    );
  }

  // FRESHNESS / ANTI-REPLAY (a, timestamp): when a max-age is configured AND the
  // document carries a timestamp, reject a document whose timestamp is older than the
  // window (stale/replayed). NSM timestamps are epoch milliseconds. A future-dated
  // doc beyond a small skew is also rejected. No timestamp / no max-age => inert.
  const maxAgeMs = resolveAttestationMaxAgeMs(config);
  if (maxAgeMs > 0) {
    const docTimestampMs = Number(payload.timestamp);
    if (Number.isFinite(docTimestampMs) && docTimestampMs > 0) {
      const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
      const ageMs = now - docTimestampMs;
      const FUTURE_SKEW_MS = 60_000;
      if (ageMs > maxAgeMs || ageMs < -FUTURE_SKEW_MS) {
        throw new Error(
          'invalid signature: enclave attestation timestamp is outside the freshness window ' +
            `(age_ms=${ageMs} max_ms=${maxAgeMs}) — refusing to submit (possible replay)`
        );
      }
    }
  }

  // COSE_Sign1 signature + certificate-chain verification (b): best-effort. When a
  // pinned AWS Nitro root cert is configured AND the document carries a real
  // certificate chain + a 96-byte ES384 signature, verify the COSE_Sign1 signature
  // and the chain up to the pinned root. A document that FAILS this crypto check is
  // NOT attested — it is a forged/tampered structure and a hard failure (throw). When
  // no root is pinned / no cert chain present / placeholder signature, the check is a
  // no-op (binding + PCR0 still enforced below) so pre-cutover deployments keep
  // fulfilling.
  const cryptoResult = verifyCoseSign1Crypto(resolveNitroRootCertPem(config), cose, payload);

  // PCR0 binding: the document must come from the pinned measured image. When a
  // PCR0 is configured we ASSERT it (a mismatch is a hard failure — wrong/forged
  // image). When none is configured we cannot prove the image, so we do not claim
  // enclave-attested (downgrade) but keep submitting.
  const pcrs = payload.pcrs && typeof payload.pcrs === 'object' ? payload.pcrs : {};
  const docPcr0 = Buffer.isBuffer(pcrs['0'])
    ? pcrs['0'].toString('hex')
    : normalizePublicKey(pcrs['0'] || pcrs.pcr0 || '');
  const expectedPcr0 = resolveExpectedPcr0(config);
  if (expectedPcr0) {
    if (!docPcr0 || docPcr0 !== expectedPcr0) {
      throw new Error(
        'invalid signature: enclave attestation PCR0 does not match the pinned measurement ' +
          `(doc=${docPcr0 || 'missing'} expected=${expectedPcr0}) — refusing to submit`
      );
    }
    return {
      attested: true,
      reason: cryptoResult.verified
        ? 'attested (digest + PCR0 + COSE signature/chain verified)'
        : 'attested (digest + PCR0 verified)',
      pcr0: docPcr0,
      cose_verified: Boolean(cryptoResult.verified),
    };
  }
  // Digest binding verified, but PCR0 not pinned -> cannot prove the measured image.
  return {
    attested: false,
    reason: 'attestation digest verified but no MORPHEUS_EXPECTED_PCR0 pinned',
    pcr0: docPcr0,
    cose_verified: Boolean(cryptoResult.verified),
  };
}

// Verify the enclave's secp256r1 signature over the relayer-recomputed digest using
// the on-chain-pinned oracle_verifier public key (the digest-sig cross-check). Only
// runs for neo_n3/legacy when a pinned verifier pubkey is configured; otherwise it
// is a no-op (returns {checked:false}) so deployments that have not pinned a verifier
// key keep fulfilling. A returned public_key that differs from the pinned key, or a
// signature that does NOT verify against the pinned key, is a HARD failure (throws).
export function verifyEnclaveSignatureAgainstPinnedVerifier(config, chain, body, localDigestHex) {
  if (chain !== 'neo_n3' && chain !== 'legacy') return { verified: false, checked: false };
  let pinned;
  try {
    pinned = normalizePublicKey(resolvePinnedNeoN3VerifierPublicKey(config.network, process.env));
  } catch {
    pinned = '';
  }
  if (!pinned) return { verified: false, checked: false };
  const returnedKey = normalizePublicKey(body?.public_key || '');
  // The enclave must sign with the pinned verifier key (the only key the on-chain
  // contract accepts). A different key would be rejected on-chain anyway; flag it.
  if (returnedKey && returnedKey !== pinned) {
    throw new Error(
      `verifier rejected signature: enclave public_key ${returnedKey} != pinned oracle_verifier ${pinned}`
    );
  }
  const signature = trimString(body?.signature || '');
  let ok = false;
  try {
    ok = neonWallet.verify(localDigestHex, signature, pinned);
  } catch {
    ok = false;
  }
  if (!ok) {
    throw new Error(
      'invalid signature: enclave signature does not verify against the pinned oracle_verifier ' +
        'public key over the recomputed digest — refusing to submit'
    );
  }
  return { verified: true, checked: true };
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

// ---------------------------------------------------------------------------
// Compute-in-enclave fulfillment (POST /oracle/fulfill) — flag-gated (Phase 4)
// ---------------------------------------------------------------------------
//
// When config.nitro.enclaveFulfill is TRUE the attested lanes call the enclave's
// atomic compute+sign endpoint once instead of the two-step (host-worker compute
// + a separate enclave /sign/payload). The relayer becomes pure delivery: it
// carries {result, signature} only and INDEPENDENTLY recomputes the fulfillment
// digest as a defense-in-depth cross-check (the on-chain consensus check is still
// authoritative — this catches enclave/relayer drift before a bad submit).

// The host-unattested arbitrary-URL fetch lane (oracle.fetch / smart-fetch with an
// explicit payload.url) cannot be egress-allow-listed inside the enclave, so it
// stays on the host worker regardless of the flag. Everything else routing through
// the kernel intents below is an attested lane that the enclave can compute+sign.
function isHostUnattestedFetchLane(kernelIntent, payload) {
  if (kernelIntent.workerRoute !== '/oracle/smart-fetch') return false;
  return Boolean(trimString(payload?.url || ''));
}

// Recompute the fulfillment digest LOCALLY from the result the enclave returned,
// using the SAME canonical builders + the SAME deployment/network binding the
// relayer's own signFulfillmentPayload uses. Returns the lowercase hex digest so
// it can be compared byte-for-byte to the enclave's fulfillment_digest_hex.
function recomputeFulfillmentDigestHex(config, chain, fulfillment) {
  if (chain === 'neox') {
    const resultBytesHex = resolveResultBytesHex(
      fulfillment.result,
      fulfillment.result_bytes_base64 || ''
    );
    // buildNeoXDigest returns a 0x-prefixed keccak hex; normalize for comparison.
    return normalizePublicKey(buildNeoXDigest(config, fulfillment, resultBytesHex));
  }
  const digestContext = resolveFulfillmentSigningContext(chain, fulfillment);
  if (chain === 'neo_n3') {
    digestContext.contractScriptHash = config?.neo_n3?.oracleContract || '';
    digestContext.networkMagic = config?.neo_n3?.networkMagic;
  }
  const digestBytes = buildFulfillmentDigestBytes(
    fulfillment.requestId,
    fulfillment.requestType,
    fulfillment.success,
    fulfillment.result,
    fulfillment.error,
    fulfillment.result_bytes_base64 || '',
    digestContext
  );
  return digestBytes.toString('hex');
}

// Build the kernel-context object the enclave /oracle/fulfill endpoint needs to
// rebuild the EXACT digest (so its signature verifies on-chain unchanged). Mirrors
// the fields signFulfillmentPayload binds.
function buildEnclaveFulfillmentContext(config, chain, event, fulfillmentContext) {
  const base = {
    app_id: fulfillmentContext.appId,
    module_id: fulfillmentContext.moduleId,
    operation: fulfillmentContext.operation,
  };
  if (chain === 'neox') {
    return {
      ...base,
      chain_id: config?.neox?.chainId,
      oracle_contract: config?.neox?.oracleContract || '',
    };
  }
  return {
    ...base,
    contract_script_hash: config?.neo_n3?.oracleContract || '',
    network_magic: config?.neo_n3?.networkMagic,
  };
}

// Single atomic compute+sign call to the enclave for an attested lane. Consumes
// {success, result, result_bytes_base64, error, signature, public_key,
// fulfillment_digest_hex, trust_tier} and asserts the returned digest equals the
// relayer's own recomputation before the caller submits.
async function callEnclaveFulfill(config, chain, event, fulfillmentContext, payload, _kernelIntent) {
  // Per-request freshness nonce: the enclave echoes it back inside the attestation
  // document so the relayer can prove the doc was produced FOR THIS request (not a
  // captured/replayed genuine doc for the same digest). Captured here so it can be
  // passed to verifyEnclaveAttestation as the expectedNonce.
  const requestNonce = crypto.randomBytes(16).toString('hex');
  const enclavePayload = {
    chain,
    request_type: event.requestType,
    request_id: String(event.requestId),
    payload: {
      ...payload,
      requester: event.requester || payload.requester || '',
      callback_contract: event.callbackContract || payload.callback_contract || '',
      callback_method: event.callbackMethod || payload.callback_method || '',
    },
    // payload_text carries the raw confidential envelope for the decrypt lane
    // (the enclave reads it the same way the host /oracle/decrypt branch does).
    payload_text: event.payloadText || '',
    fulfillment_context: buildEnclaveFulfillmentContext(config, chain, event, fulfillmentContext),
    nonce: requestNonce,
  };

  const response = await callNitro(config, '/oracle/fulfill', enclavePayload, {
    baseUrl: config.nitro.enclaveFulfillUrl,
  });

  // A transient enclave HTTP failure (5xx/429/408/425/0) must be retried, never
  // finalized as a permanent on-chain failure (mirrors the host worker lanes).
  if (!response.ok && isTransientWorkerStatus(response.status)) {
    throw buildTransientWorkerError(
      response.status,
      typeof response.body?.error === 'string' ? response.body.error : 'enclave fulfill'
    );
  }

  const body = response.body && typeof response.body === 'object' ? response.body : {};
  if (!response.ok) {
    throw new Error(
      typeof body.error === 'string' && body.error
        ? body.error
        : `enclave fulfill failed with status ${response.status}`
    );
  }
  if (typeof body.signature !== 'string' || !body.signature) {
    throw new Error(
      typeof body.error === 'string' && body.error
        ? body.error
        : 'enclave fulfill returned no signature'
    );
  }

  const fulfillment = {
    requestId: String(event.requestId),
    requestType: event.requestType,
    appId: fulfillmentContext.appId,
    moduleId: fulfillmentContext.moduleId,
    operation: fulfillmentContext.operation,
    success: Boolean(body.success),
    result: typeof body.result === 'string' ? body.result : '',
    result_bytes_base64:
      typeof body.result_bytes_base64 === 'string' ? body.result_bytes_base64 : '',
    error: typeof body.error === 'string' ? body.error : '',
  };

  // DIGEST CROSS-CHECK (defense in depth): independently recompute the digest from
  // the enclave-returned result and assert it equals the enclave's returned
  // fulfillment_digest_hex. A mismatch means the enclave and relayer disagree on
  // the consensus-critical bytes — treat it as a HARD failure and do NOT submit.
  const returnedDigest = normalizePublicKey(body.fulfillment_digest_hex || '');
  const localDigest = normalizePublicKey(recomputeFulfillmentDigestHex(config, chain, fulfillment));
  if (!returnedDigest || returnedDigest !== localDigest) {
    throw new Error(
      'invalid signature: enclave fulfillment digest mismatch ' +
        `(enclave=${returnedDigest || 'missing'} relayer=${localDigest}) — refusing to submit`
    );
  }

  // SIGNATURE CROSS-CHECK (digest-sig): verify the enclave's signature against the
  // on-chain-pinned oracle_verifier public key over the recomputed digest BEFORE
  // submit. A wrong key or a non-verifying signature throws (terminal). Opt-in via
  // config.nitro.verifyEnclaveSignature (MORPHEUS_RELAYER_VERIFY_ENCLAVE_SIGNATURE)
  // so an operator enables strict verification at the cutover point — un-configured
  // deployments keep fulfilling (the on-chain contract is still authoritative and
  // rejects a bad signature there too).
  if (enclaveSignatureVerificationEnabled(config)) {
    verifyEnclaveSignatureAgainstPinnedVerifier(config, chain, body, localDigest);
  }

  // ATTESTATION VERIFICATION (C1): make attestation ENFORCING. Derive trust_tier
  // from the VERIFIED document rather than trusting the response's trust_tier
  // string. A present-but-wrong document (binds a different digest, or wrong PCR0
  // when one is pinned) throws (terminal — not submitted). When attestation is
  // absent or cannot be proven (no doc / no pinned PCR0 yet), the result is treated
  // as NOT enclave-attested: trust_tier is downgraded but the lane still submits so
  // the current deployment keeps fulfilling.
  const attestation = verifyEnclaveAttestation(config, body, localDigest, {
    expectedNonce: requestNonce,
  });
  const trustTier = attestation.attested ? TRUST_TIER_ENCLAVE_ATTESTED : TRUST_TIER_HOST_UNATTESTED;

  return {
    fulfillment,
    signature: body.signature,
    trust_tier: trustTier,
    attestation,
    worker_response: body.verification && typeof body.verification === 'object' ? body.verification : body,
  };
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
    // Tiered-trust label carried alongside the prepared fulfillment. It is NOT part
    // of the digested `result` (see buildOnchainResultEnvelope's digest-neutrality
    // note) — purely an additive provenance label that lands in the on-chain result
    // envelope / API response. Defaults to enclave-attested so the field is always
    // present; the host-unattested arbitrary-URL lane overrides it.
    trust_tier:
      typeof prepared.trust_tier === 'string' && prepared.trust_tier
        ? prepared.trust_tier
        : TRUST_TIER_ENCLAVE_ATTESTED,
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
    trust_tier: details.trust_tier || TRUST_TIER_ENCLAVE_ATTESTED,
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

// C3 — build the /oracle/decrypt request body for the confidential.decrypt lane,
// including the binding fields the worker's gated decrypt expects (chain,
// message_id, contract). The message_id is sourced from the event / decoded payload
// (the on-chain MiniAppMessage reveal carries it); the chain defaults to the event
// chain (the worker's binding gate is neox-only — it rejects a non-neox chain with a
// clear error, which classifies as permanent). The contract is sourced from config
// when available so the worker can match it against its trusted message contract.
// When no message_id is derivable the body carries ONLY { envelope } (today's
// behavior) so legacy events keep working and the worker's binding gate stays inert.
export function buildDecryptBindingRequest(config, event = {}, payload = {}, envelope = '') {
  const request = { envelope };
  const messageId =
    payload?.message_id ??
    payload?.messageId ??
    payload?.id ??
    event?.messageId ??
    event?.message_id ??
    null;
  const normalizedMessageId =
    messageId === null || messageId === undefined || trimString(String(messageId)) === ''
      ? null
      : trimString(String(messageId));
  if (normalizedMessageId === null) return request;

  request.message_id = normalizedMessageId;
  // The worker's gated decrypt is neox-only (the EVM confidential-message lane), so
  // the binding chain is always neox; a non-neox chain would be rejected by the
  // worker with a clear error.
  request.chain = 'neox';
  const contract =
    trimString(payload?.contract || payload?.contract_address || '') ||
    trimString(config?.neox?.messageContract || config?.neox?.oracleContract || '');
  if (contract) request.contract = contract;
  return request;
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
  // Compute-in-enclave attested path (flag-gated, Phase 4). When the flag is ON,
  // the attested lanes (price/feed query, vrf, compute, confidential decrypt,
  // neodid) call the enclave's atomic POST /oracle/fulfill ONCE instead of the
  // two-step (host-worker compute + a separate enclave /sign/payload). The
  // randomness for VRF now comes from the enclave (computed + attested), so the
  // relayer-local crypto.randomBytes branch below is skipped while the flag is on.
  // The arbitrary-URL fetch lane (oracle.fetch / smart-fetch with payload.url)
  // stays on the host worker regardless and is tagged host-unattested. Flag OFF =
  // exactly today's behavior (all branches below run unchanged).
  if (config?.nitro?.enclaveFulfill && !isHostUnattestedFetchLane(kernelIntent, payload)) {
    const enclaveResult = await callEnclaveFulfill(
      config,
      event.chain,
      event,
      fulfillmentContext,
      payload,
      kernelIntent
    );
    return buildPreparedFulfillment(enclaveResult.fulfillment, {
      route: `enclave:${kernelIntent.moduleId}`,
      module_id: fulfillmentContext.moduleId,
      operation: fulfillmentContext.operation,
      worker_response: enclaveResult.worker_response,
      worker_status: 200,
      verification_signature: enclaveResult.signature,
      trust_tier: enclaveResult.trust_tier,
    });
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
    // C3 — coordinate decrypt-binding. Send the (chain, message_id, contract)
    // binding the worker's gated decrypt expects so it can re-derive the access
    // decision IN the enclave (read the on-chain message for message_id from a
    // TRUSTED worker-configured contract, confirm the supplied envelope IS that
    // stored envelope, and re-assert the time-lock) instead of trusting a bare
    // ciphertext. Fields are derived from the event/decoded payload; when a
    // message_id is genuinely unavailable (legacy events) only the envelope is
    // sent, and the worker's binding gate stays inert for that request.
    // ENCLAVE-ONLY decrypt lane: confidential decryption must happen INSIDE the
    // measured enclave. Pin the call to the enclave-only decrypt URL and DISABLE
    // failover so it can never fall over to a public/edge/off-TEE endpoint (which
    // would decrypt outside the attested boundary and leak plaintext). If the
    // enclave is unreachable, callNitro throws (fail closed) and the request is
    // retried as a transient failure — it is never silently routed off-TEE.
    const decResponse = await callNitro(
      config,
      '/oracle/decrypt',
      buildDecryptBindingRequest(config, event, payload, envelope),
      { baseUrl: config.nitro.decryptUrl || config.nitro.signerUrl, allowFallback: false }
    );
    // A transient decrypt-worker HTTP failure (5xx/429/408/425/0 — enclave
    // overload, rate limit, connectivity blip) must be retried, never finalized
    // as a permanent decrypt-failed callback that strands the time-locked reveal.
    if (!decResponse.ok && isTransientWorkerStatus(decResponse.status)) {
      throw buildTransientWorkerError(
        decResponse.status,
        typeof decResponse.body?.error === 'string' ? decResponse.body.error : 'confidential decrypt'
      );
    }
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
  // A transient worker/upstream HTTP failure (5xx/429/408/425/0) is an
  // infrastructure blip — momentary enclave overload, upstream rate limit, or a
  // 502/503/504 — NOT a deterministic request rejection. Throw a transient error
  // so processEvent retries the request instead of irreversibly finalizing it as
  // a permanent on-chain failure callback. Deterministic 4xx falls through to the
  // normal deliver-as-failure path (re-running would just reproduce the rejection).
  if (!workerResponse.ok && isTransientWorkerStatus(workerResponse.status)) {
    throw buildTransientWorkerError(
      workerResponse.status,
      typeof workerResponse.body?.error === 'string' ? workerResponse.body.error : ''
    );
  }
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
    // Tiered-trust label: the arbitrary-URL fetch lane (computed on the untrusted
    // host worker, no enclave attestation possible) is host-unattested. Every other
    // host-worker lane keeps the default attested label (flag-off topology where
    // the worker IS the enclave today). Purely a provenance label — not digested.
    trust_tier: isHostUnattestedFetchLane(kernelIntent, payload)
      ? TRUST_TIER_HOST_UNATTESTED
      : TRUST_TIER_ENCLAVE_ATTESTED,
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
  // F5: labeled failure detail (flat retries_exhausted_total stays authoritative).
  incrementLabeledFailure(state, event.chain, kernelIntent.moduleId, kernelIntent.operation);
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
  // F1: push an alert for the single most important incident — a permanently
  // dropped oracle callback. Dedicated dead-letter channel, falling back to the
  // generic failure channel so configuring only the failure URL still alerts.
  // Fire-and-forget (the loop-level failure heartbeat uses the same pattern).
  void sendHeartbeat(config?.heartbeats?.deadLetter || config?.heartbeats?.failure || '', {
    event: 'relayer_dead_letter',
    network: config?.network,
    chain: event.chain,
    request_id: String(event.requestId || ''),
    request_type: String(event.requestType || ''),
    module_id: kernelIntent.moduleId,
    operation: kernelIntent.operation,
    event_key: eventKey,
    attempts,
    route,
    error_class: errorClass,
    error: lastError,
    terminal_error: terminalError,
  });
  return {
    event,
    error: lastError,
    retry_status: 'exhausted',
    event_key: eventKey,
    attempts,
  };
}

/**
 * Re-enqueue a callback-delivery / failure-finalize retry that bypasses
 * scheduleRetry's maxRetries gate (the payload is already prepared; only the
 * on-chain submission is being retried). The ceiling enforcement lives in the
 * callers (resolveCallbackRetryCeiling / classifyError) which divert to
 * recordDeliveryExhaustion; this helper owns the "below the ceiling, schedule
 * another attempt" path that the three arms shared verbatim apart from the
 * status string, worker_response shape, retry-item fields, and log copy.
 */
async function scheduleCallbackRetry(
  config,
  state,
  persistState,
  logger,
  event,
  kernelIntent,
  {
    nextAttempts,
    firstFailedAt,
    errorMessage,
    extraRetryItemFields = {},
    upsertStatus,
    upsertExtras = {},
    upsertWorkerResponse,
    retryStatus,
    logLevel,
    logMessage,
    logModuleId,
    logOperation,
  }
) {
  const eventKey = buildEventKey(event);
  const retryItemNext = enqueueRetryItem(state, event.chain, event, {
    attempts: nextAttempts,
    next_retry_at: Date.now() + computeRetryDelayMs(config, nextAttempts),
    first_failed_at: firstFailedAt,
    last_error: trimOnchainErrorMessage(errorMessage),
    retryQueueLimit: config.retryQueueLimit,
    deadLetterLimit: config.deadLetterLimit,
    ...extraRetryItemFields,
  });
  incrementMetric(state, 'retries_scheduled_total');
  persistState();

  await maybeUpsertJob(logger, event, {
    event_key: eventKey,
    status: upsertStatus,
    attempts: retryItemNext.attempts,
    ...upsertExtras,
    last_error: retryItemNext.last_error,
    next_retry_at: new Date(retryItemNext.next_retry_at).toISOString(),
    worker_response: upsertWorkerResponse,
  });

  logger[logLevel](
    {
      chain: event.chain,
      request_id: event.requestId,
      request_type: event.requestType,
      module_id: logModuleId ?? kernelIntent.moduleId,
      operation: logOperation ?? kernelIntent.operation,
      event_key: eventKey,
      attempts: retryItemNext.attempts,
      retry_at: retryItemNext.next_retry_at,
      error: retryItemNext.last_error,
    },
    logMessage
  );

  return {
    event,
    error: retryItemNext.last_error,
    retry_status: retryStatus,
    event_key: eventKey,
    attempts: retryItemNext.attempts,
  };
}

/**
 * Record a terminal (non-exhaustion) processing outcome — the 'settled'
 * (already-fulfilled-on-chain) and terminal-configuration-error arms. Both
 * record the processed event locally, clear the retry item, mirror the status
 * to the durable queue, and emit a single log line; they differ only in the
 * local/durable status strings, route, error text, optional metric, log level,
 * log message, and any extra processed-record meta.
 */
async function recordTerminalOutcome(
  config,
  state,
  persistState,
  logger,
  event,
  kernelIntent,
  {
    attempts,
    localStatus,
    durableStatus,
    route,
    lastError,
    metric = null,
    logLevel,
    logMessage,
    extraMeta = {},
    retryStatus,
  }
) {
  const eventKey = buildEventKey(event);
  if (metric) incrementMetric(state, metric);
  recordProcessedEvent(
    state,
    event.chain,
    event,
    localStatus,
    {
      attempts,
      route,
      module_id: kernelIntent.moduleId,
      operation: kernelIntent.operation,
      last_error: lastError,
      ...extraMeta,
    },
    config
  );
  clearRetryItem(state, event.chain, eventKey);
  persistState();

  await maybeUpsertJob(logger, event, {
    event_key: eventKey,
    status: durableStatus,
    attempts,
    last_error: lastError,
    completed_at: new Date().toISOString(),
    next_retry_at: null,
  });

  logger[logLevel](
    {
      chain: event.chain,
      request_id: event.requestId,
      request_type: event.requestType,
      module_id: kernelIntent.moduleId,
      operation: kernelIntent.operation,
      event_key: eventKey,
      attempts,
      ...(logLevel === 'error' ? { error: lastError } : {}),
    },
    logMessage
  );

  return {
    event,
    ...(retryStatus === 'settled'
      ? { result: null }
      : { error: lastError }),
    retry_status: retryStatus,
    event_key: eventKey,
    attempts,
  };
}

/**
 * Collapse the four duplicated "delivery error: is it permanent / over the
 * callback ceiling? -> dead-letter, else schedule another attempt" arms (G2).
 * Computes the error class (unless one is supplied) and the ceiling decision once,
 * then routes to recordDeliveryExhaustion or scheduleCallbackRetry. Behavior-
 * preserving: each caller passes the exact exhaust route / terminalError and the
 * exact scheduleCallbackRetry options the original inline arm used.
 */
async function resolveDeliveryRetryOrExhaust(
  config,
  state,
  persistState,
  logger,
  event,
  kernelIntent,
  {
    nextAttempts,
    errorMessage,
    errorClass = null,
    exhaustRoute,
    exhaustTerminalError = null,
    retryOptions,
  }
) {
  const deliveryErrorClass = errorClass || classifyError(errorMessage);
  if (deliveryErrorClass === 'permanent' || nextAttempts > resolveCallbackRetryCeiling(config)) {
    return recordDeliveryExhaustion(config, state, persistState, logger, event, kernelIntent, {
      attempts: nextAttempts,
      route: exhaustRoute,
      errorMessage,
      errorClass: deliveryErrorClass,
      ...(exhaustTerminalError !== null ? { terminalError: exhaustTerminalError } : {}),
    });
  }
  return scheduleCallbackRetry(config, state, persistState, logger, event, kernelIntent, {
    nextAttempts,
    errorMessage,
    ...retryOptions,
  });
}

/**
 * Record a request finalized with an on-chain failure callback (the primary-
 * exhausted -> finalizeFailedRequest success path). Extracted from processEvent's
 * catch so the dispatcher stays small (G2). Behavior-preserving.
 */
async function recordFinalizedFailure(
  config,
  state,
  persistState,
  logger,
  event,
  kernelIntent,
  eventKey,
  attempts,
  result
) {
  incrementMetric(state, 'events_processed_total');
  incrementMetric(state, 'events_failed_total');
  incrementMetric(state, 'fulfill_failure_total');
  // F5: labeled failure detail for a request finalized with a failure callback.
  incrementLabeledFailure(state, event.chain, kernelIntent.moduleId, kernelIntent.operation);
  recordProcessedEvent(
    state,
    event.chain,
    event,
    'failed',
    {
      attempts,
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
    attempts,
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
      attempts,
      error: result.error,
    },
    'Finalized oracle request with an on-chain failure callback'
  );
  return { event, result, event_key: eventKey, attempts };
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

  const claim = await claimDurableJobForProcessing(config, logger, event, retryItem, state);
  if (!claim.granted) {
    if (claim.reason === 'backoff_skip' || claim.reason === 'unavailable') {
      // The cross-instance claim is offline (Supabase backoff / persistence
      // unavailable) and we declined to process this tick. The request is
      // UNPROCESSED, so its work must be RETAINED — never cleared, never counted
      // as a conflict — and retried once Supabase recovers. A fresh event (no
      // retryItem yet) is locally enqueued so the block-scan path does not drop
      // it; an existing retry item is left in place untouched (no attempt bump).
      if (!retryItem) {
        enqueueRetryItem(state, event.chain, event, {
          attempts,
          next_retry_at: Date.now() + computeRetryDelayMs(config, attempts + 1),
          first_failed_at: new Date().toISOString(),
          last_error: `durable_claim_${claim.reason}`,
          retryQueueLimit: config.retryQueueLimit,
          deadLetterLimit: config.deadLetterLimit,
        });
        persistState();
      }
      return {
        event,
        skipped: true,
        event_key: eventKey,
        attempts,
        retry_status: claim.reason,
      };
    }
    // Genuine cross-instance conflict: another relayer claimed it. Drop the local
    // retry item and count the conflict — re-processing would double-deliver.
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
        retryQueueLimit: config.retryQueueLimit,
        deadLetterLimit: config.deadLetterLimit,
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
    // F2: record the latency of the most recently delivered callback so a "slow
    // but recovering" lane is distinguishable from a "stuck" one.
    state.metrics.last_fulfill_latency_ms = Date.now() - processingStartedAt;

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
      return recordTerminalOutcome(config, state, persistState, logger, event, kernelIntent, {
        attempts,
        localStatus: 'settled',
        durableStatus: 'settled',
        route: isFinalizeOnly ? 'failure-finalize:already-fulfilled' : 'already-fulfilled',
        lastError: trimOnchainErrorMessage(message),
        logLevel: 'info',
        logMessage: 'Oracle request was already settled on-chain',
        retryStatus: 'settled',
      });
    }

    if (isTerminalConfigurationError(message)) {
      return recordTerminalOutcome(config, state, persistState, logger, event, kernelIntent, {
        attempts,
        localStatus: 'exhausted',
        durableStatus: 'failed_config',
        route: isFinalizeOnly ? 'failure-finalize:config-error' : 'config-error',
        lastError: trimOnchainErrorMessage(message),
        metric: 'retries_exhausted_total',
        logLevel: 'error',
        logMessage:
          'Relayer stopped retrying due to a terminal configuration or authorization error',
        retryStatus: 'terminal',
      });
    }

    if (preparedForRedelivery) {
      // Delivery errors never reach scheduleRetry, so the callback ceiling /
      // permanent short-circuit is enforced in resolveDeliveryRetryOrExhaust:
      // a permanently failing callback (e.g. a consumer that FAULTs on every test
      // invoke) dead-letters instead of redelivering the same payload forever.
      return resolveDeliveryRetryOrExhaust(config, state, persistState, logger, event, kernelIntent, {
        nextAttempts: attempts + 1,
        errorMessage: message,
        exhaustRoute: preparedForRedelivery.route || 'callback-delivery',
        retryOptions: {
          firstFailedAt: retryItem?.first_failed_at || new Date().toISOString(),
          extraRetryItemFields: {
            prepared_fulfillment: buildPreparedFulfillmentRetryMeta(preparedForRedelivery),
          },
          upsertStatus: 'callback_retry_scheduled',
          upsertExtras: {
            route: preparedForRedelivery.route,
            worker_status: preparedForRedelivery.worker_status,
          },
          upsertWorkerResponse: buildCallbackPendingWorkerResponse(
            preparedForRedelivery,
            kernelIntent
          ),
          retryStatus: 'callback_retry_scheduled',
          logLevel: 'warn',
          logMessage: 'Retrying prepared Morpheus oracle callback delivery',
          logModuleId: preparedForRedelivery.module_id || kernelIntent.moduleId,
          logOperation: preparedForRedelivery.operation || kernelIntent.operation,
        },
      });
    }

    if (isFinalizeOnly) {
      // The failure-finalize lane re-enqueues without scheduleRetry too: cap it
      // and dead-letter a finalize callback that fails permanently.
      return resolveDeliveryRetryOrExhaust(config, state, persistState, logger, event, kernelIntent, {
        nextAttempts: attempts + 1,
        errorMessage: message,
        exhaustRoute: 'failure-finalize',
        exhaustTerminalError: terminalError,
        retryOptions: {
          firstFailedAt: retryItem?.first_failed_at || new Date().toISOString(),
          extraRetryItemFields: { finalize_only: true, terminal_error: terminalError },
          upsertStatus: 'failure_callback_retry_scheduled',
          upsertWorkerResponse: {
            retry_meta: {
              finalize_only: true,
              terminal_error: terminalError,
              module_id: kernelIntent.moduleId,
              operation: kernelIntent.operation,
            },
          },
          retryStatus: 'scheduled',
          logLevel: 'warn',
          logMessage: 'Retrying terminal failure callback delivery',
        },
      });
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
        return recordFinalizedFailure(
          config,
          state,
          persistState,
          logger,
          event,
          kernelIntent,
          eventKey,
          retry.attempts,
          result
        );
      } catch (finalizeError) {
        // The finalize callback delivery itself failed: cap + dead-letter it, or
        // re-enqueue below the ceiling. terminal_error is the original primary
        // failure the failure callback is finalizing.
        const finalizeTerminalError = trimOnchainErrorMessage(message);
        return resolveDeliveryRetryOrExhaust(
          config,
          state,
          persistState,
          logger,
          event,
          kernelIntent,
          {
            nextAttempts: retry.attempts + 1,
            errorMessage: finalizeError,
            exhaustRoute: 'failure-finalize',
            exhaustTerminalError: finalizeTerminalError,
            retryOptions: {
              firstFailedAt: new Date().toISOString(),
              extraRetryItemFields: {
                finalize_only: true,
                terminal_error: finalizeTerminalError,
              },
              upsertStatus: 'failure_callback_retry_scheduled',
              upsertWorkerResponse: {
                retry_meta: {
                  finalize_only: true,
                  terminal_error: finalizeTerminalError,
                  module_id: kernelIntent.moduleId,
                  operation: kernelIntent.operation,
                },
              },
              retryStatus: 'scheduled',
              logLevel: 'error',
              logMessage: 'Primary execution exhausted; retrying terminal failure callback',
            },
          }
        );
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
