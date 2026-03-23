import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash, createSign, generateKeyPairSync } from 'node:crypto';
import { rpc as neoRpc, wallet as neoWallet } from '@neo-morpheus-oracle/neon-compat';
import { Interface, Transaction } from 'ethers';
import { exportJWK, SignJWT } from 'jose';

const originalFetch = global.fetch;
const originalPhalaToken = process.env.PHALA_SHARED_SECRET;
const originalPhalaApiToken = process.env.PHALA_API_TOKEN;
const originalNeoN3Key = process.env.PHALA_NEO_N3_PRIVATE_KEY;
const originalNeoXKey = process.env.PHALA_NEOX_PRIVATE_KEY;
const originalNeoRpc = process.env.NEO_RPC_URL;
const originalNeoXRpc = process.env.NEOX_RPC_URL;
const originalNeoXRpcAlt = process.env.NEO_X_RPC_URL;
const originalEvmRpc = process.env.EVM_RPC_URL;
const originalTwelveData = process.env.TWELVEDATA_API_KEY;
const originalNeoXDataFeedAddress = process.env.CONTRACT_MORPHEUS_DATAFEED_X_ADDRESS;
const originalSupabaseUrl = process.env.SUPABASE_URL;
const originalSupabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const originalUseDerivedKeys = process.env.PHALA_USE_DERIVED_KEYS;
const originalOracleKeystorePath = process.env.PHALA_ORACLE_KEYSTORE_PATH;
const originalEnableUserScripts = process.env.MORPHEUS_ENABLE_UNTRUSTED_SCRIPTS;
const originalOracleHash = process.env.CONTRACT_MORPHEUS_ORACLE_HASH;
const originalNeoDidSecretSalt = process.env.NEODID_SECRET_SALT;
const originalWeb3AuthClientId = process.env.WEB3AUTH_CLIENT_ID;
const originalNextPublicWeb3AuthClientId = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID;
const originalWeb3AuthJwksUrl = process.env.WEB3AUTH_JWKS_URL;
const originalAllowUnpinnedSigners = process.env.MORPHEUS_ALLOW_UNPINNED_SIGNERS;

process.env.PHALA_SHARED_SECRET = 'worker-test-secret';
process.env.PHALA_API_TOKEN = 'worker-test-secret';
process.env.PHALA_NEO_N3_PRIVATE_KEY =
  '1111111111111111111111111111111111111111111111111111111111111111';
process.env.PHALA_NEOX_PRIVATE_KEY =
  '0x59c6995e998f97a5a0044976f5d7d28f6af5b8b4f3d8f93f2af6d0a2b03f1abb';
process.env.NEO_RPC_URL = 'https://neo-rpc.test';
process.env.NEOX_RPC_URL = '';
process.env.NEO_X_RPC_URL = '';
process.env.EVM_RPC_URL = '';
process.env.TWELVEDATA_API_KEY = 'test-twelvedata-key';
process.env.CONTRACT_MORPHEUS_DATAFEED_X_ADDRESS = '';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';
process.env.MORPHEUS_ENABLE_UNTRUSTED_SCRIPTS = 'true';
process.env.CONTRACT_MORPHEUS_ORACLE_HASH = '0x017520f068fd602082fe5572596185e62a4ad991';
process.env.NEODID_SECRET_SALT = 'worker-test-neodid-salt';
process.env.MORPHEUS_ALLOW_UNPINNED_SIGNERS = 'true';
delete process.env.WEB3AUTH_CLIENT_ID;
delete process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID;
delete process.env.WEB3AUTH_JWKS_URL;

// Keep unit tests hermetic even when a developer machine has real Morpheus/Neo secrets exported.
// These secrets can change default validation behavior or trigger pinned-signer drift checks.
const WORKER_TEST_ENV_KEEP = new Set([
  'PHALA_SHARED_SECRET',
  'PHALA_API_TOKEN',
  'PHALA_NEO_N3_PRIVATE_KEY',
  'PHALA_NEOX_PRIVATE_KEY',
  'NEO_RPC_URL',
  'NEOX_RPC_URL',
  'NEO_X_RPC_URL',
  'EVM_RPC_URL',
  'TWELVEDATA_API_KEY',
  'CONTRACT_MORPHEUS_DATAFEED_X_ADDRESS',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'PHALA_USE_DERIVED_KEYS',
  'PHALA_ORACLE_KEYSTORE_PATH',
  'MORPHEUS_ENABLE_UNTRUSTED_SCRIPTS',
  'CONTRACT_MORPHEUS_ORACLE_HASH',
  'NEODID_SECRET_SALT',
  'MORPHEUS_ALLOW_UNPINNED_SIGNERS',
]);
for (const key of Object.keys(process.env)) {
  if (WORKER_TEST_ENV_KEEP.has(key)) continue;
  if (
    key === 'NEO_TESTNET_WIF' ||
    key === 'NEO_N3_WIF' ||
    key.startsWith('PHALA_NEO_N3_') ||
    key.startsWith('MORPHEUS_RELAYER_NEO_N3_') ||
    key.startsWith('MORPHEUS_UPDATER_NEO_N3_') ||
    key.startsWith('MORPHEUS_ORACLE_VERIFIER_') ||
    key.startsWith('PHALA_ORACLE_VERIFIER_') ||
    key.startsWith('MORPHEUS_FEED_') ||
    key.startsWith('TURNSTILE_') ||
    key.startsWith('MORPHEUS_TURNSTILE_') ||
    key.startsWith('UPSTASH_REDIS_')
  ) {
    delete process.env[key];
  }
}
const baselineEnv = { ...process.env };

const { default: handler } = await import('./src/worker.js');
const { __setDstackClientFactoryForTests, __resetDstackClientStateForTests } =
  await import('./src/platform/dstack.js');
const { __resetOracleKeyMaterialForTests, decryptEncryptedToken } =
  await import('./src/oracle/crypto.js');
const { __resetFeedStateForTests } = await import('./src/oracle/feeds.js');
const { allowlistAllows, createByteArrayParam } = await import('./src/platform/allowlist.js');
const { loadNeoN3Context } = await import('./src/chain/neo-n3.js');
const { __resetNeoDidStateForTests } = await import('./src/neodid/index.js');

function authHeaders() {
  return {
    authorization: 'Bearer worker-test-secret',
    'content-type': 'application/json',
  };
}

function restoreBaselineEnv() {
  for (const key of Object.keys(process.env)) {
    if (!Object.prototype.hasOwnProperty.call(baselineEnv, key)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(baselineEnv)) {
    process.env[key] = value;
  }
}

function restorePerTestState() {
  global.fetch = originalFetch;
  restoreBaselineEnv();
  __resetDstackClientStateForTests();
  __resetOracleKeyMaterialForTests();
  __resetFeedStateForTests();
  __resetNeoDidStateForTests();
}

test.beforeEach(() => {
  restorePerTestState();
});

test.afterEach(() => {
  restorePerTestState();
});

async function buildWeb3AuthFixture({
  claims = {},
  clientId = 'worker-test-web3auth-client',
  jwksUrl = 'https://jwks.test/web3auth.json',
  kid = 'worker-test-web3auth-key',
} = {}) {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = await exportJWK(publicKey);
  jwk.use = 'sig';
  jwk.alg = 'ES256';
  jwk.kid = kid;
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'ES256', kid })
    .setIssuer('https://api-auth.web3auth.io')
    .setAudience(clientId)
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(privateKey);
  return {
    token,
    clientId,
    jwksUrl,
    jwks: { keys: [jwk] },
  };
}

function installWeb3AuthJwksFetch(jwksUrl, jwks) {
  global.fetch = async (url) => {
    const value = String(url);
    if (value === jwksUrl) {
      return new Response(JSON.stringify(jwks), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`unexpected fetch ${value}`);
  };
}

function computeExpectedMasterNullifier(provider, providerUid) {
  return createHash('sha256')
    .update(
      Buffer.concat([
        Buffer.from(provider, 'utf8'),
        Buffer.from([0x1f]),
        Buffer.from(providerUid, 'utf8'),
        Buffer.from([0x1f]),
        Buffer.from(
          createHash('sha256').update(process.env.NEODID_SECRET_SALT).digest('hex'),
          'hex'
        ),
      ])
    )
    .digest('hex');
}

const TEST_WASM_OK_BASE64 =
  'AGFzbQEAAAABEANgAAF/YAF/AX9gAn9/AX8CGAEIbW9ycGhldXMLbm93X3NlY29uZHMAAAMEAwEAAgUDAQABBgwCfwFBgAgLfwFBAAsHJQQGbWVtb3J5AgAFYWxsb2MAAQpyZXN1bHRfbGVuAAIDcnVuAAMKSQMRAQF/IwAhASMAIABqJAAgAQsEACMBCzAAQQQkAUGAEEH0ADoAAEGBEEHyADoAAEGCEEH1ADoAAEGDEEHlADoAABAAGkGAEAsAQwRuYW1lAQYBAANub3cCHwQAAAECAARzaXplAQRhZGRyAgADAgADcHRyAQNsZW4HEwIABGhlYXABCnJlc3VsdF9sZW4=';
const TEST_WASM_LOOP_BASE64 =
  'AGFzbQEAAAABEANgAX8Bf2AAAX9gAn9/AX8DBAMAAQIFAwEAAQYHAX8BQYAICwclBAZtZW1vcnkCAAVhbGxvYwAACnJlc3VsdF9sZW4AAQNydW4AAgoVAwQAIwALBABBAAsJAANADAALQQALACcEbmFtZQIXAwABAARzaXplAQACAgADcHRyAQNsZW4HBwEABGhlYXA=';
const TEST_ORACLE_ENCRYPTION_ALGORITHM = 'X25519-HKDF-SHA256-AES-256-GCM';
const TEST_ORACLE_ENCRYPTION_INFO = 'morpheus-confidential-payload-v2';
const AES_GCM_TAG_LENGTH_BYTES = 16;
const NEODID_ACTION_DOMAIN = Buffer.from('neodid-action-v1', 'utf8');
const NEODID_RECOVERY_DOMAIN = Buffer.from('neodid-recovery-v1', 'utf8');
const NEODID_ZKLOGIN_DOMAIN = Buffer.from('neodid-zklogin-v1', 'utf8');

function encodeLengthPrefixedAscii(value = '') {
  const body = Buffer.from(String(value || ''), 'utf8');
  return Buffer.concat([Buffer.from([body.length]), body]);
}

function encodeUint256Word(value) {
  const hex = BigInt(String(value ?? '0')).toString(16);
  return Buffer.from(hex.padStart(64, '0'), 'hex');
}

async function encryptForOracle(publicKeyBase64, plaintext) {
  const recipientPublicKeyBytes = Buffer.from(publicKeyBase64, 'base64');
  const recipientKey = await globalThis.crypto.subtle.importKey(
    'raw',
    recipientPublicKeyBytes,
    { name: 'X25519' },
    false,
    []
  );
  const ephemeralKeyPair = await globalThis.crypto.subtle.generateKey({ name: 'X25519' }, true, [
    'deriveBits',
  ]);
  const ephemeralPublicKeyBytes = new Uint8Array(
    await globalThis.crypto.subtle.exportKey('raw', ephemeralKeyPair.publicKey)
  );
  const sharedSecret = new Uint8Array(
    await globalThis.crypto.subtle.deriveBits(
      { name: 'X25519', public: recipientKey },
      ephemeralKeyPair.privateKey,
      256
    )
  );
  const keyMaterial = await globalThis.crypto.subtle.importKey('raw', sharedSecret, 'HKDF', false, [
    'deriveKey',
  ]);
  const info = new Uint8Array([
    ...new TextEncoder().encode(TEST_ORACLE_ENCRYPTION_INFO),
    ...ephemeralPublicKeyBytes,
    ...recipientPublicKeyBytes,
  ]);
  const aesKey = await globalThis.crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: recipientPublicKeyBytes,
      info,
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const encryptedBytes = new Uint8Array(
    await globalThis.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      new TextEncoder().encode(plaintext)
    )
  );
  const ciphertextBytes = encryptedBytes.slice(0, encryptedBytes.length - AES_GCM_TAG_LENGTH_BYTES);
  const tagBytes = encryptedBytes.slice(encryptedBytes.length - AES_GCM_TAG_LENGTH_BYTES);
  return Buffer.from(
    JSON.stringify({
      v: 2,
      alg: TEST_ORACLE_ENCRYPTION_ALGORITHM,
      epk: Buffer.from(ephemeralPublicKeyBytes).toString('base64'),
      iv: Buffer.from(iv).toString('base64'),
      ct: Buffer.from(ciphertextBytes).toString('base64'),
      tag: Buffer.from(tagBytes).toString('base64'),
    })
  ).toString('base64');
}

