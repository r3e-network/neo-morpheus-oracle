import { json, normalizeTargetChain, sha256Hex, stableStringify } from "../platform/core.js";
import { resolveSigningBytes, buildSignedResultEnvelope } from "./signing.js";
import { loadNeoN3Context, relayNeoN3Invocation, sponsorNeoN3Transaction, broadcastNeoN3RawTransaction } from "./neo-n3.js";
import { handleSignPayloadNeoX, relayNeoXTransaction } from "./neo-x.js";
import { wallet as neoWallet } from "@cityofzion/neon-js";

export { buildSignedResultEnvelope } from "./signing.js";
export { loadNeoN3Context, relayNeoN3Invocation, sponsorNeoN3Transaction, broadcastNeoN3RawTransaction } from "./neo-n3.js";
export { relayNeoXTransaction } from "./neo-x.js";
export { normalizeNeoHash160, isConfiguredHash160 } from "../platform/allowlist.js";

export async function handleSignPayload(payload) {
  const targetChain = normalizeTargetChain(payload.target_chain);
  if (targetChain === "neo_n3") {
    const context = loadNeoN3Context(payload, { required: true, requireRpc: false });
    const { bytes, source } = resolveSigningBytes(payload);
    const signature = neoWallet.sign(bytes.toString("hex"), context.account.privateKey);
    return json(200, {
      target_chain: "neo_n3",
      source,
      payload_hash: sha256Hex(bytes),
      signature,
      public_key: context.account.publicKey,
      address: context.account.address,
      script_hash: `0x${context.account.scriptHash}`,
    });
  }

  return json(200, await handleSignPayloadNeoX(payload));
}

export async function handleRelayTransaction(payload) {
  const targetChain = normalizeTargetChain(payload.target_chain);
  if (targetChain === "neo_x") {
    return json(200, await relayNeoXTransaction(payload));
  }

  if ((payload.tx_base64 || payload.txBase64) && (payload.user_address || payload.userAddress)) {
    return json(200, await sponsorNeoN3Transaction(payload));
  }

  if (payload.raw_transaction || payload.raw_tx || payload.signed_tx || payload.tx_base64 || payload.tx_hex) {
    return json(200, await broadcastNeoN3RawTransaction(payload));
  }

  const invokeResult = await relayNeoN3Invocation(payload);
  return json(invokeResult.status, invokeResult.body);
}

export async function handleTxProxyInvoke(payload) {
  const invokeResult = await relayNeoN3Invocation(payload);
  return json(invokeResult.status, invokeResult.body);
}
