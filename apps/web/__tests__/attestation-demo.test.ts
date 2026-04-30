import { describe, expect, it } from 'vitest';

import {
  buildLocalDemoAttestationBody,
  DEMO_ATTESTATION_APP_ID,
  DEMO_ATTESTATION_COMPOSE_HASH,
  shouldUseLocalDemoFallback,
} from '../lib/attestation-demo';
import { verifyAttestation } from '../lib/attestation';

const demoPayload = {
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

describe('attestation demo fallback', () => {
  it('falls back for auth-gated demo runtime responses that cannot return attestation JSON', () => {
    expect(shouldUseLocalDemoFallback(403, { error: 'turnstile_required' })).toBe(true);
    expect(shouldUseLocalDemoFallback(401, { error: 'unauthorized' })).toBe(true);
    expect(shouldUseLocalDemoFallback(404, { error: 'not_found' })).toBe(true);
    expect(shouldUseLocalDemoFallback(403, { error: 'forbidden' })).toBe(false);
    expect(shouldUseLocalDemoFallback(500, { error: 'turnstile_required' })).toBe(false);
    expect(shouldUseLocalDemoFallback(404, { error: 'missing' })).toBe(false);
    expect(shouldUseLocalDemoFallback(200, { ok: true })).toBe(false);
  });

  it('builds a static local demo envelope that the verifier fully accepts', () => {
    const body = buildLocalDemoAttestationBody(demoPayload, { error: 'turnstile_required' });
    const input = body.verifier_input;

    expect(body.demo_source).toBe('local_static_fallback');
    expect(input.expected_app_id).toBe(DEMO_ATTESTATION_APP_ID);
    expect(input.expected_compose_hash).toBe(DEMO_ATTESTATION_COMPOSE_HASH);
    expect(input.expected_output_hash).toBeTruthy();
    expect(input.expected_attestation_hash).toBe(input.expected_output_hash);

    const result = verifyAttestation({
      envelope: input.envelope,
      attestation: input.attestation,
      expectedPayload: input.expected_payload,
      expectedOutputHash: input.expected_output_hash || undefined,
      expectedAttestationHash: input.expected_attestation_hash || undefined,
      expectedComposeHash: input.expected_compose_hash,
      expectedAppId: input.expected_app_id,
    });

    expect(result.ok).toBe(true);
    expect(result.binding_ok).toBe(true);
    expect(result.full_attestation_ok).toBe(true);
    expect(result.failed).toEqual([]);
  });
});
