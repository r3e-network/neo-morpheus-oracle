import { json } from '../platform/core.js';
import { buildSignedResultEnvelope, buildLaneSignedEnvelope } from '../chain/index.js';
import { maybeBuildDstackAttestation } from '../platform/nitro-signer.js';

export async function handleVrf(payload) {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const randomness = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const signed = await buildSignedResultEnvelope({ randomness }, payload);
  const teeAttestation = await maybeBuildDstackAttestation(payload, signed.output_hash);
  return json(200, {
    request_id: payload.request_id || crypto.randomUUID(),
    randomness,
    // D5: emit the canonical signed-result envelope (now including output_hash,
    // which the VRF lane previously dropped) so verification is uniform across
    // every fulfillment lane. Lane-specific fields are kept.
    ...buildLaneSignedEnvelope(signed, teeAttestation),
    timestamp: Math.floor(Date.now() / 1000),
    vrf_method: 'csprng-signed',
  });
}
