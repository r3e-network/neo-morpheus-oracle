import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression tests for operation-log secret redaction (A1/E1).
 *
 * `signing_key` is consumed by /sign/payload + /relay/transaction and was
 * previously written cleartext to Supabase + BetterStack. It must be redacted
 * (along with the mnemonic/seed/passphrase/credential family), while public
 * key material (public_key / oracle_public_key / key_role) must NOT be
 * over-redacted.
 */

const insertedRows: Array<Record<string, any>> = [];
const insert = vi.fn(async (row: Record<string, any>) => {
  insertedRows.push(row);
  return { error: null };
});
const betterstackPayloads: Array<Record<string, any>> = [];
const getServerSupabaseClient = vi.fn(() => ({
  from: vi.fn(() => ({ insert })),
}));
const resolveProjectIdBySlug = vi.fn(async () => null);
const resolveSupabaseNetwork = vi.fn(() => 'testnet');
const emitBetterStackOperationLog = vi.fn((payload: Record<string, any>) => {
  betterstackPayloads.push(payload);
});

vi.mock('@/lib/server-supabase', () => ({
  getServerSupabaseClient,
  resolveProjectIdBySlug,
  resolveSupabaseNetwork,
}));
vi.mock('@/lib/betterstack-log-sink', () => ({ emitBetterStackOperationLog }));

async function importModule() {
  const mod = await import('../lib/operation-logs');
  return { ...mod, flush: mod.flushPendingOperationLogs };
}

describe('operation log secret redaction', () => {
  beforeEach(() => {
    vi.resetModules();
    insertedRows.length = 0;
    betterstackPayloads.length = 0;
    insert.mockClear();
    emitBetterStackOperationLog.mockClear();
  });

  it('redacts signing_key and signingKey in both Supabase and BetterStack payloads', async () => {
    const { recordOperationLog, flush } = await importModule();
    await recordOperationLog({
      route: '/api/relay/transaction',
      method: 'POST',
      category: 'relay',
      requestPayload: {
        signing_key: 'KxSECRETwifvalue1111111111111111111111111111111111111',
        signingKey: 'KySECRETwifvalue2222222222222222222222222222222222222',
        target_chain: 'neo_n3',
      },
      httpStatus: 200,
    });
    await flush();

    expect(insertedRows.length).toBe(1);
    const row = insertedRows[0];
    expect(row.request_payload.signing_key).toBe('[REDACTED]');
    expect(row.request_payload.signingKey).toBe('[REDACTED]');

    expect(betterstackPayloads.length).toBe(1);
    expect(betterstackPayloads[0].request_payload.signing_key).toBe('[REDACTED]');
    expect(betterstackPayloads[0].request_payload.signingKey).toBe('[REDACTED]');
  });

  it('redacts the mnemonic/seed/passphrase/credential family', async () => {
    const { recordOperationLog, flush } = await importModule();
    await recordOperationLog({
      route: '/api/sign/payload',
      method: 'POST',
      category: 'signing',
      requestPayload: {
        mnemonic: 'twelve words that should never be logged in clear text here',
        seed: 'deadbeefseed',
        passphrase: 'hunter2',
        credential: 'supersecret',
      },
      httpStatus: 200,
    });
    await flush();

    const row = insertedRows[0];
    expect(row.request_payload.mnemonic).toBe('[REDACTED]');
    expect(row.request_payload.seed).toBe('[REDACTED]');
    expect(row.request_payload.passphrase).toBe('[REDACTED]');
    expect(row.request_payload.credential).toBe('[REDACTED]');
  });

  it('redacts raw-string payloads by value shape (raw_body/raw_payload/raw_string)', async () => {
    const { recordOperationLog, flush } = await importModule();
    await recordOperationLog({
      route: '/api/relay/transaction',
      method: 'POST',
      category: 'relay',
      requestPayload: {
        raw_body: 'KxSECRETwifsmuggledInAnOpaqueBlob1111111111111111111111111',
        raw_payload: '{"wif":"KySECRETnestedInRawJson2222222222222222222222222"}',
        rawString: 'another opaque secret blob',
        request_id: 'req-123',
      },
      httpStatus: 200,
    });
    await flush();

    const row = insertedRows[0];
    expect(row.request_payload.raw_body).toMatch(/^\[REDACTED-RAW sha256:[0-9a-f]{16}\]$/);
    expect(row.request_payload.raw_payload).toMatch(/^\[REDACTED-RAW sha256:[0-9a-f]{16}\]$/);
    expect(row.request_payload.rawString).toMatch(/^\[REDACTED-RAW sha256:[0-9a-f]{16}\]$/);
    // Non-secret structured fields are preserved.
    expect(row.request_payload.request_id).toBe('req-123');
    // The same opaque value hashes identically (stable fingerprint).
    expect(betterstackPayloads[0].request_payload.raw_body).toBe(row.request_payload.raw_body);
  });

  it('scrubs credentials embedded in URL userinfo for any string value', async () => {
    const { recordOperationLog, flush } = await importModule();
    await recordOperationLog({
      route: '/api/feeds/tick',
      method: 'POST',
      category: 'feed',
      requestPayload: {
        upstream: 'https://user:s3cr3tpass@provider.example.com/v1/prices',
        note: 'no credentials here',
      },
      httpStatus: 200,
    });
    await flush();

    const row = insertedRows[0];
    expect(row.request_payload.upstream).toBe('https://[REDACTED]@provider.example.com/v1/prices');
    expect(row.request_payload.note).toBe('no credentials here');
  });

  it('does not over-redact public key material', async () => {
    const { recordOperationLog, flush } = await importModule();
    await recordOperationLog({
      route: '/api/sign/payload',
      method: 'POST',
      category: 'signing',
      requestPayload: {
        public_key: '03abcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcab',
        oracle_public_key: '02ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
        key_role: 'oracle',
      },
      httpStatus: 200,
    });
    await flush();

    const row = insertedRows[0];
    expect(row.request_payload.public_key).not.toBe('[REDACTED]');
    expect(row.request_payload.oracle_public_key).not.toBe('[REDACTED]');
    expect(row.request_payload.key_role).toBe('oracle');
  });
});