test('oracle query loads project provider defaults inside worker', async () => {
  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

  global.fetch = async (url) => {
    const value = String(url);
    if (value.startsWith('https://supabase.test/rest/v1/morpheus_projects')) {
      return new Response(JSON.stringify([{ id: 'project-demo-id', slug: 'demo' }]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (value.startsWith('https://supabase.test/rest/v1/morpheus_provider_configs')) {
      return new Response(
        JSON.stringify([
          {
            provider_id: 'twelvedata',
            enabled: true,
            config: { symbol: 'GAS-USD', endpoint: 'price', interval: '5min' },
          },
        ]),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      );
    }
    assert.match(value, /api\.twelvedata\.com\/price/);
    assert.match(value, /symbol=GAS%2FUSD/);
    assert.match(value, /interval=5min/);
    return new Response(JSON.stringify({ price: '3.21' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const res = await handler(
    new Request('http://local/oracle/query', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        provider: 'twelvedata',
        project_slug: 'demo',
        target_chain: 'neo_n3',
      }),
    })
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.mode, 'fetch');
  assert.match(body.body, /3\.21/);
});

test('oracle query rejects disabled project provider inside worker', async () => {
  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

  global.fetch = async (url) => {
    const value = String(url);
    if (value.startsWith('https://supabase.test/rest/v1/morpheus_projects')) {
      return new Response(
        JSON.stringify([{ id: 'project-demo-disabled-id', slug: 'demo-disabled' }]),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      );
    }
    if (value.startsWith('https://supabase.test/rest/v1/morpheus_provider_configs')) {
      return new Response(
        JSON.stringify([
          {
            provider_id: 'twelvedata',
            enabled: false,
            config: { symbol: 'NEO-USD' },
          },
        ]),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      );
    }
    throw new Error(`unexpected fetch ${value}`);
  };

  const res = await handler(
    new Request('http://local/oracle/query', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        provider: 'twelvedata',
        project_slug: 'demo-disabled',
        target_chain: 'neo_n3',
      }),
    })
  );
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /disabled/);
});

test('neodid providers endpoint lists supported social providers', async () => {
  const res = await handler(
    new Request('http://local/neodid/providers', { headers: authHeaders() })
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.providers));
  assert.ok(body.providers.some((item) => item.id === 'web3auth'));
  assert.ok(body.providers.some((item) => item.id === 'twitter'));
  assert.ok(body.providers.some((item) => item.id === 'github'));
  assert.ok(body.providers.some((item) => item.id === 'google'));
  assert.ok(body.providers.some((item) => item.id === 'binance'));
  assert.ok(body.providers.some((item) => item.id === 'okx'));
  assert.ok(body.providers.some((item) => item.id === 'email'));
});

test('neodid bind returns deterministic master nullifier and ticket signature', async () => {
  const payload = {
    vault_account: '0x6d0656f6dd91469db1c90cc1e574380613f43738',
    provider: 'twitter',
    provider_uid: 'twitter_uid_12345',
    claim_type: 'Twitter_VIP',
    claim_value: 'followers_gt_1000',
    metadata: { tier: 'vip' },
  };

  const firstRes = await handler(
    new Request('http://local/neodid/bind', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    })
  );
  assert.equal(firstRes.status, 200);
  const first = await firstRes.json();
  assert.equal(first.mode, 'neodid_bind');
  assert.match(first.master_nullifier, /^0x[0-9a-f]{64}$/);
  assert.match(first.metadata_hash, /^0x[0-9a-f]{64}$/);
  assert.match(first.digest, /^0x[0-9a-f]{64}$/);
  assert.ok(first.signature);
  assert.ok(first.public_key);

  const secondRes = await handler(
    new Request('http://local/neodid/bind', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    })
  );
  assert.equal(secondRes.status, 200);
  const second = await secondRes.json();
  assert.equal(second.master_nullifier, first.master_nullifier);
});

test('neodid bind verifies web3auth id_token and derives provider uid inside the worker', async () => {
  __resetNeoDidStateForTests();
  const fixture = await buildWeb3AuthFixture({
    claims: {
      aggregateVerifier: 'google-oauth',
      aggregateVerifierId: 'alice@example.com',
    },
    clientId: 'worker-test-web3auth-client-bind',
    jwksUrl: 'https://jwks.test/web3auth-bind.json',
    kid: 'worker-test-web3auth-bind',
  });
  installWeb3AuthJwksFetch(fixture.jwksUrl, fixture.jwks);

  const res = await handler(
    new Request('http://local/neodid/bind', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        vault_account: '0x6d0656f6dd91469db1c90cc1e574380613f43738',
        provider: 'web3auth',
        id_token: fixture.token,
        web3auth_client_id: fixture.clientId,
        web3auth_jwks_url: fixture.jwksUrl,
        claim_type: 'Web3Auth_PrimaryIdentity',
        claim_value: 'linked_social_root',
      }),
    })
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  const expectedProviderUid = 'web3auth:google-oauth:alice@example.com';
  assert.equal(body.provider, 'web3auth');
  assert.equal(
    body.master_nullifier,
    `0x${computeExpectedMasterNullifier('web3auth', expectedProviderUid)}`
  );
});

test('neodid bind rejects a mismatched explicit web3auth provider_uid', async () => {
  __resetNeoDidStateForTests();
  const fixture = await buildWeb3AuthFixture({
    claims: {
      verifier: 'google',
      verifierId: 'alice@example.com',
    },
    clientId: 'worker-test-web3auth-client-mismatch',
    jwksUrl: 'https://jwks.test/web3auth-mismatch.json',
    kid: 'worker-test-web3auth-mismatch',
  });
  installWeb3AuthJwksFetch(fixture.jwksUrl, fixture.jwks);

  const res = await handler(
    new Request('http://local/neodid/bind', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        vault_account: '0x6d0656f6dd91469db1c90cc1e574380613f43738',
        provider: 'web3auth',
        provider_uid: 'web3auth:google:bob@example.com',
        id_token: fixture.token,
        web3auth_client_id: fixture.clientId,
        web3auth_jwks_url: fixture.jwksUrl,
        claim_type: 'Web3Auth_PrimaryIdentity',
      }),
    })
  );
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /provider_uid does not match verified id_token/);
});

test('neodid bind requires a web3auth client id so audience is always verified', async () => {
  __resetNeoDidStateForTests();
  const fixture = await buildWeb3AuthFixture({
    claims: {
      verifier: 'google',
      verifierId: 'alice@example.com',
    },
    clientId: 'worker-test-web3auth-client-required',
    jwksUrl: 'https://jwks.test/web3auth-required.json',
    kid: 'worker-test-web3auth-required',
  });
  installWeb3AuthJwksFetch(fixture.jwksUrl, fixture.jwks);

  const res = await handler(
    new Request('http://local/neodid/bind', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        vault_account: '0x6d0656f6dd91469db1c90cc1e574380613f43738',
        provider: 'web3auth',
        id_token: fixture.token,
        web3auth_jwks_url: fixture.jwksUrl,
        claim_type: 'Web3Auth_PrimaryIdentity',
      }),
    })
  );
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /WEB3AUTH_CLIENT_ID is required/);
});

test('neodid action-ticket generates action-specific nullifiers', async () => {
  const common = {
    provider: 'twitter',
    provider_uid: 'twitter_uid_12345',
    disposable_account: '0x89b05cac00804648c666b47ecb1c57bc185821b7',
  };

  const firstRes = await handler(
    new Request('http://local/neodid/action-ticket', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ ...common, action_id: 'DAO_Vote_42' }),
    })
  );
  assert.equal(firstRes.status, 200);
  const first = await firstRes.json();
  assert.equal(first.mode, 'neodid_action_ticket');
  assert.match(first.action_nullifier, /^0x[0-9a-f]{64}$/);
  assert.ok(first.signature);
  const expectedDigest = createHash('sha256')
    .update(
      Buffer.concat([
        NEODID_ACTION_DOMAIN,
        Buffer.from(common.disposable_account.replace(/^0x/, ''), 'hex'),
        encodeLengthPrefixedAscii('DAO_Vote_42'),
        Buffer.from(first.action_nullifier.replace(/^0x/, ''), 'hex'),
      ])
    )
    .digest('hex');
  assert.equal(first.digest, `0x${expectedDigest}`);

  const secondRes = await handler(
    new Request('http://local/neodid/action-ticket', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ ...common, action_id: 'Airdrop_Season_1' }),
    })
  );
  assert.equal(secondRes.status, 200);
  const second = await secondRes.json();
  assert.notEqual(first.action_nullifier, second.action_nullifier);
});

test('neodid action-ticket accepts okex alias and normalizes to okx', async () => {
  const res = await handler(
    new Request('http://local/neodid/action-ticket', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        provider: 'okex',
        provider_uid: 'exchange_uid_123',
        disposable_account: '0x89b05cac00804648c666b47ecb1c57bc185821b7',
        action_id: 'DAO_Vote_42',
      }),
    })
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.mode, 'neodid_action_ticket');
  assert.ok(body.signature);
});

test('neodid recovery-ticket supports confidential provider payloads and binds AA recovery context', async () => {
  const keyRes = await handler(
    new Request('http://local/oracle/public-key', { headers: authHeaders() })
  );
  assert.equal(keyRes.status, 200);
  const keyMeta = await keyRes.json();
  const encryptedParams = await encryptForOracle(
    keyMeta.public_key,
    JSON.stringify({
      provider_uid: 'github_uid_777',
    })
  );

  const res = await handler(
    new Request('http://local/neodid/recovery-ticket', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        provider: 'github',
        aa_contract: '0x017520f068fd602082fe5572596185e62a4ad991',
        verifier_contract: '0x03013f49c42a14546c8bbe58f9d434c3517fccab',
        account_address: '0x6d0656f6dd91469db1c90cc1e574380613f43738',
        account_id: 'aa-social-recovery-demo',
        new_owner: '0x89b05cac00804648c666b47ecb1c57bc185821b7',
        recovery_nonce: '7',
        expires_at: '1735689600',
        encrypted_params: encryptedParams,
      }),
    })
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.mode, 'neodid_recovery_ticket');
  assert.equal(body.provider, 'github');
  assert.equal(body.account_id, 'aa-social-recovery-demo');
  assert.equal(body.recovery_nonce, '7');
  assert.equal(body.expires_at, '1735689600');
  assert.match(body.master_nullifier, /^0x[0-9a-f]{64}$/);
  assert.match(body.action_nullifier, /^0x[0-9a-f]{64}$/);
  assert.match(body.digest, /^0x[0-9a-f]{64}$/);
  assert.ok(body.signature);
  assert.ok(body.public_key);
  const expectedRecoveryDigest = createHash('sha256')
    .update(
      Buffer.concat([
        NEODID_RECOVERY_DOMAIN,
        encodeLengthPrefixedAscii('neo_n3'),
        Buffer.from('0x017520f068fd602082fe5572596185e62a4ad991'.replace(/^0x/, ''), 'hex'),
        Buffer.from('0x03013f49c42a14546c8bbe58f9d434c3517fccab'.replace(/^0x/, ''), 'hex'),
        Buffer.from('0x6d0656f6dd91469db1c90cc1e574380613f43738'.replace(/^0x/, ''), 'hex'),
        encodeLengthPrefixedAscii('aa-social-recovery-demo'),
        Buffer.from('0x89b05cac00804648c666b47ecb1c57bc185821b7'.replace(/^0x/, ''), 'hex'),
        encodeLengthPrefixedAscii('7'),
        encodeLengthPrefixedAscii('1735689600'),
        encodeLengthPrefixedAscii(body.action_id),
        Buffer.from(body.master_nullifier.replace(/^0x/, ''), 'hex'),
        Buffer.from(body.action_nullifier.replace(/^0x/, ''), 'hex'),
      ])
    )
    .digest('hex');
  assert.equal(body.digest, `0x${expectedRecoveryDigest}`);

  const secondRes = await handler(
    new Request('http://local/neodid/recovery-ticket', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        provider: 'github',
        aa_contract: '0x017520f068fd602082fe5572596185e62a4ad991',
        account_id: 'aa-social-recovery-demo',
        new_owner: '0x89b05cac00804648c666b47ecb1c57bc185821b7',
        recovery_nonce: '8',
        expires_at: '1735689600',
        encrypted_params: encryptedParams,
      }),
    })
  );
  assert.equal(secondRes.status, 200);
  const second = await secondRes.json();
  assert.notEqual(body.action_nullifier, second.action_nullifier);
});

