import { json } from "../platform/core.js";
import { buildSignedResultEnvelope } from "../chain/index.js";

export async function handleVrf(payload) {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const randomness = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const signed = buildSignedResultEnvelope({ randomness });
  return json(200, {
    request_id: payload.request_id || crypto.randomUUID(),
    randomness,
    signature: signed.signature,
    public_key: signed.public_key,
    attestation_hash: signed.attestation_hash,
    timestamp: Math.floor(Date.now() / 1000),
  });
}
