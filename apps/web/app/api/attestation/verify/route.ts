import { verifyAttestation } from '@/lib/attestation';
import {
  verifyNitroAttestationDocument,
  type NitroVerificationResult,
} from '@/lib/nitro-attestation';
import { recordOperationLog } from '@/lib/operation-logs';
import { badRequest } from '@/lib/api-helpers';

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

/**
 * Pull the raw base64 attestation document out of any of the shapes a caller
 * might send it in (top-level, nested under attestation/tee_attestation, or
 * inside a worker_response/envelope).
 */
function extractAttestationDocument(body: Record<string, unknown>): string | undefined {
  const candidates: unknown[] = [
    body.attestation_document,
    body.attestation_document_b64,
    (body.attestation as Record<string, unknown> | undefined)?.attestation_document,
    (body.tee_attestation as Record<string, unknown> | undefined)?.attestation_document,
    (body.envelope as Record<string, unknown> | undefined)?.attestation_document,
    (body.worker_response as Record<string, unknown> | undefined)?.attestation_document,
  ];
  for (const candidate of candidates) {
    const value = optionalString(candidate);
    if (value) return value;
  }
  return undefined;
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

  // ----- Layer 2 (new): REAL Nitro measurement chain (COSE + cert chain + PCR + binding). -----
  // Run first so its verified flag feeds the layer-1 verifier's redefined
  // `full_attestation_ok` / `measurement_chain_verified`.
  const attestationDocument = extractAttestationDocument(body as Record<string, unknown>);
  const expectedPcrs = {
    pcr0: optionalString(body.expected_pcr0),
    pcr1: optionalString(body.expected_pcr1),
    pcr2: optionalString(body.expected_pcr2),
  };

  let nitro: NitroVerificationResult | null = null;
  let nitroError: string | null = null;
  if (attestationDocument) {
    try {
      nitro = await verifyNitroAttestationDocument(attestationDocument, {
        expectedPcrs,
        expectedUserDataHex: optionalString(body.expected_user_data_hex),
        expectedSignerPublicKey: optionalString(body.expected_signer_public_key),
        nonce: optionalString(body.nonce),
      });
    } catch (error) {
      nitroError = error instanceof Error ? error.message : String(error);
    }
  }
  const measurementChainVerified = Boolean(nitro?.measurement_chain_verified);

  // ----- Layer 1 (legacy): output_hash <-> result hash binding + metadata. -----
  // `full_attestation_ok` / `measurement_chain_verified` REQUIRE layer 2.
  const hashBinding = verifyAttestation({
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
    nitroMeasurementChainVerified: measurementChainVerified,
  });

  const result = {
    ...hashBinding,
    nitro_attestation: nitro
      ? {
          cose_signature_ok: nitro.cose_signature_ok,
          cert_chain_ok: nitro.cert_chain_ok,
          root_pinned_ok: nitro.root_pinned_ok,
          pcr0_match: nitro.pcr0_match,
          pcr1_match: nitro.pcr1_match,
          pcr2_match: nitro.pcr2_match,
          user_data_bound_ok: nitro.user_data_bound_ok,
          public_key_bound_ok: nitro.public_key_bound_ok,
          nonce_match: nitro.nonce_match,
          timestamp_fresh: nitro.timestamp_fresh,
          measurement_chain_verified: nitro.measurement_chain_verified,
          errors: nitro.errors,
          document: nitro.document,
        }
      : null,
    nitro_attestation_error: nitroError,
  };

  // `ok` keeps its legacy meaning (the hash binding) so existing consumers do
  // not break; over-trust is prevented because full_attestation_ok now requires
  // the measurement chain.
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