test('neodid recovery-ticket accepts confidential web3auth id_token payloads', async () => {
  __resetNeoDidStateForTests();
  const fixture = await buildWeb3AuthFixture({
    claims: {
      aggregateVerifier: 'web3auth-google',
      aggregateVerifierId: 'alice@example.com',
    },
    clientId: 'worker-test-web3auth-client-recovery',
    jwksUrl: 'https://jwks.test/web3auth-recovery.json',
    kid: 'worker-test-web3auth-recovery',
  });
  installWeb3AuthJwksFetch(fixture.jwksUrl, fixture.jwks);

  const keyRes = await handler(
    new Request('http://local/oracle/public-key', { headers: authHeaders() })
  );
  assert.equal(keyRes.status, 200);
  const keyMeta = await keyRes.json();
  const encryptedParams = await encryptForOracle(
    keyMeta.public_key,
    JSON.stringify({
      id_token: fixture.token,
      web3auth_client_id: fixture.clientId,
      web3auth_jwks_url: fixture.jwksUrl,
    })
  );

  const res = await handler(
    new Request('http://local/neodid/recovery-ticket', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        provider: 'web3auth',
        aa_contract: '0x017520f068fd602082fe5572596185e62a4ad991',
        verifier_contract: '0x03013f49c42a14546c8bbe58f9d434c3517fccab',
        account_address: '0x6d0656f6dd91469db1c90cc1e574380613f43738',
        account_id: 'aa-social-recovery-demo',
        new_owner: '0x89b05cac00804648c666b47ecb1c57bc185821b7',
        recovery_nonce: '7',
        expires_at: '1735689600',
        encrypted_params: encryptedParams,
      }),
    })
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.provider, 'web3auth');
  assert.match(body.master_nullifier, /^0x[0-9a-f]{64}$/);
  assert.match(body.action_nullifier, /^0x[0-9a-f]{64}$/);
});

test('neodid zklogin-ticket binds a web3auth identity root to an AA operation digest', async () => {
  __resetNeoDidStateForTests();
  const fixture = await buildWeb3AuthFixture({
    claims: {
      aggregateVerifier: 'web3auth-google',
      aggregateVerifierId: 'alice@example.com',
    },
    clientId: 'worker-test-web3auth-client-zklogin',
    jwksUrl: 'https://jwks.test/web3auth-zklogin.json',
    kid: 'worker-test-web3auth-zklogin',
  });
  installWeb3AuthJwksFetch(fixture.jwksUrl, fixture.jwks);

  const keyRes = await handler(
    new Request('http://local/oracle/public-key', { headers: authHeaders() })
  );
  assert.equal(keyRes.status, 200);
  const keyMeta = await keyRes.json();
  const encryptedParams = await encryptForOracle(
    keyMeta.public_key,
    JSON.stringify({
      id_token: fixture.token,
      web3auth_client_id: fixture.clientId,
      web3auth_jwks_url: fixture.jwksUrl,
    })
  );

  const res = await handler(
    new Request('http://local/neodid/zklogin-ticket', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        provider: 'web3auth',
        verifier_contract: '0x03013f49c42a14546c8bbe58f9d434c3517fccab',
        account_id_hash: '0xf951cd3eb5196dacde99b339c5dcca37ac38cc22',
        target_contract: '0xd2a4cff31913016155e38e474a2c06d08be276cf',
        method: 'transfer',
        args_hash: `0x${'12'.repeat(32)}`,
        nonce: '4',
        deadline: '1710001234',
        encrypted_params: encryptedParams,
      }),
    })
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.mode, 'neodid_zklogin_ticket');
  assert.equal(body.provider, 'web3auth');
  assert.equal(body.method, 'transfer');
  assert.equal(body.nonce, '4');
  assert.equal(body.deadline, '1710001234');
  assert.match(body.master_nullifier, /^0x[0-9a-f]{64}$/);
  assert.match(body.action_nullifier, /^0x[0-9a-f]{64}$/);
  assert.match(body.digest, /^0x[0-9a-f]{64}$/);
  assert.ok(body.signature);
  assert.ok(body.public_key);

  const expectedDigest = createHash('sha256')
    .update(
      Buffer.concat([
        NEODID_ZKLOGIN_DOMAIN,
        Buffer.from('0x03013f49c42a14546c8bbe58f9d434c3517fccab'.replace(/^0x/, ''), 'hex'),
        Buffer.from('0xf951cd3eb5196dacde99b339c5dcca37ac38cc22'.replace(/^0x/, ''), 'hex'),
        Buffer.from('0xd2a4cff31913016155e38e474a2c06d08be276cf'.replace(/^0x/, ''), 'hex'),
        encodeLengthPrefixedAscii('transfer'),
        Buffer.from('12'.repeat(32), 'hex'),
        encodeUint256Word('4'),
        encodeUint256Word('1710001234'),
        encodeLengthPrefixedAscii('web3auth'),
        Buffer.from(body.master_nullifier.replace(/^0x/, ''), 'hex'),
        Buffer.from(body.action_nullifier.replace(/^0x/, ''), 'hex'),
      ])
    )
    .digest('hex');
  assert.equal(body.digest, `0x${expectedDigest}`);
});

test('neodid bind resolves encrypted_params_ref through Supabase ciphertext storage', async () => {
  __resetNeoDidStateForTests();
  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

  const fixture = await buildWeb3AuthFixture({
    claims: {
      aggregateVerifier: 'google-oauth',
      aggregateVerifierId: 'alice@example.com',
    },
    clientId: 'worker-test-web3auth-client-ref',
    jwksUrl: 'https://jwks.test/web3auth-ref.json',
    kid: 'worker-test-web3auth-ref',
  });

  const keyRes = await handler(
    new Request('http://local/oracle/public-key', { headers: authHeaders() })
  );
  assert.equal(keyRes.status, 200);
  const keyMeta = await keyRes.json();
  const encryptedParams = await encryptForOracle(
    keyMeta.public_key,
    JSON.stringify({
      id_token: fixture.token,
      web3auth_client_id: fixture.clientId,
      web3auth_jwks_url: fixture.jwksUrl,
    })
  );

  global.fetch = async (url) => {
    const value = String(url);
    if (value === fixture.jwksUrl) {
      return new Response(JSON.stringify(fixture.jwks), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (value.startsWith('https://supabase.test/rest/v1/morpheus_encrypted_secrets')) {
      return new Response(
        JSON.stringify([
          {
            id: '11111111-1111-1111-1111-111111111111',
            ciphertext: encryptedParams,
          },
        ]),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      );
    }
    throw new Error(`unexpected fetch ${value}`);
  };

  const res = await handler(
    new Request('http://local/neodid/bind', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        vault_account: '0x6d0656f6dd91469db1c90cc1e574380613f43738',
        provider: 'web3auth',
        encrypted_params_ref: '11111111-1111-1111-1111-111111111111',
        claim_type: 'Web3Auth_PrimaryIdentity',
        claim_value: 'ref-test',
      }),
    })
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.provider, 'web3auth');
  assert.match(body.master_nullifier, /^0x[0-9a-f]{64}$/);
});

test('encrypted_params_ref enforces requester and callback scope when metadata bindings are present', async () => {
  __resetNeoDidStateForTests();
  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

  const fixture = await buildWeb3AuthFixture({
    claims: {
      aggregateVerifier: 'google-oauth',
      aggregateVerifierId: 'alice@example.com',
    },
    clientId: 'worker-test-web3auth-client-ref-scope',
    jwksUrl: 'https://jwks.test/web3auth-ref-scope.json',
    kid: 'worker-test-web3auth-ref-scope',
  });

  const keyRes = await handler(
    new Request('http://local/oracle/public-key', { headers: authHeaders() })
  );
  assert.equal(keyRes.status, 200);
  const keyMeta = await keyRes.json();
  const encryptedParams = await encryptForOracle(
    keyMeta.public_key,
    JSON.stringify({
      id_token: fixture.token,
      web3auth_client_id: fixture.clientId,
      web3auth_jwks_url: fixture.jwksUrl,
    })
  );

  global.fetch = async (url) => {
    const value = String(url);
    if (value === fixture.jwksUrl) {
      return new Response(JSON.stringify(fixture.jwks), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (value.startsWith('https://supabase.test/rest/v1/morpheus_encrypted_secrets')) {
      return new Response(
        JSON.stringify([
          {
            id: '22222222-2222-2222-2222-222222222222',
            ciphertext: encryptedParams,
            metadata: {
              bound_requester: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
              bound_callback_contract: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            },
          },
        ]),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      );
    }
    throw new Error(`unexpected fetch ${value}`);
  };

  const success = await handler(
    new Request('http://local/neodid/bind', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        vault_account: '0x6d0656f6dd91469db1c90cc1e574380613f43738',
        provider: 'web3auth',
        encrypted_params_ref: '22222222-2222-2222-2222-222222222222',
        claim_type: 'Web3Auth_PrimaryIdentity',
        claim_value: 'ref-scope',
        requester: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        callback_contract: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      }),
    })
  );
  assert.equal(success.status, 200);
  const successBody = await success.json();
  assert.equal(successBody.provider, 'web3auth');
  assert.match(successBody.master_nullifier, /^0x[0-9a-f]{64}$/);

  const deniedRequester = await handler(
    new Request('http://local/neodid/bind', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        vault_account: '0x6d0656f6dd91469db1c90cc1e574380613f43738',
        provider: 'web3auth',
        encrypted_params_ref: '22222222-2222-2222-2222-222222222222',
        claim_type: 'Web3Auth_PrimaryIdentity',
        claim_value: 'ref-scope',
        requester: '0xcccccccccccccccccccccccccccccccccccccccc',
        callback_contract: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      }),
    })
  );
  assert.equal(deniedRequester.status, 400);
  const deniedRequesterBody = await deniedRequester.json();
  assert.match(deniedRequesterBody.error, /encrypted ref requester mismatch/i);

  const deniedCallback = await handler(
    new Request('http://local/neodid/bind', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        vault_account: '0x6d0656f6dd91469db1c90cc1e574380613f43738',
        provider: 'web3auth',
        encrypted_params_ref: '22222222-2222-2222-2222-222222222222',
        claim_type: 'Web3Auth_PrimaryIdentity',
        claim_value: 'ref-scope',
        requester: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        callback_contract: '0xcccccccccccccccccccccccccccccccccccccccc',
      }),
    })
  );
  assert.equal(deniedCallback.status, 400);
  const deniedCallbackBody = await deniedCallback.json();
  assert.match(deniedCallbackBody.error, /encrypted ref callback mismatch/i);
});

test('encrypted_params_ref is idempotent for the same request_id but rejects replay across request ids', async () => {
  __resetNeoDidStateForTests();
  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

  const fixture = await buildWeb3AuthFixture({
    claims: {
      aggregateVerifier: 'google-oauth',
      aggregateVerifierId: 'alice@example.com',
    },
    clientId: 'worker-test-web3auth-client-ref-replay',
    jwksUrl: 'https://jwks.test/web3auth-ref-replay.json',
    kid: 'worker-test-web3auth-ref-replay',
  });

  const keyRes = await handler(
    new Request('http://local/oracle/public-key', { headers: authHeaders() })
  );
  assert.equal(keyRes.status, 200);
  const keyMeta = await keyRes.json();
  const encryptedParams = await encryptForOracle(
    keyMeta.public_key,
    JSON.stringify({
      id_token: fixture.token,
      web3auth_client_id: fixture.clientId,
      web3auth_jwks_url: fixture.jwksUrl,
    })
  );

  const secretRow = {
    id: '33333333-3333-3333-3333-333333333333',
    ciphertext: encryptedParams,
    metadata: {
      bound_requester: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      bound_callback_contract: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    },
  };

  global.fetch = async (url, init = {}) => {
    const value = String(url);
    if (value === fixture.jwksUrl) {
      return new Response(JSON.stringify(fixture.jwks), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (value.startsWith('https://supabase.test/rest/v1/morpheus_encrypted_secrets')) {
      const method = String(init?.method || 'GET').toUpperCase();
      if (method === 'GET') {
        return new Response(JSON.stringify([secretRow]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (method === 'PATCH') {
        const parsedUrl = new URL(value);
        const requestBody = JSON.parse(String(init.body || '{}'));
        const claimedRequestId = requestBody?.metadata?._consumed_request_id || null;
        const requiredNullClaim =
          parsedUrl.searchParams.get('metadata->>_consumed_request_id') === 'is.null';
        if (requiredNullClaim && secretRow.metadata._consumed_request_id !== undefined) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        secretRow.metadata = {
          ...secretRow.metadata,
          _consumed_request_id: claimedRequestId,
          _consumed_at: '2026-03-15T00:00:00.000Z',
        };
        return new Response(JSON.stringify([secretRow]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
    }
    throw new Error(`unexpected fetch ${value}`);
  };

  const baseBody = {
    vault_account: '0x6d0656f6dd91469db1c90cc1e574380613f43738',
    provider: 'web3auth',
    encrypted_params_ref: '33333333-3333-3333-3333-333333333333',
    claim_type: 'Web3Auth_PrimaryIdentity',
    claim_value: 'ref-replay',
    requester: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    callback_contract: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  };

  const first = await handler(
    new Request('http://local/neodid/bind', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        ...baseBody,
        request_id: 'oracle-request-1',
      }),
    })
  );
  assert.equal(first.status, 200);

  const retrySameRequest = await handler(
    new Request('http://local/neodid/bind', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        ...baseBody,
        request_id: 'oracle-request-1',
      }),
    })
  );
  assert.equal(retrySameRequest.status, 200);

  const replayDifferentRequest = await handler(
    new Request('http://local/neodid/bind', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        ...baseBody,
        request_id: 'oracle-request-2',
      }),
    })
  );
  assert.equal(replayDifferentRequest.status, 400);
  const replayBody = await replayDifferentRequest.json();
  assert.match(replayBody.error, /encrypted ref already consumed by another request/i);
});

