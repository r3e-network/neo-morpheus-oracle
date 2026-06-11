import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveEncryptedTokenCiphertext } from './crypto.js';

const originalFetch = global.fetch;
const originalSupabaseUrl = process.env.SUPABASE_URL;
const originalSupabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

test.afterEach(() => {
  global.fetch = originalFetch;
  if (originalSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalSupabaseUrl;
  if (originalSupabaseServiceRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = originalSupabaseServiceRoleKey;
});

test('encrypted ref lookup and claim fetches are bounded by abort signals', async () => {
  process.env.SUPABASE_URL = 'https://mock-supabase.example.com';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';

  const calls = [];
  global.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const row = { id: 'ref-1', ciphertext: 'sealed-token', network: 'testnet', metadata: {} };
    if ((init.method || 'GET') === 'PATCH') {
      return new Response(
        JSON.stringify([
          { ...row, metadata: { _consumed_request_id: 'req-1', _consumed_at: 'now' } },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify([row]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const ciphertext = await resolveEncryptedTokenCiphertext({
    encrypted_token_ref: 'ref-1',
    request_id: 'req-1',
  });
  assert.equal(ciphertext, 'sealed-token');
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.ok(
      call.init.signal instanceof AbortSignal,
      `expected abort signal on ${call.init.method || 'GET'} ${call.url}`
    );
  }
});
