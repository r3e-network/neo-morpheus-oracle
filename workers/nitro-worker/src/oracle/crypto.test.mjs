import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createCipheriv, generateKeyPairSync } from 'node:crypto';
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

test('enclave unseals the X25519 keystore from env ciphertext — RC2 no host unseal', async () => {
  const signer = await import('../platform/nitro-signer.js');
  const cryptoMod = await import('./crypto.js');

  // Deterministic Secrets Manager master so the in-TEE wrap key is reproducible.
  signer.__setSecretsProviderForTests(() => ({
    getSecret: async () => Buffer.alloc(48, 7).toString('base64'),
  }));
  const savedPlain = process.env.MORPHEUS_ORACLE_KEY_MATERIAL_BASE64;
  const savedEphemeral = process.env.MORPHEUS_ALLOW_EPHEMERAL_KEY;
  try {
    // The same wrap key the enclave will derive itself (via the mocked SDK).
    const wrapKey = (
      await signer.deriveKeyBytes('morpheus/oracle/encryption/wrap/v1', 'oracle-encryption-wrap')
    ).subarray(0, 32);

    // A real X25519 "oracle decryption key", sealed with the wrap key.
    const kp = generateKeyPairSync('x25519');
    const pkcs8 = kp.privateKey.export({ type: 'pkcs8', format: 'der' });
    const rawPub = Buffer.from(kp.publicKey.export({ format: 'jwk' }).x, 'base64url');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', wrapKey, iv);
    const ct = Buffer.concat([cipher.update(pkcs8), cipher.final()]);
    const keystore = {
      algorithm: 'x25519-hkdf-sha256-aes-256-gcm',
      version: 2,
      public_key_raw: rawPub.toString('base64'),
      sealed_private_key: {
        iv: iv.toString('base64'),
        ciphertext: ct.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
      },
    };

    // No host plaintext injected — only the ciphertext keystore in env.
    delete process.env.MORPHEUS_ORACLE_KEY_MATERIAL_BASE64;
    delete process.env.MORPHEUS_ALLOW_EPHEMERAL_KEY;
    process.env.MORPHEUS_ORACLE_SEALED_KEYSTORE_BASE64 = Buffer.from(
      JSON.stringify(keystore)
    ).toString('base64');
    cryptoMod.__resetOracleKeyMaterialForTests();

    const km = await cryptoMod.ensureOracleKeyMaterial();
    // source proves the env-sealed path ran AND the in-TEE AES-GCM unseal succeeded
    // (a wrong wrap key would throw -> ephemeral/throw, never this source).
    assert.equal(km.source, 'nitro-sealed-env');
  } finally {
    delete process.env.MORPHEUS_ORACLE_SEALED_KEYSTORE_BASE64;
    if (savedPlain === undefined) delete process.env.MORPHEUS_ORACLE_KEY_MATERIAL_BASE64;
    else process.env.MORPHEUS_ORACLE_KEY_MATERIAL_BASE64 = savedPlain;
    if (savedEphemeral === undefined) delete process.env.MORPHEUS_ALLOW_EPHEMERAL_KEY;
    else process.env.MORPHEUS_ALLOW_EPHEMERAL_KEY = savedEphemeral;
    cryptoMod.__resetOracleKeyMaterialForTests();
    signer.__resetSecretsProviderStateForTests();
  }
});