test.after(() => {
  global.fetch = originalFetch;
  process.env.PHALA_SHARED_SECRET = originalPhalaToken;
  process.env.PHALA_API_TOKEN = originalPhalaApiToken;
  process.env.PHALA_NEO_N3_PRIVATE_KEY = originalNeoN3Key;
  process.env.PHALA_NEOX_PRIVATE_KEY = originalNeoXKey;
  process.env.NEO_RPC_URL = originalNeoRpc;
  process.env.NEOX_RPC_URL = originalNeoXRpc;
  process.env.NEO_X_RPC_URL = originalNeoXRpcAlt;
  process.env.EVM_RPC_URL = originalEvmRpc;
  process.env.TWELVEDATA_API_KEY = originalTwelveData;
  process.env.CONTRACT_MORPHEUS_DATAFEED_X_ADDRESS = originalNeoXDataFeedAddress;
  process.env.SUPABASE_URL = originalSupabaseUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = originalSupabaseServiceRoleKey;
  process.env.PHALA_USE_DERIVED_KEYS = originalUseDerivedKeys;
  process.env.PHALA_ORACLE_KEYSTORE_PATH = originalOracleKeystorePath;
  process.env.MORPHEUS_ENABLE_UNTRUSTED_SCRIPTS = originalEnableUserScripts;
  process.env.CONTRACT_MORPHEUS_ORACLE_HASH = originalOracleHash;
  process.env.NEODID_SECRET_SALT = originalNeoDidSecretSalt;
  process.env.WEB3AUTH_CLIENT_ID = originalWeb3AuthClientId;
  process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID = originalNextPublicWeb3AuthClientId;
  process.env.WEB3AUTH_JWKS_URL = originalWeb3AuthJwksUrl;
  if (originalAllowUnpinnedSigners === undefined) {
    delete process.env.MORPHEUS_ALLOW_UNPINNED_SIGNERS;
  } else {
    process.env.MORPHEUS_ALLOW_UNPINNED_SIGNERS = originalAllowUnpinnedSigners;
  }
  __resetDstackClientStateForTests();
  __resetOracleKeyMaterialForTests();
  __resetFeedStateForTests();
  __resetNeoDidStateForTests();
});

test('txproxy allowlist permits Oracle fulfillRequest and queueAutomationRequest', async () => {
  assert.equal(
    allowlistAllows('0x017520f068fd602082fe5572596185e62a4ad991', 'fulfillRequest'),
    true
  );
  assert.equal(
    allowlistAllows('0x017520f068fd602082fe5572596185e62a4ad991', 'queueAutomationRequest'),
    true
  );
});

test('createByteArrayParam decodes base64 payloads into raw bytes', async () => {
  const expected = '04030201';
  assert.equal(createByteArrayParam(Buffer.from('01020304', 'hex')).value.toString(), expected);
  assert.equal(createByteArrayParam('01020304').value.toString(), expected);
  assert.equal(
    createByteArrayParam(Buffer.from('01020304', 'hex').toString('base64')).value.toString(),
    expected
  );
});

test('providers endpoint lists builtin sources', async () => {
  const res = await handler(new Request('http://local/providers', { headers: authHeaders() }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.providers));
  assert.equal(body.providers[0].id, 'twelvedata');
  assert.ok(body.providers.some((provider) => provider.id === 'binance-spot'));
});

test('feeds catalog lists default symbols', async () => {
  const res = await handler(new Request('http://local/feeds/catalog', { headers: authHeaders() }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.pairs));
  assert.ok(body.pairs.includes('TWELVEDATA:NEO-USD'));
  assert.ok(body.pairs.includes('TWELVEDATA:PAXG-USD'));
  assert.ok(body.pairs.includes('TWELVEDATA:WTI-USD'));
  assert.ok(body.pairs.includes('TWELVEDATA:AAPL-USD'));
  assert.ok(body.pairs.includes('TWELVEDATA:EUR-USD'));
  assert.ok(body.pairs.includes('TWELVEDATA:FLM-USD'));
  assert.ok(body.pairs.includes('TWELVEDATA:JPY-USD'));
});

test('loadNeoN3Context falls back to MORPHEUS_RELAYER_NEO_N3_WIF', async () => {
  const previousRelayerWif = process.env.MORPHEUS_RELAYER_NEO_N3_WIF;
  const previousRelayerPrivateKey = process.env.MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY;
  const previousWorkerPrivateKey = process.env.PHALA_NEO_N3_PRIVATE_KEY;
  const previousWorkerWif = process.env.PHALA_NEO_N3_WIF;
  const previousNeoN3Wif = process.env.NEO_N3_WIF;
  const generatedAccount = new neoWallet.Account();
  delete process.env.PHALA_NEO_N3_PRIVATE_KEY;
  delete process.env.PHALA_NEO_N3_WIF;
  delete process.env.MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY;
  delete process.env.NEO_N3_WIF;
  process.env.MORPHEUS_RELAYER_NEO_N3_WIF = generatedAccount.WIF;

  const context = loadNeoN3Context({}, { required: true, requireRpc: false });
  assert.equal(context.account.address, generatedAccount.address);

  process.env.MORPHEUS_RELAYER_NEO_N3_WIF = previousRelayerWif;
  process.env.MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY = previousRelayerPrivateKey;
  process.env.PHALA_NEO_N3_PRIVATE_KEY = previousWorkerPrivateKey;
  process.env.PHALA_NEO_N3_WIF = previousWorkerWif;
  process.env.NEO_N3_WIF = previousNeoN3Wif;
});

