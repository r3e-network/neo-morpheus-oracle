import {
  REPLAY_WINDOW_MS,
  env,
  sha256Hex,
  stableStringify,
  strip0x,
  trimString,
} from '../platform/core.js';
import { wallet as neoWallet } from '@neo-morpheus-oracle/neon-compat';
import { deriveNeoN3PrivateKeyHex, shouldUseDerivedKeys } from '../platform/dstack.js';
import {
  NEO_N3_SIGNER_ENV_KEYS,
  normalizeMorpheusNetwork,
  reportPinnedNeoN3Role,
  resolvePinnedNeoN3Role,
} from '../../../../scripts/lib-neo-signers.mjs';

function resolveOracleVerifierRole(payload = {}) {
  const explicit = trimString(payload.dstack_key_role || payload.key_role || '');
  return explicit.toLowerCase() === 'oracle_verifier';
}

function resolveRequestedNeoN3DerivedRole(payload = {}) {
  const explicit = trimString(payload.dstack_key_role || payload.key_role || '');
  return explicit || 'worker';
}

function snapshotSignerEnv() {
  const snapshot = {};
  for (const key of NEO_N3_SIGNER_ENV_KEYS) {
    const value = trimString(env(key));
    if (value) snapshot[key] = value;
  }
  return snapshot;
}

function resolveNeoN3OracleVerifierKey() {
  const network = normalizeMorpheusNetwork(
    env('MORPHEUS_NETWORK', 'NEXT_PUBLIC_MORPHEUS_NETWORK') || 'testnet'
  );
  const report = reportPinnedNeoN3Role(network, 'oracle_verifier', {
    env: snapshotSignerEnv(),
    allowMissing: true,
  });
  if (report.issues.length > 0) {
    throw new Error(report.issues.join('; '));
  }
  if (!report.materialized) return '';
  return report.materialized.private_key || report.materialized.wif || '';
}

function resolveNeoN3WorkerKey() {
  const network = normalizeMorpheusNetwork(
    env('MORPHEUS_NETWORK', 'NEXT_PUBLIC_MORPHEUS_NETWORK') || 'testnet'
  );
  const signer = reportPinnedNeoN3Role(network, 'worker', {
    env: snapshotSignerEnv(),
    allowMissing: true,
  });
  if (signer.issues.length > 0) {
    throw new Error(signer.issues.join('; '));
  }
  return signer.materialized?.private_key || signer.materialized?.wif || '';
}

const seenRequestIds = new Map();

export function pruneSeenRequestIds() {
  const cutoff = Date.now() - REPLAY_WINDOW_MS;
  for (const [requestId, createdAt] of seenRequestIds.entries()) {
    if (createdAt < cutoff) seenRequestIds.delete(requestId);
  }
}

export function rememberRequestId(requestId) {
  pruneSeenRequestIds();
  if (seenRequestIds.has(requestId)) return false;
  seenRequestIds.set(requestId, Date.now());
  return true;
}

export function forgetRequestId(requestId) {
  if (requestId) seenRequestIds.delete(requestId);
}

export function resolveSigningBytes(payload) {
  if (trimString(payload.data_hex)) {
    return { bytes: Buffer.from(strip0x(payload.data_hex), 'hex'), source: 'data_hex' };
  }
  if (trimString(payload.data_base64)) {
    return { bytes: Buffer.from(payload.data_base64, 'base64'), source: 'data_base64' };
  }
  if (typeof payload.message === 'string') {
    return { bytes: Buffer.from(payload.message, 'utf8'), source: 'message' };
  }
  if (typeof payload.data === 'string') {
    return { bytes: Buffer.from(payload.data, 'utf8'), source: 'data:string' };
  }
  if (payload.data !== undefined) {
    return { bytes: Buffer.from(stableStringify(payload.data), 'utf8'), source: 'data:json' };
  }
  throw new Error('one of data, message, data_hex, or data_base64 is required');
}

export async function maybeSignNeoN3Bytes(bytes, payload = {}) {
  const useOracleVerifierRole = resolveOracleVerifierRole(payload);
  const requestScopedKey =
    trimString(payload.private_key) || trimString(payload.signing_key) || trimString(payload.wif);
  const configuredOracleVerifierKey = useOracleVerifierRole ? resolveNeoN3OracleVerifierKey() : '';
  let privateKey = requestScopedKey || configuredOracleVerifierKey || resolveNeoN3WorkerKey();

  const allowDerivedOverride =
    !requestScopedKey && (!useOracleVerifierRole || !configuredOracleVerifierKey);
  if (shouldUseDerivedKeys(payload) && allowDerivedOverride) {
    const requestedRole = resolveRequestedNeoN3DerivedRole(payload);
    try {
      privateKey = await deriveNeoN3PrivateKeyHex(requestedRole);
    } catch {
      // If the dedicated oracle_verifier path is absent, reuse the worker role.
      if (useOracleVerifierRole && requestedRole !== 'worker') {
        try {
          privateKey = await deriveNeoN3PrivateKeyHex('worker');
        } catch {
          // fall back to explicit/env key material if available
        }
      }
    }
  }
  if (!privateKey) return null;

  const account = new neoWallet.Account(privateKey);
  const payloadBuffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return {
    signature: neoWallet.sign(payloadBuffer.toString('hex'), account.privateKey),
    public_key: account.publicKey,
    address: account.address,
    script_hash: `0x${account.scriptHash}`,
  };
}

async function maybeSignWorkerNeoN3Bytes(bytes, payload = {}) {
  let privateKey = resolveNeoN3WorkerKey();
  if (shouldUseDerivedKeys(payload)) {
    try {
      privateKey = await deriveNeoN3PrivateKeyHex(
        trimString(payload.dstack_key_role || payload.key_role || 'worker') || 'worker'
      );
    } catch {
      // fall back to configured worker key material if available
    }
  }
  if (!privateKey) return null;

  const account = new neoWallet.Account(privateKey);
  const payloadBuffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return {
    signature: neoWallet.sign(payloadBuffer.toString('hex'), account.privateKey),
    public_key: account.publicKey,
    address: account.address,
    script_hash: `0x${account.scriptHash}`,
  };
}

export async function buildSignedResultEnvelope(result, payload = {}) {
  const payloadBytes = Buffer.from(stableStringify(result), 'utf8');
  const outputHash = sha256Hex(payloadBytes);
  const signature = await maybeSignWorkerNeoN3Bytes(payloadBytes, payload);
  return {
    output_hash: outputHash,
    attestation_hash: outputHash,
    signature: signature?.signature || null,
    public_key: signature?.public_key || null,
    signer_address: signature?.address || null,
    signer_script_hash: signature?.script_hash || null,
  };
}

export function buildVerificationEnvelope(signed, teeAttestation = null) {
  return {
    output_hash: signed.output_hash,
    attestation_hash: signed.attestation_hash,
    signature: signed.signature,
    public_key: signed.public_key,
    signer_address: signed.signer_address || null,
    signer_script_hash: signed.signer_script_hash || null,
    tee_attestation: teeAttestation,
  };
}
