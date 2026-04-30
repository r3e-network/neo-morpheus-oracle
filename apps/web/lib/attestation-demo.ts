import { createHash } from 'node:crypto';

export const DEMO_ATTESTATION_APP_ID = 'morpheus-local-demo';
export const DEMO_ATTESTATION_COMPOSE_HASH =
  '21ac32fc4f61d2abeab119a6f932c70969f87489dfe4db71b20f78821ac22f06';

export type DemoAttestationBody = {
  demo_request: Record<string, unknown>;
  worker_response: Record<string, unknown>;
  verifier_input: {
    envelope: Record<string, unknown>;
    attestation: Record<string, unknown> | null;
    expected_payload: Record<string, unknown>;
    expected_output_hash: string | null;
    expected_attestation_hash: string | null;
    expected_compose_hash?: string;
    expected_app_id?: string;
  };
  demo_source?: 'runtime' | 'local_static_fallback';
  upstream_error?: unknown;
};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(',')}}`;
}

function sha256Hex(value: unknown) {
  return createHash('sha256')
    .update(Buffer.from(typeof value === 'string' ? value : stableStringify(value), 'utf8'))
    .digest('hex');
}

export function shouldUseLocalDemoFallback(status: number, body: unknown) {
  if (!body || typeof body !== 'object') return false;
  const error = (body as { error?: unknown }).error;
  return (
    (status === 403 && error === 'turnstile_required') ||
    (status === 401 && error === 'unauthorized') ||
    (status === 404 && error === 'not_found')
  );
}

export function buildDemoAttestationBody(
  payload: Record<string, unknown>,
  workerBody: Record<string, unknown>,
  options: { source?: DemoAttestationBody['demo_source']; upstreamError?: unknown } = {}
): DemoAttestationBody {
  const attestation =
    (workerBody?.tee_attestation as Record<string, unknown> | undefined) ||
    ((workerBody?.verification as Record<string, unknown> | undefined)?.tee_attestation as
      | Record<string, unknown>
      | undefined) ||
    null;
  const verification = workerBody?.verification as Record<string, unknown> | undefined;

  const expectedPayload = {
    function: workerBody?.function,
    result: workerBody?.result,
    entry_point: workerBody?.entry_point,
  };

  return {
    demo_request: payload,
    worker_response: workerBody,
    verifier_input: {
      envelope: workerBody,
      attestation,
      expected_payload: expectedPayload,
      expected_output_hash:
        (verification?.output_hash as string | undefined) ||
        (workerBody?.output_hash as string | undefined) ||
        null,
      expected_attestation_hash:
        (verification?.attestation_hash as string | undefined) ||
        (workerBody?.attestation_hash as string | undefined) ||
        null,
      expected_compose_hash: (attestation?.compose_hash as string | undefined) || undefined,
      expected_app_id: (attestation?.app_id as string | undefined) || undefined,
    },
    ...(options.source ? { demo_source: options.source } : {}),
    ...(options.upstreamError ? { upstream_error: options.upstreamError } : {}),
  };
}

export function buildLocalDemoAttestationBody(
  payload: Record<string, unknown>,
  upstreamError: unknown
): DemoAttestationBody {
  const result = {
    mode: 'builtin',
    function: 'hash.sha256',
    input: payload.input,
    target_chain: payload.target_chain,
    result: sha256Hex(payload.input),
  };
  const expectedPayload = {
    function: result.function,
    result,
    entry_point: 'local-static-demo',
  };
  const outputHash = sha256Hex(expectedPayload);
  const teeAttestation = {
    app_id: DEMO_ATTESTATION_APP_ID,
    compose_hash: DEMO_ATTESTATION_COMPOSE_HASH,
    report_data: `${outputHash}${'0'.repeat(64)}`,
    quote: 'local-static-demo-quote',
    event_log: [],
  };
  const workerBody = {
    version: 'morpheus-result/v1',
    request_type: 'privacy_oracle',
    module_id: 'demo.local',
    operation: 'local-static-attestation-demo',
    success: true,
    function: result.function,
    result,
    entry_point: expectedPayload.entry_point,
    verification: {
      output_hash: outputHash,
      attestation_hash: outputHash,
      tee_attestation: teeAttestation,
    },
  };

  return buildDemoAttestationBody(payload, workerBody, {
    source: 'local_static_fallback',
    upstreamError,
  });
}