test('feed quote supports twelvedata provider', async () => {
  global.fetch = async (url) => {
    assert.match(String(url), /api\.twelvedata\.com\/price/);
    assert.match(String(url), /apikey=test-twelvedata-key/);
    return new Response(JSON.stringify({ price: '45.67' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const res = await handler(
    new Request('http://local/feeds/price/NEO-USD?provider=twelvedata', { headers: authHeaders() })
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.provider, 'twelvedata');
  assert.equal(body.price, '45.67');
});

test('feed quote infers provider from canonical prefixed symbol without provider field', async () => {
  global.fetch = async (url) => {
    assert.match(String(url), /api\.twelvedata\.com\/price/);
    assert.match(String(url), /BTC-USD|BTC%2FUSD/);
    return new Response(JSON.stringify({ price: '70123.5' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const res = await handler(
    new Request('http://local/feeds/price/TWELVEDATA:BTC-USD', { headers: authHeaders() })
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.pair, 'TWELVEDATA:BTC-USD');
  assert.equal(body.provider_pair, 'BTC-USD');
  assert.equal(body.price, '70123.5');
});

test('feed quote expands bare asset symbols to USD pairs without producing undefined quotes', async () => {
  global.fetch = async (url) => {
    assert.match(String(url), /api\.twelvedata\.com\/price/);
    assert.match(String(url), /GAS%2FUSD|GAS-USD/);
    return new Response(JSON.stringify({ price: '4.56' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const res = await handler(
    new Request('http://local/feeds/price/GAS', { headers: authHeaders() })
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.pair, 'TWELVEDATA:GAS-USD');
  assert.equal(body.providers_requested[0], 'twelvedata');
  assert.equal(body.quotes[0].provider_pair, 'GAS-USD');
  assert.equal(body.quotes[0].pair, 'TWELVEDATA:GAS-USD');
  assert.equal(body.quotes[0].price, '4.56');
});

test('feed quote preserves explicit TwelveData stock symbols without appending /USD', async () => {
  global.fetch = async (url) => {
    assert.match(String(url), /api\.twelvedata\.com\/price/);
    assert.match(String(url), /symbol=AAPL(&|%26|$)/);
    return new Response(JSON.stringify({ price: '260.72' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const res = await handler(
    new Request('http://local/feeds/price/AAPL-USD?provider=twelvedata', { headers: authHeaders() })
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.pair, 'TWELVEDATA:AAPL-USD');
  assert.equal(body.price, '260.72');
});

test('feed quote uses direct FLM-USD pair naming under 1e6 USD scale', async () => {
  global.fetch = async (url) => {
    assert.match(String(url), /api\.twelvedata\.com\/price/);
    assert.match(String(url), /FLM%2FUSD/);
    return new Response(JSON.stringify({ price: '0.00123' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const res = await handler(
    new Request('http://local/feeds/price/FLM-USD?provider=twelvedata', { headers: authHeaders() })
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.pair, 'TWELVEDATA:FLM-USD');
  assert.equal(body.display_symbol, 'TWELVEDATA:FLM-USD');
  assert.equal(body.unit_label, null);
  assert.equal(body.raw_price, '0.00123');
  assert.equal(body.price, '0.00123');
  assert.equal(body.price_multiplier, 1);
  assert.equal(body.decimals, 6);
});

test('feed quote can invert forex units for direct JPY-USD pricing under 1e6 USD scale', async () => {
  global.fetch = async (url) => {
    assert.match(String(url), /api\.twelvedata\.com\/price/);
    assert.match(String(url), /USD%2FJPY/);
    return new Response(JSON.stringify({ price: '150.0000' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const res = await handler(
    new Request('http://local/feeds/price/JPY-USD?provider=twelvedata', { headers: authHeaders() })
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.pair, 'TWELVEDATA:JPY-USD');
  assert.equal(body.display_symbol, 'TWELVEDATA:JPY-USD');
  assert.equal(body.unit_label, null);
  assert.equal(body.raw_price, '150.0000');
  assert.equal(body.price_transform, 'inverse');
  assert.equal(body.price_multiplier, 1);
  assert.equal(body.price, '0.006666666667');
});

test('feed quote preserves explicit TwelveData futures symbols', async () => {
  global.fetch = async (url) => {
    assert.match(String(url), /api\.twelvedata\.com\/price/);
    assert.match(String(url), /symbol=HG1(&|%26|$)/);
    return new Response(JSON.stringify({ price: '25.20000' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const res = await handler(
    new Request('http://local/feeds/price/COPPER-USD?provider=twelvedata', {
      headers: authHeaders(),
    })
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.pair, 'TWELVEDATA:COPPER-USD');
  assert.equal(body.price, '25.2');
});

test('feed quote supports coinbase-spot provider', async () => {
  global.fetch = async (url) => {
    assert.match(String(url), /api\.coinbase\.com\/v2\/prices\/NEO-USD\/spot/);
    return new Response(JSON.stringify({ data: { amount: '99.01' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const res = await handler(
    new Request('http://local/feeds/price/NEO-USD?provider=coinbase-spot', {
      headers: authHeaders(),
    })
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.provider, 'coinbase-spot');
  assert.equal(body.price, '99.01');
});

test('feed quote supports binance-spot provider', async () => {
  global.fetch = async (url) => {
    assert.match(String(url), /api1\.binance\.com\/api\/v3\/ticker\/price\?symbol=NEOUSDT/);
    return new Response(JSON.stringify({ price: '88.12' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const res = await handler(
    new Request('http://local/feeds/price/NEO-USD?provider=binance-spot', {
      headers: authHeaders(),
    })
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.provider, 'binance-spot');
  assert.equal(body.price, '88.12');
});

test('feed quote returns all available providers when provider is omitted', async () => {
  global.fetch = async (url) => {
    const value = String(url);
    if (value.includes('api.twelvedata.com')) {
      return new Response(JSON.stringify({ price: '45.67' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (value.includes('api1.binance.com')) {
      return new Response(JSON.stringify({ price: '45.70' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`unexpected fetch ${value}`);
  };

  const res = await handler(
    new Request('http://local/feeds/price/NEO-USD', { headers: authHeaders() })
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.pair, 'NEO-USD');
  assert.equal(body.quotes.length, 2);
  assert.deepEqual(body.providers_requested, ['twelvedata', 'binance-spot']);
});

test('oracle query supports builtin provider mode', async () => {
  global.fetch = async (url) => {
    assert.match(String(url), /api\.twelvedata\.com\/price/);
    return new Response(JSON.stringify({ price: '11.11' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const res = await handler(
    new Request('http://local/oracle/query', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ provider: 'twelvedata', symbol: 'NEO-USD', target_chain: 'neo_n3' }),
    })
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.mode, 'fetch');
  assert.match(body.body, /11\.11/);
});

test('oracle query fails on builtin provider upstream 429', async () => {
  global.fetch = async (url) => {
    assert.match(String(url), /api\.twelvedata\.com\/price/);
    return new Response(JSON.stringify({ code: 429, message: 'rate limited', status: 'error' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const res = await handler(
    new Request('http://local/oracle/query', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ provider: 'twelvedata', symbol: 'NEO-USD', target_chain: 'neo_n3' }),
    })
  );
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /429/);
});

test('health endpoint works without auth', async () => {
  const res = await handler(new Request('http://local/health'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
});

test('info endpoint works without auth', async () => {
  const res = await handler(new Request('http://local/info'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Object.prototype.hasOwnProperty.call(body, 'dstack'));
});

test('attestation endpoint works without auth', async () => {
  const res = await handler(new Request('http://local/attestation?report_data=test-report'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Object.prototype.hasOwnProperty.call(body, 'attestation'));
});

test('oracle public key endpoint returns X25519 metadata', async () => {
  const res = await handler(
    new Request('http://local/oracle/public-key', { headers: authHeaders() })
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.algorithm, TEST_ORACLE_ENCRYPTION_ALGORITHM);
  assert.ok(body.public_key);
  assert.equal(body.public_key_format, 'raw');
  assert.equal(body.recommended_payload_encryption, TEST_ORACLE_ENCRYPTION_ALGORITHM);
  assert.ok(Array.isArray(body.supported_payload_encryption));
  assert.deepEqual(body.supported_payload_encryption, [TEST_ORACLE_ENCRYPTION_ALGORITHM]);
});

test('oracle public key prefers a dstack-sealed keystore whenever dstack is available', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'morpheus-oracle-key-'));
  const keystorePath = path.join(tempDir, 'oracle-key.json');
  process.env.PHALA_USE_DERIVED_KEYS = 'false';
  process.env.PHALA_ORACLE_KEYSTORE_PATH = keystorePath;

  __setDstackClientFactoryForTests(async () => ({
    isReachable: async () => true,
    getKey: async () => ({ key: Uint8Array.from(Buffer.from('11'.repeat(32), 'hex')) }),
    info: async () => ({
      app_id: 'app',
      instance_id: 'inst',
      compose_hash: 'compose',
      app_name: 'Morpheus',
      device_id: 'device',
      key_provider_info: 'mock',
      tcb_info: null,
    }),
    getQuote: async () => ({ quote: '0x01', event_log: '[]', report_data: '0x02' }),
  }));

  __resetOracleKeyMaterialForTests();
  const first = await handler(
    new Request('http://local/oracle/public-key', { headers: authHeaders() })
  );
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.match(firstBody.key_source, /dstack-sealed/);
  assert.ok(firstBody.public_key);

  __resetOracleKeyMaterialForTests();
  const second = await handler(
    new Request('http://local/oracle/public-key', { headers: authHeaders() })
  );
  assert.equal(second.status, 200);
  const secondBody = await second.json();
  assert.equal(secondBody.public_key, firstBody.public_key);
  assert.match(secondBody.key_source, /dstack-sealed/);
});

test('oracle key material can be restored explicitly from env configuration', async () => {
  const keyPair = await globalThis.crypto.subtle.generateKey({ name: 'X25519' }, true, [
    'deriveBits',
  ]);
  const publicKeyRaw = Buffer.from(
    await globalThis.crypto.subtle.exportKey('raw', keyPair.publicKey)
  ).toString('base64');
  const privateKeyPkcs8 = Buffer.from(
    await globalThis.crypto.subtle.exportKey('pkcs8', keyPair.privateKey)
  ).toString('base64');

  process.env.PHALA_ORACLE_KEY_MATERIAL_JSON = JSON.stringify({
    public_key_raw: publicKeyRaw,
    private_key_pkcs8: privateKeyPkcs8,
  });
  __resetOracleKeyMaterialForTests();

  const keyRes = await handler(
    new Request('http://local/oracle/public-key', { headers: authHeaders() })
  );
  assert.equal(keyRes.status, 200);
  const keyBody = await keyRes.json();
  assert.equal(keyBody.public_key, publicKeyRaw);
  assert.equal(keyBody.key_source, 'configured-env');

  const ciphertext = await encryptForOracle(publicKeyRaw, 'configured-secret');
  const plaintext = await decryptEncryptedToken(ciphertext, {});
  assert.equal(plaintext, 'configured-secret');
});

test('oracle query supports plain fetch mode', async () => {
  global.fetch = async (url) => {
    assert.equal(url, 'https://api.example.com/plain');
    return new Response(JSON.stringify({ ok: true, value: 7 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const res = await handler(
    new Request('http://local/oracle/query', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ url: 'https://api.example.com/plain', target_chain: 'neo_n3' }),
    })
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.mode, 'fetch');
  assert.equal(body.status_code, 200);
  assert.match(body.body, /"ok":true/);
});

test('oracle smart fetch supports encrypted_payload alias and script_base64', async () => {
  const keyRes = await handler(
    new Request('http://local/oracle/public-key', { headers: authHeaders() })
  );
  const keyBody = await keyRes.json();
  const ciphertext = await encryptForOracle(keyBody.public_key, 'secret-token');

  global.fetch = async (url, init) => {
    assert.equal(url, 'https://api.example.com/private');
    assert.equal(init.headers.get('Authorization'), 'Bearer secret-token');
    return new Response(JSON.stringify({ ok: true, age: 82 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const res = await handler(
    new Request('http://local/oracle/smart-fetch', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        url: 'https://api.example.com/private',
        encrypted_payload: ciphertext,
        script_base64: Buffer.from('function process(data) { return data.age > 80; }').toString(
          'base64'
        ),
        target_chain: 'neo_x',
        target_chain_id: '12227332',
      }),
    })
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.mode, 'fetch+compute');
  assert.equal(body.result, true);
  assert.equal(body.target_chain, 'neo_x');
  assert.equal(body.target_chain_id, '12227332');
});

test('oracle smart fetch supports encrypted JSON payload patches', async () => {
  const keyRes = await handler(
    new Request('http://local/oracle/public-key', { headers: authHeaders() })
  );
  const keyBody = await keyRes.json();
  const ciphertext = await encryptForOracle(
    keyBody.public_key,
    JSON.stringify({
      headers: { 'x-api-key': 'sealed-secret' },
      script: 'function process(data) { return data.age > 80; }',
    })
  );

  global.fetch = async (url, init) => {
    assert.equal(url, 'https://api.example.com/private-patch');
    assert.equal(init.headers.get('x-api-key'), 'sealed-secret');
    assert.equal(init.headers.has('Authorization'), false);
    return new Response(JSON.stringify({ ok: true, age: 83 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const res = await handler(
    new Request('http://local/oracle/smart-fetch', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        url: 'https://api.example.com/private-patch',
        encrypted_payload: ciphertext,
        target_chain: 'neo_n3',
      }),
    })
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.mode, 'fetch+compute');
  assert.equal(body.result, true);
  assert.equal(body.target_chain, 'neo_n3');
});

test('compute execute supports builtin heavy functions', async () => {
  const res = await handler(
    new Request('http://local/compute/execute', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        mode: 'builtin',
        function: 'math.modexp',
        input: { base: '2', exponent: '10', modulus: '17' },
        target_chain: 'neo_n3',
      }),
    })
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.mode, 'builtin');
  assert.equal(body.function, 'math.modexp');
  assert.equal(body.result.value, '4');
  assert.ok(body.signature);
});

test('compute execute supports zerc20 single-withdraw verification preflight', async () => {
  const res = await handler(
    new Request('http://local/compute/execute', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        mode: 'builtin',
        function: 'zkp.zerc20.single_withdraw.verify',
        input: {
          skip_proof_verification: true,
          public_inputs: {
            recipient: `0x${'11'.repeat(20)}`,
            withdraw_value: '1000000',
            tree_root: `0x${'22'.repeat(32)}`,
            path_indices: '0x01',
            blacklisted_root: `0x${'33'.repeat(32)}`,
          },
          expected_recipient: `0x${'11'.repeat(20)}`,
          expected_withdraw_value: '1000000',
        },
        target_chain: 'neo_n3',
      }),
    })
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.function, 'zkp.zerc20.single_withdraw.verify');
  assert.equal(body.result.is_valid, true);
  assert.equal(body.result.statement.recipient, `0x${'11'.repeat(20)}`);
  assert.equal(body.result.checks.withdraw_value.ok, true);
});

test('compute execute rejects oversized zkp verification payloads before snarkjs verify runs', async () => {
  const previous = process.env.COMPUTE_MAX_ZKP_VERIFY_INPUT_BYTES;
  process.env.COMPUTE_MAX_ZKP_VERIFY_INPUT_BYTES = '4096';
  try {
    const res = await handler(
      new Request('http://local/compute/execute', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          mode: 'builtin',
          function: 'zkp.groth16.verify',
          input: {
            verifying_key: { huge: 'x'.repeat(7000) },
            public_signals: ['1'],
            proof: {
              pi_a: ['1', '2'],
              pi_b: [
                ['1', '2'],
                ['3', '4'],
              ],
              pi_c: ['5', '6'],
            },
          },
          target_chain: 'neo_n3',
        }),
      })
    );
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /zkp verification input exceeds max size/i);
  } finally {
    if (previous === undefined) delete process.env.COMPUTE_MAX_ZKP_VERIFY_INPUT_BYTES;
    else process.env.COMPUTE_MAX_ZKP_VERIFY_INPUT_BYTES = previous;
  }
});

test('compute execute rejects groth16 verification when the verifier runtime is disabled', async () => {
  const previousRuntime = process.env.MORPHEUS_ZKP_VERIFY_RUNTIME;
  delete process.env.MORPHEUS_ZKP_VERIFY_RUNTIME;
  try {
    const res = await handler(
      new Request('http://local/compute/execute', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          mode: 'builtin',
          function: 'zkp.groth16.verify',
          input: {
            verifying_key: { vk_alpha_1: ['1', '2'] },
            public_signals: ['1'],
            proof: {
              pi_a: ['1', '2'],
              pi_b: [
                ['1', '2'],
                ['3', '4'],
              ],
              pi_c: ['5', '6'],
            },
          },
          target_chain: 'neo_n3',
        }),
      })
    );
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /groth16 verification runtime disabled/i);
  } finally {
    if (previousRuntime !== undefined) process.env.MORPHEUS_ZKP_VERIFY_RUNTIME = previousRuntime;
  }
});

test('compute execute can use an external groth16 verifier command when explicitly enabled', async () => {
  const previousRuntime = process.env.MORPHEUS_ZKP_VERIFY_RUNTIME;
  const previousBin = process.env.MORPHEUS_SNARKJS_BIN;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'morpheus-snarkjs-'));
  const stub = path.join(tempDir, 'snarkjs');
  await fs.writeFile(stub, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  process.env.MORPHEUS_ZKP_VERIFY_RUNTIME = 'cli';
  process.env.MORPHEUS_SNARKJS_BIN = stub;
  try {
    const res = await handler(
      new Request('http://local/compute/execute', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          mode: 'builtin',
          function: 'zkp.groth16.verify',
          input: {
            verifying_key: { vk_alpha_1: ['1', '2'] },
            public_signals: ['1'],
            proof: {
              pi_a: ['1', '2'],
              pi_b: [
                ['1', '2'],
                ['3', '4'],
              ],
              pi_c: ['5', '6'],
            },
          },
          target_chain: 'neo_n3',
        }),
      })
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.function, 'zkp.groth16.verify');
    assert.equal(body.result.is_valid, true);
  } finally {
    if (previousRuntime === undefined) delete process.env.MORPHEUS_ZKP_VERIFY_RUNTIME;
    else process.env.MORPHEUS_ZKP_VERIFY_RUNTIME = previousRuntime;
    if (previousBin === undefined) delete process.env.MORPHEUS_SNARKJS_BIN;
    else process.env.MORPHEUS_SNARKJS_BIN = previousBin;
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
});

test('paymaster authorize enforces network-specific policy', async () => {
  const snapshot = {
    testnetEnabled: process.env.MORPHEUS_PAYMASTER_TESTNET_ENABLED,
    testnetPolicyId: process.env.MORPHEUS_PAYMASTER_TESTNET_POLICY_ID,
    testnetMaxGas: process.env.MORPHEUS_PAYMASTER_TESTNET_MAX_GAS_UNITS,
    testnetAllowTargets: process.env.MORPHEUS_PAYMASTER_TESTNET_ALLOW_TARGETS,
    testnetAllowMethods: process.env.MORPHEUS_PAYMASTER_TESTNET_ALLOW_METHODS,
    testnetAllowAccounts: process.env.MORPHEUS_PAYMASTER_TESTNET_ALLOW_ACCOUNTS,
    testnetBlockAccounts: process.env.MORPHEUS_PAYMASTER_TESTNET_BLOCK_ACCOUNTS,
    testnetAllowDapps: process.env.MORPHEUS_PAYMASTER_TESTNET_ALLOW_DAPPS,
    mainnetEnabled: process.env.MORPHEUS_PAYMASTER_MAINNET_ENABLED,
  };

  process.env.MORPHEUS_PAYMASTER_TESTNET_ENABLED = 'true';
  process.env.MORPHEUS_PAYMASTER_TESTNET_POLICY_ID = 'testnet-aa';
  process.env.MORPHEUS_PAYMASTER_TESTNET_MAX_GAS_UNITS = '500000';
  process.env.MORPHEUS_PAYMASTER_TESTNET_ALLOW_TARGETS = `0x${'aa'.repeat(20)}`;
  process.env.MORPHEUS_PAYMASTER_TESTNET_ALLOW_METHODS = 'executeUserOp';
  process.env.MORPHEUS_PAYMASTER_TESTNET_ALLOW_ACCOUNTS = 'aa-test-account';
  process.env.MORPHEUS_PAYMASTER_TESTNET_BLOCK_ACCOUNTS = '';
  process.env.MORPHEUS_PAYMASTER_TESTNET_ALLOW_DAPPS = 'demo-dapp';
  process.env.MORPHEUS_PAYMASTER_MAINNET_ENABLED = 'false';

  try {
    const approved = await handler(
      new Request('http://local/paymaster/authorize', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          network: 'testnet',
          target_chain: 'neo_n3',
          account_id: 'aa-test-account',
          dapp_id: 'demo-dapp',
          target_contract: `0x${'aa'.repeat(20)}`,
          method: 'executeUserOp',
          estimated_gas_units: 120000,
          operation_hash: `0x${'44'.repeat(32)}`,
        }),
      })
    );
    assert.equal(approved.status, 200);
    const approvedBody = await approved.json();
    assert.equal(approvedBody.approved, true);
    assert.equal(approvedBody.network, 'testnet');
    assert.equal(approvedBody.policy_id, 'testnet-aa');
    assert.ok(approvedBody.sponsorship_id);
    assert.equal(approvedBody.operation_hash, `0x${'44'.repeat(32)}`);
    assert.ok(approvedBody.approval_digest);
    assert.ok(approvedBody.signature);

    const denied = await handler(
      new Request('http://local/paymaster/authorize', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          network: 'mainnet',
          target_chain: 'neo_n3',
          account_id: 'aa-test-account',
          dapp_id: 'demo-dapp',
          target_contract: `0x${'aa'.repeat(20)}`,
          method: 'executeUserOp',
          estimated_gas_units: 120000,
          operation_hash: `0x${'44'.repeat(32)}`,
        }),
      })
    );
    assert.equal(denied.status, 200);
    const deniedBody = await denied.json();
    assert.equal(deniedBody.approved, false);
    assert.match(deniedBody.reason, /disabled/i);

    const deniedDapp = await handler(
      new Request('http://local/paymaster/authorize', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          network: 'testnet',
          target_chain: 'neo_n3',
          account_id: 'aa-test-account',
          dapp_id: 'rogue-dapp',
          target_contract: `0x${'aa'.repeat(20)}`,
          method: 'executeUserOp',
          estimated_gas_units: 120000,
          operation_hash: `0x${'55'.repeat(32)}`,
        }),
      })
    );
    assert.equal(deniedDapp.status, 200);
    const deniedDappBody = await deniedDapp.json();
    assert.equal(deniedDappBody.approved, false);
    assert.match(deniedDappBody.reason, /dapp_id is not allowlisted/i);
  } finally {
    process.env.MORPHEUS_PAYMASTER_TESTNET_ENABLED = snapshot.testnetEnabled;
    process.env.MORPHEUS_PAYMASTER_TESTNET_POLICY_ID = snapshot.testnetPolicyId;
    process.env.MORPHEUS_PAYMASTER_TESTNET_MAX_GAS_UNITS = snapshot.testnetMaxGas;
    process.env.MORPHEUS_PAYMASTER_TESTNET_ALLOW_TARGETS = snapshot.testnetAllowTargets;
    process.env.MORPHEUS_PAYMASTER_TESTNET_ALLOW_METHODS = snapshot.testnetAllowMethods;
    process.env.MORPHEUS_PAYMASTER_TESTNET_ALLOW_ACCOUNTS = snapshot.testnetAllowAccounts;
    process.env.MORPHEUS_PAYMASTER_TESTNET_BLOCK_ACCOUNTS = snapshot.testnetBlockAccounts;
    process.env.MORPHEUS_PAYMASTER_TESTNET_ALLOW_DAPPS = snapshot.testnetAllowDapps;
    process.env.MORPHEUS_PAYMASTER_MAINNET_ENABLED = snapshot.mainnetEnabled;
  }
});

test('paymaster authorize can consult AA hook allowlist state', async () => {
  const snapshot = {
    testnetEnabled: process.env.MORPHEUS_PAYMASTER_TESTNET_ENABLED,
    testnetPolicyId: process.env.MORPHEUS_PAYMASTER_TESTNET_POLICY_ID,
    testnetMaxGas: process.env.MORPHEUS_PAYMASTER_TESTNET_MAX_GAS_UNITS,
    testnetAllowTargets: process.env.MORPHEUS_PAYMASTER_TESTNET_ALLOW_TARGETS,
    testnetAllowMethods: process.env.MORPHEUS_PAYMASTER_TESTNET_ALLOW_METHODS,
    testnetAllowAccounts: process.env.MORPHEUS_PAYMASTER_TESTNET_ALLOW_ACCOUNTS,
    testnetBlockAccounts: process.env.MORPHEUS_PAYMASTER_TESTNET_BLOCK_ACCOUNTS,
    testnetAllowDapps: process.env.MORPHEUS_PAYMASTER_TESTNET_ALLOW_DAPPS,
    testnetAaCoreHash: process.env.MORPHEUS_PAYMASTER_TESTNET_AA_CORE_HASH,
    testnetWhitelistHookHash: process.env.MORPHEUS_PAYMASTER_TESTNET_WHITELIST_HOOK_HASH,
    testnetMultiHookHash: process.env.MORPHEUS_PAYMASTER_TESTNET_MULTI_HOOK_HASH,
    testnetNeoRpcUrl: process.env.MORPHEUS_PAYMASTER_TESTNET_NEO_RPC_URL,
  };

  const aaCoreHash = `0x${'aa'.repeat(20)}`;
  const whitelistHookHash = `0x${'bb'.repeat(20)}`;
  const downstreamAllowed = `0x${'11'.repeat(20)}`;
  const downstreamDenied = `0x${'22'.repeat(20)}`;

  process.env.MORPHEUS_PAYMASTER_TESTNET_ENABLED = 'true';
  process.env.MORPHEUS_PAYMASTER_TESTNET_POLICY_ID = 'testnet-aa';
  process.env.MORPHEUS_PAYMASTER_TESTNET_MAX_GAS_UNITS = '500000';
  process.env.MORPHEUS_PAYMASTER_TESTNET_ALLOW_TARGETS = aaCoreHash;
  process.env.MORPHEUS_PAYMASTER_TESTNET_ALLOW_METHODS = 'executeUserOp';
  process.env.MORPHEUS_PAYMASTER_TESTNET_ALLOW_ACCOUNTS = '';
  process.env.MORPHEUS_PAYMASTER_TESTNET_BLOCK_ACCOUNTS = '';
  process.env.MORPHEUS_PAYMASTER_TESTNET_ALLOW_DAPPS = 'demo-dapp';
  process.env.MORPHEUS_PAYMASTER_TESTNET_AA_CORE_HASH = aaCoreHash;
  process.env.MORPHEUS_PAYMASTER_TESTNET_WHITELIST_HOOK_HASH = whitelistHookHash;
  process.env.MORPHEUS_PAYMASTER_TESTNET_MULTI_HOOK_HASH = '';
  process.env.MORPHEUS_PAYMASTER_TESTNET_NEO_RPC_URL = 'https://neo-rpc.test';

  global.fetch = async (_url, options = {}) => {
    const body = JSON.parse(String(options.body || '{}'));
    if (body.method !== 'invokefunction') {
      throw new Error(`unexpected rpc method ${body.method}`);
    }
    const [, operation, args] = body.params;
    if (operation === 'getHook') {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            state: 'HALT',
            stack: [{ type: 'Hash160', value: whitelistHookHash }],
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    if (operation === 'isWhitelisted') {
      const targetHash = args?.[1]?.value;
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            state: 'HALT',
            stack: [
              {
                type: 'Boolean',
                value: String(targetHash).toLowerCase() === downstreamAllowed.toLowerCase(),
              },
            ],
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    throw new Error(`unexpected operation ${operation}`);
  };

  try {
    const approved = await handler(
      new Request('http://local/paymaster/authorize', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          network: 'testnet',
          target_chain: 'neo_n3',
          account_id: 'aa-test-account',
          dapp_id: 'demo-dapp',
          target_contract: aaCoreHash,
          method: 'executeUserOp',
          userop_target_contract: downstreamAllowed,
          userop_method: 'claimRewards',
          estimated_gas_units: 120000,
          operation_hash: `0x${'44'.repeat(32)}`,
        }),
      })
    );
    assert.equal(approved.status, 200);
    const approvedBody = await approved.json();
    assert.equal(approvedBody.approved, true);
    assert.equal(approvedBody.onchain_policy.source, 'aa_hook');
    assert.equal(approvedBody.userop_target_contract, downstreamAllowed);
    assert.equal(approvedBody.userop_method, 'claimRewards');

    const denied = await handler(
      new Request('http://local/paymaster/authorize', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          network: 'testnet',
          target_chain: 'neo_n3',
          account_id: 'aa-test-account',
          dapp_id: 'demo-dapp',
          target_contract: aaCoreHash,
          method: 'executeUserOp',
          userop_target_contract: downstreamDenied,
          userop_method: 'claimRewards',
          estimated_gas_units: 120000,
          operation_hash: `0x${'55'.repeat(32)}`,
        }),
      })
    );
    assert.equal(denied.status, 200);
    const deniedBody = await denied.json();
    assert.equal(deniedBody.approved, false);
    assert.match(deniedBody.reason, /userop_target_contract is not allowlisted/i);
  } finally {
    process.env.MORPHEUS_PAYMASTER_TESTNET_ENABLED = snapshot.testnetEnabled;
    process.env.MORPHEUS_PAYMASTER_TESTNET_POLICY_ID = snapshot.testnetPolicyId;
    process.env.MORPHEUS_PAYMASTER_TESTNET_MAX_GAS_UNITS = snapshot.testnetMaxGas;
    process.env.MORPHEUS_PAYMASTER_TESTNET_ALLOW_TARGETS = snapshot.testnetAllowTargets;
    process.env.MORPHEUS_PAYMASTER_TESTNET_ALLOW_METHODS = snapshot.testnetAllowMethods;
    process.env.MORPHEUS_PAYMASTER_TESTNET_ALLOW_ACCOUNTS = snapshot.testnetAllowAccounts;
    process.env.MORPHEUS_PAYMASTER_TESTNET_BLOCK_ACCOUNTS = snapshot.testnetBlockAccounts;
    process.env.MORPHEUS_PAYMASTER_TESTNET_ALLOW_DAPPS = snapshot.testnetAllowDapps;
    process.env.MORPHEUS_PAYMASTER_TESTNET_AA_CORE_HASH = snapshot.testnetAaCoreHash;
    process.env.MORPHEUS_PAYMASTER_TESTNET_WHITELIST_HOOK_HASH = snapshot.testnetWhitelistHookHash;
    process.env.MORPHEUS_PAYMASTER_TESTNET_MULTI_HOOK_HASH = snapshot.testnetMultiHookHash;
    process.env.MORPHEUS_PAYMASTER_TESTNET_NEO_RPC_URL = snapshot.testnetNeoRpcUrl;
    global.fetch = originalFetch;
  }
});

test('compute execute supports encrypted confidential payload patches', async () => {
  const keyRes = await handler(
    new Request('http://local/oracle/public-key', { headers: authHeaders() })
  );
  const keyBody = await keyRes.json();
  const ciphertext = await encryptForOracle(
    keyBody.public_key,
    JSON.stringify({
      mode: 'builtin',
      function: 'math.modexp',
      input: { base: '2', exponent: '10', modulus: '17' },
      target_chain: 'neo_x',
      target_chain_id: '12227332',
    })
  );

  const res = await handler(
    new Request('http://local/compute/execute', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ encrypted_payload: ciphertext }),
    })
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.mode, 'builtin');
  assert.equal(body.function, 'math.modexp');
  assert.equal(body.result.value, '4');
  assert.equal(body.target_chain, 'neo_x');
  assert.equal(body.target_chain_id, '12227332');
});

test('compute execute supports X25519 encrypted payloads larger than raw RSA limits', async () => {
  const keyRes = await handler(
    new Request('http://local/oracle/public-key', { headers: authHeaders() })
  );
  const keyBody = await keyRes.json();
  const ciphertext = await encryptForOracle(
    keyBody.public_key,
    JSON.stringify({
      mode: 'builtin',
      function: 'hash.sha256',
      input: {
        message: 'neo-morpheus',
        note: 'x'.repeat(2048),
      },
      target_chain: 'neo_n3',
    })
  );

  const res = await handler(
    new Request('http://local/compute/execute', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ encrypted_input: ciphertext }),
    })
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.mode, 'builtin');
  assert.equal(body.function, 'hash.sha256');
  assert.ok(body.result.digest);
});

test('compute execute supports wasm runtime', async () => {
  const res = await handler(
    new Request('http://local/compute/execute', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        wasm_base64: TEST_WASM_OK_BASE64,
        target_chain: 'neo_x',
      }),
    })
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.runtime, 'wasm');
  assert.equal(body.result, true);
});

test('compute builtins support rsa verification and canonical polynomial order', async () => {
  const payloadString = JSON.stringify({ hello: 'neo-morpheus' });
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const signer = createSign('RSA-SHA256');
  signer.update(payloadString);
  signer.end();
  const signatureHex = signer.sign(privateKey).toString('hex');

  const rsaRes = await handler(
    new Request('http://local/compute/execute', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        mode: 'builtin',
        function: 'crypto.rsa_verify',
        input: {
          public_key: publicKey.export({ type: 'spki', format: 'pem' }),
          signature: signatureHex,
          payload: payloadString,
        },
        target_chain: 'neo_n3',
      }),
    })
  );
  assert.equal(rsaRes.status, 200);
  const rsaBody = await rsaRes.json();
  assert.equal(rsaBody.result.is_valid, true);

  const polynomialRes = await handler(
    new Request('http://local/compute/execute', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        mode: 'builtin',
        function: 'math.polynomial',
        input: { coefficients: [2, 3], x: 5 },
        target_chain: 'neo_n3',
      }),
    })
  );
  assert.equal(polynomialRes.status, 200);
  const polynomialBody = await polynomialRes.json();
  assert.equal(polynomialBody.result.value, '13');
});

test('oracle smart fetch enforces script timeout', async () => {
  global.fetch = async () =>
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

  const res = await handler(
    new Request('http://local/oracle/smart-fetch', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        url: 'https://api.example.com/slow-script',
        script: 'function process(data) { while (true) {} }',
        script_timeout_ms: 50,
        target_chain: 'neo_n3',
      }),
    })
  );
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /timed out/);
});

