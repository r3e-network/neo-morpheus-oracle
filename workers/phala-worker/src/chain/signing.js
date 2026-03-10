import { REPLAY_WINDOW_MS, sha256Hex, stableStringify, strip0x, trimString } from "../platform/core.js";
import { wallet as neoWallet } from "@cityofzion/neon-js";
import { deriveNeoN3PrivateKeyHex, shouldUseDerivedKeys } from "../platform/dstack.js";

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
    return { bytes: Buffer.from(strip0x(payload.data_hex), "hex"), source: "data_hex" };
  }
  if (trimString(payload.data_base64)) {
    return { bytes: Buffer.from(payload.data_base64, "base64"), source: "data_base64" };
  }
  if (typeof payload.message === "string") {
    return { bytes: Buffer.from(payload.message, "utf8"), source: "message" };
  }
  if (typeof payload.data === "string") {
    return { bytes: Buffer.from(payload.data, "utf8"), source: "data:string" };
  }
  if (payload.data !== undefined) {
    return { bytes: Buffer.from(stableStringify(payload.data), "utf8"), source: "data:json" };
  }
  throw new Error("one of data, message, data_hex, or data_base64 is required");
}

export async function maybeSignNeoN3Bytes(bytes, payload = {}) {
  let privateKey = trimString(payload.private_key)
    || trimString(payload.signing_key)
    || trimString(payload.wif)
    || trimString(process.env.PHALA_NEO_N3_PRIVATE_KEY || process.env.PHALA_NEO_N3_WIF || process.env.NEO_N3_WIF || process.env.NEO_PLATFORM_KEY || process.env.TEE_PRIVATE_KEY || process.env.NEO_TESTNET_WIF || "");
  if (shouldUseDerivedKeys(payload)) {
    try {
      privateKey = await deriveNeoN3PrivateKeyHex(trimString(payload.dstack_key_role || payload.key_role || "worker") || "worker");
    } catch {
      // fall back to explicit/env key material if available
    }
  }
  if (!privateKey) return null;

  const account = new neoWallet.Account(privateKey);
  const payloadBuffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return {
    signature: neoWallet.sign(payloadBuffer.toString("hex"), account.privateKey),
    public_key: account.publicKey,
    address: account.address,
    script_hash: `0x${account.scriptHash}`,
  };
}

async function maybeSignWorkerNeoN3Bytes(bytes, payload = {}) {
  let privateKey = trimString(process.env.PHALA_NEO_N3_PRIVATE_KEY || process.env.PHALA_NEO_N3_WIF || process.env.NEO_N3_WIF || process.env.NEO_PLATFORM_KEY || process.env.TEE_PRIVATE_KEY || process.env.NEO_TESTNET_WIF || "");
  if (shouldUseDerivedKeys(payload)) {
    try {
      privateKey = await deriveNeoN3PrivateKeyHex(trimString(payload.dstack_key_role || payload.key_role || "worker") || "worker");
    } catch {
      // fall back to configured worker key material if available
    }
  }
  if (!privateKey) return null;

  const account = new neoWallet.Account(privateKey);
  const payloadBuffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return {
    signature: neoWallet.sign(payloadBuffer.toString("hex"), account.privateKey),
    public_key: account.publicKey,
    address: account.address,
    script_hash: `0x${account.scriptHash}`,
  };
}

export async function buildSignedResultEnvelope(result, payload = {}) {
  const payloadBytes = Buffer.from(stableStringify(result), "utf8");
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
