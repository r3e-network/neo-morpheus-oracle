import { json } from '../platform/core.js';
import { buildSignedResultEnvelope, buildVerificationEnvelope } from '../chain/index.js';
import { maybeBuildDstackAttestation } from '../platform/dstack.js';

export async function handleVrf(payload) {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const randomness = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const signed = await buildSignedResultEnvelope({ randomness }, payload);
  const teeAttestation = await maybeBuildDstackAttestation(payload, signed.output_hash);
  return json(200, {
    request_id: payload.request_id || crypto.randomUUID(),
    randomness,
    signature: signed.signature,
    public_key: signed.public_key,
    attestation_hash: signed.attestation_hash,
    tee_attestation: teeAttestation,
    verification: buildVerificationEnvelope(signed, teeAttestation),
    timestamp: Math.floor(Date.now() / 1000),
    vrf_method: 'csprng-signed',
  });
}