test('oracle smart fetch supports wasm runtime', async () => {
  global.fetch = async () =>
    new Response(JSON.stringify({ ok: true, price: '1.23' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

  const res = await handler(
    new Request('http://local/oracle/smart-fetch', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        url: 'https://api.example.com/wasm',
        wasm_base64: TEST_WASM_OK_BASE64,
        target_chain: 'neo_n3',
      }),
    })
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.mode, 'fetch+compute');
  assert.equal(body.result, true);
});

test('oracle fetch enforces upstream timeout', async () => {
  global.fetch = async (_url, init) =>
    await new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('aborted')));
    });

  const res = await handler(
    new Request('http://local/oracle/query', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        url: 'https://api.example.com/hanging',
        oracle_timeout_ms: 50,
        target_chain: 'neo_n3',
      }),
    })
  );
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /timed out/);
});

test('oracle smart fetch rejects oversized upstream responses', async () => {
  process.env.ORACLE_MAX_UPSTREAM_BODY_BYTES = '128';
  global.fetch = async () =>
    new Response('x'.repeat(8192), {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    });

  const res = await handler(
    new Request('http://local/oracle/smart-fetch', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        url: 'https://api.example.com/large',
        target_chain: 'neo_n3',
      }),
    })
  );
  delete process.env.ORACLE_MAX_UPSTREAM_BODY_BYTES;
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /upstream response exceeds max size/i);
});

