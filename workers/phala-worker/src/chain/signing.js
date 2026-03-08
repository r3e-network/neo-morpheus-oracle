import { REPLAY_WINDOW_MS, sha256Hex, stableStringify, strip0x, trimString } from "../platform/core.js";
import { loadNeoN3Context } from "./neo-n3.js";
import { wallet as neoWallet } from "@cityofzion/neon-js";

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

export function maybeSignNeoN3Bytes(bytes) {
  const context = loadNeoN3Context({}, { required: false, requireRpc: false });
  if (!context) return null;
  const payloadBuffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return {
    signature: neoWallet.sign(payloadBuffer.toString("hex"), context.account.privateKey),
    public_key: context.account.publicKey,
    address: context.account.address,
    script_hash: `0x${context.account.scriptHash}`,
  };
}

export function buildSignedResultEnvelope(result) {
  const payloadBytes = Buffer.from(stableStringify(result), "utf8");
  const outputHash = sha256Hex(payloadBytes);
  const signature = maybeSignNeoN3Bytes(payloadBytes);
  return {
    output_hash: outputHash,
    attestation_hash: outputHash,
    signature: signature?.signature || null,
    public_key: signature?.public_key || null,
    signer_address: signature?.address || null,
    signer_script_hash: signature?.script_hash || null,
  };
}
