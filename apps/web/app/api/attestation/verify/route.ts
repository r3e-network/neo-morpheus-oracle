import { verifyAttestation } from '@/lib/attestation';
import { recordOperationLog } from '@/lib/operation-logs';

function badRequest(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    const response = badRequest('invalid JSON body');
    await recordOperationLog({
      route: '/api/attestation/verify',
      method: 'POST',
      category: 'attestation',
      requestPayload: body,
      responsePayload: { error: 'invalid JSON body' },
      httpStatus: 400,
      error: 'invalid JSON body',
    });
    return response;
  }

  const result = verifyAttestation({
    envelope: body.envelope ?? body.worker_response ?? body.callback_result ?? body.response,
    verification: body.verification,
    attestation:
      body.attestation ??
      body.envelope ??
      body.worker_response ??
      body.callback_result ??
      body.response,
    expectedPayload: body.expected_payload,
    expectedOutputHash:
      typeof body.expected_output_hash === 'string' ? body.expected_output_hash : undefined,
    expectedAttestationHash:
      typeof body.expected_attestation_hash === 'string'
        ? body.expected_attestation_hash
        : undefined,
    expectedOnchainAttestationHash:
      typeof body.expected_onchain_attestation_hash === 'string'
        ? body.expected_onchain_attestation_hash
        : undefined,
    expectedComposeHash:
      typeof body.expected_compose_hash === 'string' ? body.expected_compose_hash : undefined,
    expectedAppId: typeof body.expected_app_id === 'string' ? body.expected_app_id : undefined,
    expectedInstanceId:
      typeof body.expected_instance_id === 'string' ? body.expected_instance_id : undefined,
  });

  const status = result.ok ? 200 : 400;
  await recordOperationLog({
    route: '/api/attestation/verify',
    method: 'POST',
    category: 'attestation',
    requestPayload: body,
    responsePayload: result,
    httpStatus: status,
    error: result.ok ? null : 'attestation verification failed',
  });
  return Response.json(result, { status });
}