test('compute script enforces timeout', async () => {
  const res = await handler(
    new Request('http://local/compute/execute', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        mode: 'script',
        script: 'function process(input) { while (true) {} }',
        script_timeout_ms: 50,
        target_chain: 'neo_n3',
      }),
    })
  );
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /timed out/);
});

test('compute wasm enforces timeout', async () => {
  const res = await handler(
    new Request('http://local/compute/execute', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        wasm_base64: TEST_WASM_LOOP_BASE64,
        wasm_timeout_ms: 50,
        target_chain: 'neo_n3',
      }),
    })
  );
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /timed out/);
});

test('compute script rejects invalid entry point identifiers', async () => {
  const res = await handler(
    new Request('http://local/compute/execute', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        mode: 'script',
        script: 'function safe(input) { return input; }',
        entry_point: 'safe();evil',
        target_chain: 'neo_n3',
      }),
    })
  );
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /valid identifier/);
});

test('compute script rejects oversized input payloads', async () => {
  process.env.COMPUTE_MAX_INPUT_BYTES = '1024';
  const res = await handler(
    new Request('http://local/compute/execute', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        mode: 'script',
        script: 'function process(input) { return input.payload.length; }',
        input: { payload: 'x'.repeat(3000) },
        target_chain: 'neo_n3',
      }),
    })
  );
  delete process.env.COMPUTE_MAX_INPUT_BYTES;
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /compute input exceeds max size/i);
});

test('compute script rejects oversized result payloads', async () => {
  process.env.SCRIPT_WORKER_MAX_RESULT_BYTES = '1024';
  const res = await handler(
    new Request('http://local/compute/execute', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        mode: 'script',
        script: 'function process(input) { return "x".repeat(4000); }',
        target_chain: 'neo_n3',
      }),
    })
  );
  delete process.env.SCRIPT_WORKER_MAX_RESULT_BYTES;
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /script result exceeds max size/i);
});

test('compute execute resolves script_ref from a Neo N3 contract getter', async () => {
  const originalInvokeFunction = neoRpc.RPCClient.prototype.invokeFunction;
  neoRpc.RPCClient.prototype.invokeFunction = async function (_hash, method) {
    assert.equal(method, 'getScript');
    return {
      state: 'HALT',
      stack: [
        {
          type: 'ByteString',
          value: Buffer.from(
            'function process(input) { return input.value * 2; }',
            'utf8'
          ).toString('base64'),
        },
      ],
    };
  };
  try {
    const res = await handler(
      new Request('http://local/compute/execute', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          mode: 'script',
          script_ref: {
            contract_hash: '0x1111111111111111111111111111111111111111',
            method: 'getScript',
            script_name: 'double',
          },
          input: { value: 7 },
          target_chain: 'neo_n3',
        }),
      })
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.result, 14);
  } finally {
    neoRpc.RPCClient.prototype.invokeFunction = originalInvokeFunction;
  }
});

test('compute script blocks constructor escape patterns', async () => {
  const res = await handler(
    new Request('http://local/compute/execute', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        mode: 'script',
        script: 'function process(input) { return this.constructor.constructor(\"return 1\")(); }',
        target_chain: 'neo_n3',
      }),
    })
  );
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /constructor introspection is not allowed/);
});

test('oracle smart fetch blocks global object access in user script', async () => {
  global.fetch = async () =>
    new Response(JSON.stringify({ ok: true, price: '1.23' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

  const res = await handler(
    new Request('http://local/oracle/smart-fetch', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        provider: 'twelvedata',
        symbol: 'NEO-USD',
        script: 'function process(data) { return globalThis.process; }',
        target_chain: 'neo_n3',
      }),
    })
  );
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /global object access is not allowed/);
});

test('oracle smart fetch resolves script_ref from a Neo N3 contract getter', async () => {
  const originalInvokeFunction = neoRpc.RPCClient.prototype.invokeFunction;
  neoRpc.RPCClient.prototype.invokeFunction = async function (_hash, method) {
    assert.equal(method, 'getScript');
    return {
      state: 'HALT',
      stack: [
        {
          type: 'String',
          value: 'function process(data) { return Number(data.price) > 1; }',
        },
      ],
    };
  };
  global.fetch = async () =>
    new Response(JSON.stringify({ price: '1.23' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  try {
    const res = await handler(
      new Request('http://local/oracle/smart-fetch', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          url: 'https://api.example.com/script-ref',
          script_ref: {
            contract_hash: '0x2222222222222222222222222222222222222222',
            method: 'getScript',
            script_name: 'greaterThanOne',
          },
          target_chain: 'neo_n3',
        }),
      })
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.result, true);
  } finally {
    neoRpc.RPCClient.prototype.invokeFunction = originalInvokeFunction;
  }
});

test('oracle smart fetch uses compact programmable context for large custom URL payloads', async () => {
  const previousMax = process.env.ORACLE_MAX_SCRIPT_INPUT_BYTES;
  process.env.ORACLE_MAX_SCRIPT_INPUT_BYTES = '1024';
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        args: { probe: 'neo-morpheus' },
        noise: 'x'.repeat(700),
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }
    );
  try {
    const res = await handler(
      new Request('http://local/oracle/smart-fetch', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          url: 'https://api.example.com/compact-context',
          script: 'function process(data) { return data.args.probe + \"-script\"; }',
          target_chain: 'neo_n3',
        }),
      })
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.result, 'neo-morpheus-script');
  } finally {
    if (previousMax === undefined) delete process.env.ORACLE_MAX_SCRIPT_INPUT_BYTES;
    else process.env.ORACLE_MAX_SCRIPT_INPUT_BYTES = previousMax;
  }
});

test('sign-payload supports neo_n3 and neo_x', async () => {
  global.fetch = originalFetch;

  const neoN3Res = await handler(
    new Request('http://local/sign/payload', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ target_chain: 'neo_n3', message: 'hello neo n3' }),
    })
  );
  assert.equal(neoN3Res.status, 200);
  const neoN3 = await neoN3Res.json();
  assert.ok(neoN3.signature);
  assert.ok(neoN3.public_key);
  assert.ok(neoN3.address);

  const neoXRes = await handler(
    new Request('http://local/sign/payload', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ target_chain: 'neo_x', message: 'hello neo x' }),
    })
  );
  assert.equal(neoXRes.status, 200);
  const neoX = await neoXRes.json();
  assert.ok(neoX.signature);
  assert.ok(neoX.address);
  assert.equal(neoX.mode, 'message');
});

test('sign-payload can use the oracle_verifier signing role when configured', async () => {
  global.fetch = originalFetch;
  const previous = process.env.MORPHEUS_ORACLE_VERIFIER_PRIVATE_KEY;
  process.env.MORPHEUS_ORACLE_VERIFIER_PRIVATE_KEY =
    '68e15083a6fd187b6f5f6136bada4eb00f096e5e21d82c74edf6f086e80539ba';
  try {
    const res = await handler(
      new Request('http://local/sign/payload', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          target_chain: 'neo_n3',
          key_role: 'oracle_verifier',
          message: 'oracle verifier path',
        }),
      })
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.signature);
    assert.ok(body.public_key);
    assert.ok(body.address);
  } finally {
    if (previous === undefined) delete process.env.MORPHEUS_ORACLE_VERIFIER_PRIVATE_KEY;
    else process.env.MORPHEUS_ORACLE_VERIFIER_PRIVATE_KEY = previous;
  }
});

