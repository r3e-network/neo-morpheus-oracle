import {
  buildDemoAttestationBody,
  buildLocalDemoAttestationBody,
  shouldUseLocalDemoFallback,
} from '@/lib/attestation-demo';
import { proxyToPhala } from '@/lib/phala';
import { recordOperationLog } from '@/lib/operation-logs';

export async function GET() {
  const payload = {
    mode: 'builtin',
    function: 'hash.sha256',
    input: {
      sample: true,
      message: 'morpheus-attestation-demo',
      version: 1,
    },
    target_chain: 'neo_n3',
    include_attestation: true,
  };

  const response = await proxyToPhala('/compute/execute', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }

  const finalBody = shouldUseLocalDemoFallback(response.status, body)
    ? buildLocalDemoAttestationBody(payload, body)
    : buildDemoAttestationBody(payload, body, { source: 'runtime' });
  const finalStatus = shouldUseLocalDemoFallback(response.status, body) ? 200 : response.status;

  await recordOperationLog({
    route: '/api/attestation/demo',
    method: 'GET',
    category: 'attestation',
    requestPayload: payload,
    responsePayload: finalBody,
    httpStatus: finalStatus,
    metadata: { upstream_path: '/compute/execute', upstream_status: response.status },
  });
  return Response.json(finalBody, { status: finalStatus });
}