test('sign-payload falls back to the worker derived key when oracle_verifier derivation is unavailable', async () => {
  global.fetch = originalFetch;
  const previousUseDerivedKeys = process.env.PHALA_USE_DERIVED_KEYS;
  const previousWorkerKey = process.env.PHALA_NEO_N3_PRIVATE_KEY;
  const previousOracleVerifierKey = process.env.MORPHEUS_ORACLE_VERIFIER_PRIVATE_KEY;
  const requestedPaths = [];

  process.env.PHALA_USE_DERIVED_KEYS = 'true';
  delete process.env.PHALA_NEO_N3_PRIVATE_KEY;
  delete process.env.MORPHEUS_ORACLE_VERIFIER_PRIVATE_KEY;

  __setDstackClientFactoryForTests(async () => ({
    getKey: async (keyPath) => {
      requestedPaths.push(String(keyPath));
      if (String(keyPath).endsWith('/oracle_verifier/signing/v1')) {
        throw new Error('oracle_verifier path missing');
      }
      if (String(keyPath).endsWith('/worker/signing/v1')) {
        return { key: Uint8Array.from(Buffer.from('22'.repeat(32), 'hex')) };
      }
      throw new Error(`unexpected key path ${keyPath}`);
    },
    info: async () => ({
      app_id: 'app',
      instance_id: 'inst',
      compose_hash: 'compose',
      app_name: 'Morpheus',
      device_id: 'device',
      key_provider_info: 'mock',
      tcb_info: null,
    }),
    getQuote: async () => ({ quote: '0x01', event_log: '[]', report_data: '0x02' }),
  }));

  try {
    const res = await handler(
      new Request('http://local/sign/payload', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          target_chain: 'neo_n3',
          key_role: 'oracle_verifier',
          message: 'oracle verifier fallback path',
        }),
      })
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.signature);
    assert.ok(body.public_key);
    assert.ok(body.address);
    assert.ok(requestedPaths.some((value) => value.endsWith('/oracle_verifier/signing/v1')));
    assert.ok(requestedPaths.some((value) => value.endsWith('/worker/signing/v1')));
  } finally {
    if (previousUseDerivedKeys === undefined) delete process.env.PHALA_USE_DERIVED_KEYS;
    else process.env.PHALA_USE_DERIVED_KEYS = previousUseDerivedKeys;

    if (previousWorkerKey === undefined) delete process.env.PHALA_NEO_N3_PRIVATE_KEY;
    else process.env.PHALA_NEO_N3_PRIVATE_KEY = previousWorkerKey;

    if (previousOracleVerifierKey === undefined)
      delete process.env.MORPHEUS_ORACLE_VERIFIER_PRIVATE_KEY;
    else process.env.MORPHEUS_ORACLE_VERIFIER_PRIVATE_KEY = previousOracleVerifierKey;

    __resetDstackClientStateForTests();
  }
});

test('sign-payload prefers an explicit oracle_verifier key over derived signing paths', async () => {
  global.fetch = originalFetch;
  const previousUseDerivedKeys = process.env.PHALA_USE_DERIVED_KEYS;
  const previousOracleVerifierKey = process.env.MORPHEUS_ORACLE_VERIFIER_PRIVATE_KEY;
  const requestedPaths = [];
  const explicitOracleVerifierKey =
    '68e15083a6fd187b6f5f6136bada4eb00f096e5e21d82c74edf6f086e80539ba';
  const explicitAccount = new neoWallet.Account(explicitOracleVerifierKey);

  process.env.PHALA_USE_DERIVED_KEYS = 'true';
  process.env.MORPHEUS_ORACLE_VERIFIER_PRIVATE_KEY = explicitOracleVerifierKey;

  __setDstackClientFactoryForTests(async () => ({
    getKey: async (keyPath) => {
      requestedPaths.push(String(keyPath));
      return { key: Uint8Array.from(Buffer.from('33'.repeat(32), 'hex')) };
    },
    info: async () => ({
      app_id: 'app',
      instance_id: 'inst',
      compose_hash: 'compose',
      app_name: 'Morpheus',
      device_id: 'device',
      key_provider_info: 'mock',
      tcb_info: null,
    }),
    getQuote: async () => ({ quote: '0x01', event_log: '[]', report_data: '0x02' }),
  }));

  try {
    const res = await handler(
      new Request('http://local/sign/payload', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          target_chain: 'neo_n3',
          key_role: 'oracle_verifier',
          message: 'oracle verifier explicit key path',
        }),
      })
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.public_key, explicitAccount.publicKey);
    assert.equal(body.address, explicitAccount.address);
    assert.deepEqual(requestedPaths, []);
  } finally {
    if (previousUseDerivedKeys === undefined) delete process.env.PHALA_USE_DERIVED_KEYS;
    else process.env.PHALA_USE_DERIVED_KEYS = previousUseDerivedKeys;

    if (previousOracleVerifierKey === undefined)
      delete process.env.MORPHEUS_ORACLE_VERIFIER_PRIVATE_KEY;
    else process.env.MORPHEUS_ORACLE_VERIFIER_PRIVATE_KEY = previousOracleVerifierKey;

    __resetDstackClientStateForTests();
  }
});

test('oracle feed supports neo_x contract relay mode', async () => {
  __resetFeedStateForTests();
  process.env.CONTRACT_MORPHEUS_DATAFEED_X_ADDRESS = '0x1111111111111111111111111111111111111111';
  global.fetch = async (url, init) => {
    const value = String(url);
    if (/^https:\/\/api\.twelvedata\.com\//.test(value) && value.includes('NEO%2FUSD')) {
      return new Response(JSON.stringify({ price: '12.34' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (/^https:\/\/api\.twelvedata\.com\//.test(value) && value.includes('GAS%2FUSD')) {
      return new Response(JSON.stringify({ price: '5.67' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const res = await handler(
    new Request('http://local/oracle/feed', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        symbols: ['NEO-USD', 'GAS-USD'],
        target_chain: 'neo_x',
        broadcast: false,
        contract_address: '0x1111111111111111111111111111111111111111',
        chain_id: 47763,
        nonce: 1,
        gas_limit: '250000',
        max_fee_per_gas: '1000000000',
        max_priority_fee_per_gas: '100000000',
      }),
    })
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.target_chain, 'neo_x');
  assert.ok(Array.isArray(body.sync_results));
  assert.equal(body.batch_submitted, true);
  assert.equal(body.batch_count, 2);
  assert.ok(body.batch_tx);
  assert.equal(body.sync_results[0].relay_status, 'submitted');
  assert.equal(body.sync_results[1].relay_status, 'submitted');
  assert.equal(body.sync_results[0].quote.decimals, 6);
  const iface = new Interface([
    'function updateFeeds(string[] pairs,uint256[] roundIds,uint256[] prices,uint256[] timestamps,bytes32[] attestationHashes,uint256[] sourceSetIds)',
  ]);
  const txEnvelope = Transaction.from(body.batch_tx.raw_transaction);
  const decoded = iface.decodeFunctionData('updateFeeds', txEnvelope.data);
  assert.deepEqual(Array.from(decoded[0]), ['TWELVEDATA:NEO-USD', 'TWELVEDATA:GAS-USD']);
  assert.equal(decoded[2][0].toString(), '12340000');
  assert.equal(decoded[2][1].toString(), '5670000');
});

test('oracle feed records scan prices and skips chain tx when all changes stay below threshold', async () => {
  __resetFeedStateForTests();
  process.env.CONTRACT_MORPHEUS_DATAFEED_X_ADDRESS = '0x1111111111111111111111111111111111111111';

  let currentPrice = '12.34';
  global.fetch = async (url) => {
    const value = String(url);
    if (/^https:\/\/api\.twelvedata\.com\//.test(value) && value.includes('NEO%2FUSD')) {
      return new Response(JSON.stringify({ price: currentPrice }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const first = await handler(
    new Request('http://local/oracle/feed', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        symbols: ['NEO-USD'],
        target_chain: 'neo_x',
        feed_change_threshold_bps: 10,
        feed_min_update_interval_ms: 0,
        broadcast: false,
        contract_address: '0x1111111111111111111111111111111111111111',
        chain_id: 47763,
        nonce: 1,
        gas_limit: '250000',
        max_fee_per_gas: '1000000000',
        max_priority_fee_per_gas: '100000000',
      }),
    })
  );
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.equal(firstBody.batch_submitted, true);

  currentPrice = '12.35'; // ~0.081% change from 12.34
  const second = await handler(
    new Request('http://local/oracle/feed', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        symbols: ['NEO-USD'],
        target_chain: 'neo_x',
        feed_change_threshold_bps: 10,
        feed_min_update_interval_ms: 0,
        broadcast: false,
        contract_address: '0x1111111111111111111111111111111111111111',
        chain_id: 47763,
        nonce: 2,
        gas_limit: '250000',
        max_fee_per_gas: '1000000000',
        max_priority_fee_per_gas: '100000000',
      }),
    })
  );
  assert.equal(second.status, 200);
  const secondBody = await second.json();
  assert.equal(secondBody.batch_submitted, false);
  assert.equal(secondBody.batch_count, 0);
  assert.equal(secondBody.batch_tx, null);
  assert.equal(secondBody.sync_results[0].relay_status, 'skipped');
  assert.equal(secondBody.sync_results[0].skip_reason, 'price-change-below-threshold');
  assert.equal(secondBody.sync_results[0].comparison_basis, 'current-chain-price');

  currentPrice = '12.36'; // >0.1% from submitted chain value 12.34, but only ~0.08% from prior scan 12.35
  const third = await handler(
    new Request('http://local/oracle/feed', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        symbols: ['NEO-USD'],
        target_chain: 'neo_x',
        feed_change_threshold_bps: 10,
        feed_min_update_interval_ms: 0,
        broadcast: false,
        contract_address: '0x1111111111111111111111111111111111111111',
        chain_id: 47763,
        nonce: 3,
        gas_limit: '250000',
        max_fee_per_gas: '1000000000',
        max_priority_fee_per_gas: '100000000',
      }),
    })
  );
  assert.equal(third.status, 200);
  const thirdBody = await third.json();
  assert.equal(thirdBody.batch_submitted, true);
  assert.equal(thirdBody.batch_count, 1);
  assert.equal(thirdBody.sync_results[0].relay_status, 'submitted');
});

test('oracle feed compares threshold using quantized on-chain integer price units', async () => {
  __resetFeedStateForTests();
  process.env.CONTRACT_MORPHEUS_DATAFEED_X_ADDRESS = '0x1111111111111111111111111111111111111111';

  let currentPrice = '1.00';
  global.fetch = async (url) => {
    const value = String(url);
    if (/^https:\/\/api\.twelvedata\.com\//.test(value) && value.includes('USDT%2FUSD')) {
      return new Response(JSON.stringify({ price: currentPrice }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const first = await handler(
    new Request('http://local/oracle/feed', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        symbols: ['USDT-USD'],
        target_chain: 'neo_x',
        feed_change_threshold_bps: 10,
        feed_min_update_interval_ms: 0,
        broadcast: false,
        contract_address: '0x1111111111111111111111111111111111111111',
        chain_id: 47763,
        nonce: 11,
        gas_limit: '250000',
        max_fee_per_gas: '1000000000',
        max_priority_fee_per_gas: '100000000',
      }),
    })
  );
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.equal(firstBody.batch_submitted, true);

  currentPrice = '1.0000004'; // still quantizes to the same 1e6-scaled on-chain integer
  const second = await handler(
    new Request('http://local/oracle/feed', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        symbols: ['USDT-USD'],
        target_chain: 'neo_x',
        feed_change_threshold_bps: 10,
        feed_min_update_interval_ms: 0,
        broadcast: false,
        contract_address: '0x1111111111111111111111111111111111111111',
        chain_id: 47763,
        nonce: 12,
        gas_limit: '250000',
        max_fee_per_gas: '1000000000',
        max_priority_fee_per_gas: '100000000',
      }),
    })
  );
  assert.equal(second.status, 200);
  const secondBody = await second.json();
  assert.equal(secondBody.batch_submitted, false);
  assert.equal(secondBody.sync_results[0].skip_reason, 'price-change-below-threshold');
  assert.equal(secondBody.sync_results[0].change_bps, 0);
  assert.equal(secondBody.sync_results[0].comparison_basis, 'current-chain-price');

  currentPrice = '1.001'; // +0.1%, should now publish under 1e6 scale
  const third = await handler(
    new Request('http://local/oracle/feed', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        symbols: ['USDT-USD'],
        target_chain: 'neo_x',
        feed_change_threshold_bps: 10,
        feed_min_update_interval_ms: 0,
        broadcast: false,
        contract_address: '0x1111111111111111111111111111111111111111',
        chain_id: 47763,
        nonce: 13,
        gas_limit: '250000',
        max_fee_per_gas: '1000000000',
        max_priority_fee_per_gas: '100000000',
      }),
    })
  );
  assert.equal(third.status, 200);
  const thirdBody = await third.json();
  assert.equal(thirdBody.batch_submitted, true);
  assert.equal(thirdBody.batch_count, 1);
  assert.equal(thirdBody.sync_results[0].relay_status, 'submitted');
});

test('relay-transaction signs neo_x tx locally when broadcast is disabled', async () => {
  global.fetch = originalFetch;

  const res = await handler(
    new Request('http://local/relay/transaction', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        target_chain: 'neo_x',
        broadcast: false,
        transaction: {
          to: '0x1111111111111111111111111111111111111111',
          data: '0x',
          value: '0',
          chain_id: 47763,
          nonce: 1,
          gas_limit: '21000',
          max_fee_per_gas: '1000000000',
          max_priority_fee_per_gas: '100000000',
        },
      }),
    })
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.target_chain, 'neo_x');
  assert.ok(body.raw_transaction);
  assert.ok(body.address);
});
