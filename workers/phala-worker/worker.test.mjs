import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { Interface, Transaction } from 'ethers';

const originalFetch = global.fetch;
const originalPhalaToken = process.env.PHALA_SHARED_SECRET;
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

process.env.PHALA_SHARED_SECRET = 'worker-test-secret';
process.env.PHALA_NEO_N3_PRIVATE_KEY = '1111111111111111111111111111111111111111111111111111111111111111';
process.env.PHALA_NEOX_PRIVATE_KEY = '0x59c6995e998f97a5a0044976f5d7d28f6af5b8b4f3d8f93f2af6d0a2b03f1abb';
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

const { default: handler } = await import('./src/worker.js');
const { __setDstackClientFactoryForTests, __resetDstackClientStateForTests } = await import('./src/platform/dstack.js');
const { __resetOracleKeyMaterialForTests } = await import('./src/oracle/crypto.js');
const { __resetFeedStateForTests } = await import('./src/oracle/feeds.js');
const { allowlistAllows } = await import('./src/platform/allowlist.js');
const { loadNeoN3Context } = await import('./src/chain/neo-n3.js');

function authHeaders() {
  return {
    authorization: 'Bearer worker-test-secret',
    'content-type': 'application/json',
  };
}

const TEST_WASM_OK_BASE64 = 'AGFzbQEAAAABEANgAAF/YAF/AX9gAn9/AX8CGAEIbW9ycGhldXMLbm93X3NlY29uZHMAAAMEAwEAAgUDAQABBgwCfwFBgAgLfwFBAAsHJQQGbWVtb3J5AgAFYWxsb2MAAQpyZXN1bHRfbGVuAAIDcnVuAAMKSQMRAQF/IwAhASMAIABqJAAgAQsEACMBCzAAQQQkAUGAEEH0ADoAAEGBEEHyADoAAEGCEEH1ADoAAEGDEEHlADoAABAAGkGAEAsAQwRuYW1lAQYBAANub3cCHwQAAAECAARzaXplAQRhZGRyAgADAgADcHRyAQNsZW4HEwIABGhlYXABCnJlc3VsdF9sZW4=';
const TEST_WASM_LOOP_BASE64 = 'AGFzbQEAAAABEANgAX8Bf2AAAX9gAn9/AX8DBAMAAQIFAwEAAQYHAX8BQYAICwclBAZtZW1vcnkCAAVhbGxvYwAACnJlc3VsdF9sZW4AAQNydW4AAgoVAwQAIwALBABBAAsJAANADAALQQALACcEbmFtZQIXAwABAARzaXplAQACAgADcHRyAQNsZW4HBwEABGhlYXA=';
const TEST_ORACLE_ENCRYPTION_ALGORITHM = 'X25519-HKDF-SHA256-AES-256-GCM';
const TEST_ORACLE_ENCRYPTION_INFO = 'morpheus-confidential-payload-v2';
const AES_GCM_TAG_LENGTH_BYTES = 16;

async function encryptForOracle(publicKeyBase64, plaintext) {
  const recipientPublicKeyBytes = Buffer.from(publicKeyBase64, 'base64');
  const recipientKey = await globalThis.crypto.subtle.importKey(
    'raw',
    recipientPublicKeyBytes,
    { name: 'X25519' },
    false,
    [],
  );
  const ephemeralKeyPair = await globalThis.crypto.subtle.generateKey(
    { name: 'X25519' },
    true,
    ['deriveBits'],
  );
  const ephemeralPublicKeyBytes = new Uint8Array(await globalThis.crypto.subtle.exportKey('raw', ephemeralKeyPair.publicKey));
  const sharedSecret = new Uint8Array(await globalThis.crypto.subtle.deriveBits(
    { name: 'X25519', public: recipientKey },
    ephemeralKeyPair.privateKey,
    256,
  ));
  const keyMaterial = await globalThis.crypto.subtle.importKey(
    'raw',
    sharedSecret,
    'HKDF',
    false,
    ['deriveKey'],
  );
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
    ['encrypt'],
  );
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const encryptedBytes = new Uint8Array(await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    new TextEncoder().encode(plaintext),
  ));
  const ciphertextBytes = encryptedBytes.slice(0, encryptedBytes.length - AES_GCM_TAG_LENGTH_BYTES);
  const tagBytes = encryptedBytes.slice(encryptedBytes.length - AES_GCM_TAG_LENGTH_BYTES);
  return Buffer.from(JSON.stringify({
    v: 2,
    alg: TEST_ORACLE_ENCRYPTION_ALGORITHM,
    epk: Buffer.from(ephemeralPublicKeyBytes).toString('base64'),
    iv: Buffer.from(iv).toString('base64'),
    ct: Buffer.from(ciphertextBytes).toString('base64'),
    tag: Buffer.from(tagBytes).toString('base64'),
  })).toString('base64');
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
      return new Response(JSON.stringify([{
        provider_id: 'twelvedata',
        enabled: true,
        config: { symbol: 'GAS-USD', endpoint: 'price', interval: '5min' },
      }]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    assert.match(value, /api\.twelvedata\.com\/price/);
    assert.match(value, /symbol=GAS%2FUSD/);
    assert.match(value, /interval=5min/);
    return new Response(JSON.stringify({ price: '3.21' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const res = await handler(new Request('http://local/oracle/query', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ provider: 'twelvedata', project_slug: 'demo', target_chain: 'neo_n3' }),
  }));
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
      return new Response(JSON.stringify([{ id: 'project-demo-disabled-id', slug: 'demo-disabled' }]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (value.startsWith('https://supabase.test/rest/v1/morpheus_provider_configs')) {
      return new Response(JSON.stringify([{
        provider_id: 'twelvedata',
        enabled: false,
        config: { symbol: 'NEO-USD' },
      }]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`unexpected fetch ${value}`);
  };

  const res = await handler(new Request('http://local/oracle/query', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ provider: 'twelvedata', project_slug: 'demo-disabled', target_chain: 'neo_n3' }),
  }));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /disabled/);
});

test.after(() => {
  global.fetch = originalFetch;
  process.env.PHALA_SHARED_SECRET = originalPhalaToken;
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
  __resetDstackClientStateForTests();
  __resetOracleKeyMaterialForTests();
  __resetFeedStateForTests();
});

test('txproxy allowlist permits Oracle fulfillRequest and queueAutomationRequest', async () => {
  assert.equal(
    allowlistAllows('0x017520f068fd602082fe5572596185e62a4ad991', 'fulfillRequest'),
    true,
  );
  assert.equal(
    allowlistAllows('0x017520f068fd602082fe5572596185e62a4ad991', 'queueAutomationRequest'),
    true,
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
  assert.ok(body.pairs.includes('NEO-USD'));
  assert.ok(body.pairs.includes('PAXG-USD'));
  assert.ok(body.pairs.includes('WTI-USD'));
  assert.ok(body.pairs.includes('AAPL-USD'));
  assert.ok(body.pairs.includes('EUR-USD'));
  assert.ok(body.pairs.includes('1000FLM-USD'));
  assert.ok(body.pairs.includes('1000JPY-USD'));
});

test('loadNeoN3Context falls back to MORPHEUS_RELAYER_NEO_N3_WIF', async () => {
  const previousRelayerWif = process.env.MORPHEUS_RELAYER_NEO_N3_WIF;
  const previousRelayerPrivateKey = process.env.MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY;
  const previousWorkerPrivateKey = process.env.PHALA_NEO_N3_PRIVATE_KEY;
  const previousWorkerWif = process.env.PHALA_NEO_N3_WIF;
  const previousNeoN3Wif = process.env.NEO_N3_WIF;
  delete process.env.PHALA_NEO_N3_PRIVATE_KEY;
  delete process.env.PHALA_NEO_N3_WIF;
  delete process.env.MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY;
  delete process.env.NEO_N3_WIF;
  process.env.MORPHEUS_RELAYER_NEO_N3_WIF = 'Kzopomhb6ufUbYigzTjjy7t34AE1k2sNn3suXrRGePVoPRVP6rsn';

  const context = loadNeoN3Context({}, { required: true, requireRpc: false });
  assert.equal(context.account.address, 'NR3E4D8NUXh3zhbf5ZkAp3rTxWbQqNih32');

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

  const res = await handler(new Request('http://local/feeds/price/NEO-USD?provider=twelvedata', { headers: authHeaders() }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.provider, 'twelvedata');
  assert.equal(body.price, '45.67');
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

  const res = await handler(new Request('http://local/feeds/price/AAPL-USD?provider=twelvedata', { headers: authHeaders() }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.pair, 'AAPL-USD');
  assert.equal(body.price, '260.72');
});

test('feed quote uses canonical 1000FLM-USD pair naming', async () => {
  global.fetch = async (url) => {
    assert.match(String(url), /api\.twelvedata\.com\/price/);
    assert.match(String(url), /FLM%2FUSD/);
    return new Response(JSON.stringify({ price: '0.00123' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const res = await handler(new Request('http://local/feeds/price/1000FLM-USD?provider=twelvedata', { headers: authHeaders() }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.pair, '1000FLM-USD');
  assert.equal(body.display_symbol, '1000FLM-USD');
  assert.equal(body.unit_label, '1000 FLM');
  assert.equal(body.raw_price, '0.00123');
  assert.equal(body.price, '1.23');
  assert.equal(body.price_multiplier, 1000);
});

test('feed quote can invert and scale forex units for canonical 1000JPY-USD', async () => {
  global.fetch = async (url) => {
    assert.match(String(url), /api\.twelvedata\.com\/price/);
    assert.match(String(url), /USD%2FJPY/);
    return new Response(JSON.stringify({ price: '150.0000' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const res = await handler(new Request('http://local/feeds/price/1000JPY-USD?provider=twelvedata', { headers: authHeaders() }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.pair, '1000JPY-USD');
  assert.equal(body.display_symbol, '1000JPY-USD');
  assert.equal(body.unit_label, '1000 JPY');
  assert.equal(body.raw_price, '150.0000');
  assert.equal(body.price_transform, 'inverse');
  assert.equal(body.price_multiplier, 1000);
  assert.equal(body.price, '6.666666666667');
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

  const res = await handler(new Request('http://local/feeds/price/COPPER-USD?provider=twelvedata', { headers: authHeaders() }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.pair, 'COPPER-USD');
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

  const res = await handler(new Request('http://local/feeds/price/NEO-USD?provider=coinbase-spot', { headers: authHeaders() }));
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

  const res = await handler(new Request('http://local/feeds/price/NEO-USD?provider=binance-spot', { headers: authHeaders() }));
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

  const res = await handler(new Request('http://local/feeds/price/NEO-USD', { headers: authHeaders() }));
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

  const res = await handler(new Request('http://local/oracle/query', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ provider: 'twelvedata', symbol: 'NEO-USD', target_chain: 'neo_n3' }),
  }));
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

  const res = await handler(new Request('http://local/oracle/query', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ provider: 'twelvedata', symbol: 'NEO-USD', target_chain: 'neo_n3' }),
  }));
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
  const res = await handler(new Request('http://local/oracle/public-key', { headers: authHeaders() }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.algorithm, TEST_ORACLE_ENCRYPTION_ALGORITHM);
  assert.ok(body.public_key);
  assert.equal(body.public_key_format, 'raw');
  assert.equal(body.recommended_payload_encryption, TEST_ORACLE_ENCRYPTION_ALGORITHM);
  assert.ok(Array.isArray(body.supported_payload_encryption));
  assert.deepEqual(body.supported_payload_encryption, [TEST_ORACLE_ENCRYPTION_ALGORITHM]);
});

test('oracle public key can be stabilized with a dstack-sealed keystore', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'morpheus-oracle-key-'));
  const keystorePath = path.join(tempDir, 'oracle-key.json');
  process.env.PHALA_USE_DERIVED_KEYS = 'true';
  process.env.PHALA_ORACLE_KEYSTORE_PATH = keystorePath;

  __setDstackClientFactoryForTests(async () => ({
    isReachable: async () => true,
    getKey: async () => ({ key: Uint8Array.from(Buffer.from('11'.repeat(32), 'hex')) }),
    info: async () => ({ app_id: 'app', instance_id: 'inst', compose_hash: 'compose', app_name: 'Morpheus', device_id: 'device', key_provider_info: 'mock', tcb_info: null }),
    getQuote: async () => ({ quote: '0x01', event_log: '[]', report_data: '0x02' }),
  }));

  __resetOracleKeyMaterialForTests();
  const first = await handler(new Request('http://local/oracle/public-key', { headers: authHeaders() }));
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.match(firstBody.key_source, /dstack-sealed/);
  assert.ok(firstBody.public_key);

  __resetOracleKeyMaterialForTests();
  const second = await handler(new Request('http://local/oracle/public-key', { headers: authHeaders() }));
  assert.equal(second.status, 200);
  const secondBody = await second.json();
  assert.equal(secondBody.public_key, firstBody.public_key);
  assert.match(secondBody.key_source, /dstack-sealed/);
});

test('oracle query supports plain fetch mode', async () => {
  global.fetch = async (url) => {
    assert.equal(url, 'https://api.example.com/plain');
    return new Response(JSON.stringify({ ok: true, value: 7 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const res = await handler(new Request('http://local/oracle/query', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ url: 'https://api.example.com/plain', target_chain: 'neo_n3' }),
  }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.mode, 'fetch');
  assert.equal(body.status_code, 200);
  assert.match(body.body, /"ok":true/);
});

test('oracle smart fetch supports encrypted_payload alias and script_base64', async () => {
  const keyRes = await handler(new Request('http://local/oracle/public-key', { headers: authHeaders() }));
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

  const res = await handler(new Request('http://local/oracle/smart-fetch', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      url: 'https://api.example.com/private',
      encrypted_payload: ciphertext,
      script_base64: Buffer.from('function process(data) { return data.age > 80; }').toString('base64'),
      target_chain: 'neo_x',
      target_chain_id: '12227332'
    }),
  }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.mode, 'fetch+compute');
  assert.equal(body.result, true);
  assert.equal(body.target_chain, 'neo_x');
  assert.equal(body.target_chain_id, '12227332');
});

test('oracle smart fetch supports encrypted JSON payload patches', async () => {
  const keyRes = await handler(new Request('http://local/oracle/public-key', { headers: authHeaders() }));
  const keyBody = await keyRes.json();
  const ciphertext = await encryptForOracle(keyBody.public_key, JSON.stringify({
    headers: { 'x-api-key': 'sealed-secret' },
    script: 'function process(data) { return data.age > 80; }',
  }));

  global.fetch = async (url, init) => {
    assert.equal(url, 'https://api.example.com/private-patch');
    assert.equal(init.headers.get('x-api-key'), 'sealed-secret');
    assert.equal(init.headers.has('Authorization'), false);
    return new Response(JSON.stringify({ ok: true, age: 83 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const res = await handler(new Request('http://local/oracle/smart-fetch', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      url: 'https://api.example.com/private-patch',
      encrypted_payload: ciphertext,
      target_chain: 'neo_n3',
    }),
  }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.mode, 'fetch+compute');
  assert.equal(body.result, true);
  assert.equal(body.target_chain, 'neo_n3');
});

test('compute execute supports builtin heavy functions', async () => {
  const res = await handler(new Request('http://local/compute/execute', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      mode: 'builtin',
      function: 'math.modexp',
      input: { base: '2', exponent: '10', modulus: '17' },
      target_chain: 'neo_n3'
    }),
  }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.mode, 'builtin');
  assert.equal(body.function, 'math.modexp');
  assert.equal(body.result.value, '4');
  assert.ok(body.signature);
});

test('compute execute supports encrypted confidential payload patches', async () => {
  const keyRes = await handler(new Request('http://local/oracle/public-key', { headers: authHeaders() }));
  const keyBody = await keyRes.json();
  const ciphertext = await encryptForOracle(keyBody.public_key, JSON.stringify({
    mode: 'builtin',
    function: 'math.modexp',
    input: { base: '2', exponent: '10', modulus: '17' },
    target_chain: 'neo_x',
    target_chain_id: '12227332',
  }));

  const res = await handler(new Request('http://local/compute/execute', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ encrypted_payload: ciphertext }),
  }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.mode, 'builtin');
  assert.equal(body.function, 'math.modexp');
  assert.equal(body.result.value, '4');
  assert.equal(body.target_chain, 'neo_x');
  assert.equal(body.target_chain_id, '12227332');
});

test('compute execute supports X25519 encrypted payloads larger than raw RSA limits', async () => {
  const keyRes = await handler(new Request('http://local/oracle/public-key', { headers: authHeaders() }));
  const keyBody = await keyRes.json();
  const ciphertext = await encryptForOracle(keyBody.public_key, JSON.stringify({
    mode: 'builtin',
    function: 'hash.sha256',
    input: {
      message: 'neo-morpheus',
      note: 'x'.repeat(2048),
    },
    target_chain: 'neo_n3',
  }));

  const res = await handler(new Request('http://local/compute/execute', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ encrypted_input: ciphertext }),
  }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.mode, 'builtin');
  assert.equal(body.function, 'hash.sha256');
  assert.ok(body.result.digest);
});

test('compute execute supports wasm runtime', async () => {
  const res = await handler(new Request('http://local/compute/execute', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      wasm_base64: TEST_WASM_OK_BASE64,
      target_chain: 'neo_x',
    }),
  }));
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

  const rsaRes = await handler(new Request('http://local/compute/execute', {
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
  }));
  assert.equal(rsaRes.status, 200);
  const rsaBody = await rsaRes.json();
  assert.equal(rsaBody.result.is_valid, true);

  const polynomialRes = await handler(new Request('http://local/compute/execute', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      mode: 'builtin',
      function: 'math.polynomial',
      input: { coefficients: [2, 3], x: 5 },
      target_chain: 'neo_n3',
    }),
  }));
  assert.equal(polynomialRes.status, 200);
  const polynomialBody = await polynomialRes.json();
  assert.equal(polynomialBody.result.value, '13');
});

test('oracle smart fetch enforces script timeout', async () => {
  global.fetch = async () => new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

  const res = await handler(new Request('http://local/oracle/smart-fetch', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      url: 'https://api.example.com/slow-script',
      script: 'function process(data) { while (true) {} }',
      script_timeout_ms: 50,
      target_chain: 'neo_n3'
    }),
  }));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /timed out/);
});

test('oracle smart fetch supports wasm runtime', async () => {
  global.fetch = async () => new Response(JSON.stringify({ ok: true, price: '1.23' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

  const res = await handler(new Request('http://local/oracle/smart-fetch', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      url: 'https://api.example.com/wasm',
      wasm_base64: TEST_WASM_OK_BASE64,
      target_chain: 'neo_n3'
    }),
  }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.mode, 'fetch+compute');
  assert.equal(body.result, true);
});

test('oracle fetch enforces upstream timeout', async () => {
  global.fetch = async (_url, init) => await new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('aborted')));
  });

  const res = await handler(new Request('http://local/oracle/query', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      url: 'https://api.example.com/hanging',
      oracle_timeout_ms: 50,
      target_chain: 'neo_n3'
    }),
  }));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /timed out/);
});

test('compute script enforces timeout', async () => {
  const res = await handler(new Request('http://local/compute/execute', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      mode: 'script',
      script: 'function process(input) { while (true) {} }',
      script_timeout_ms: 50,
      target_chain: 'neo_n3'
    }),
  }));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /timed out/);
});

test('compute wasm enforces timeout', async () => {
  const res = await handler(new Request('http://local/compute/execute', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      wasm_base64: TEST_WASM_LOOP_BASE64,
      wasm_timeout_ms: 50,
      target_chain: 'neo_n3'
    }),
  }));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /timed out/);
});

test('compute script rejects invalid entry point identifiers', async () => {
  const res = await handler(new Request('http://local/compute/execute', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      mode: 'script',
      script: 'function safe(input) { return input; }',
      entry_point: 'safe();evil',
      target_chain: 'neo_n3'
    }),
  }));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /valid identifier/);
});

test('compute script blocks constructor escape patterns', async () => {
  const res = await handler(new Request('http://local/compute/execute', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      mode: 'script',
      script: 'function process(input) { return this.constructor.constructor(\"return 1\")(); }',
      target_chain: 'neo_n3'
    }),
  }));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /constructor introspection is not allowed/);
});

test('oracle smart fetch blocks global object access in user script', async () => {
  global.fetch = async () => new Response(JSON.stringify({ ok: true, price: '1.23' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

  const res = await handler(new Request('http://local/oracle/smart-fetch', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      provider: 'twelvedata',
      symbol: 'NEO-USD',
      script: 'function process(data) { return globalThis.process; }',
      target_chain: 'neo_n3'
    }),
  }));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /global object access is not allowed/);
});

test('sign-payload supports neo_n3 and neo_x', async () => {
  global.fetch = originalFetch;

  const neoN3Res = await handler(new Request('http://local/sign/payload', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ target_chain: 'neo_n3', message: 'hello neo n3' }),
  }));
  assert.equal(neoN3Res.status, 200);
  const neoN3 = await neoN3Res.json();
  assert.ok(neoN3.signature);
  assert.ok(neoN3.public_key);
  assert.ok(neoN3.address);

  const neoXRes = await handler(new Request('http://local/sign/payload', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ target_chain: 'neo_x', message: 'hello neo x' }),
  }));
  assert.equal(neoXRes.status, 200);
  const neoX = await neoXRes.json();
  assert.ok(neoX.signature);
  assert.ok(neoX.address);
  assert.equal(neoX.mode, 'message');
});



test('oracle feed supports neo_x contract relay mode', async () => {
  __resetFeedStateForTests();
  process.env.CONTRACT_MORPHEUS_DATAFEED_X_ADDRESS = '0x1111111111111111111111111111111111111111';
  global.fetch = async (url, init) => {
    const value = String(url);
    if (/^https:\/\/api\.twelvedata\.com\//.test(value) && value.includes('NEO%2FUSD')) {
      return new Response(JSON.stringify({ price: '12.34' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (/^https:\/\/api\.twelvedata\.com\//.test(value) && value.includes('GAS%2FUSD')) {
      return new Response(JSON.stringify({ price: '5.67' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const res = await handler(new Request('http://local/oracle/feed', {
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
      max_priority_fee_per_gas: '100000000'
    }),
  }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.target_chain, 'neo_x');
  assert.ok(Array.isArray(body.sync_results));
  assert.equal(body.batch_submitted, true);
  assert.equal(body.batch_count, 2);
  assert.ok(body.batch_tx);
  assert.equal(body.sync_results[0].relay_status, 'submitted');
  assert.equal(body.sync_results[1].relay_status, 'submitted');
  assert.equal(body.sync_results[0].quote.decimals, 2);
  const iface = new Interface([
    'function updateFeeds(string[] pairs,uint256[] roundIds,uint256[] prices,uint256[] timestamps,bytes32[] attestationHashes,uint256[] sourceSetIds)',
  ]);
  const txEnvelope = Transaction.from(body.batch_tx.raw_transaction);
  const decoded = iface.decodeFunctionData('updateFeeds', txEnvelope.data);
  assert.deepEqual(Array.from(decoded[0]), ['TWELVEDATA:NEO-USD', 'TWELVEDATA:GAS-USD']);
  assert.equal(decoded[2][0].toString(), '1234');
  assert.equal(decoded[2][1].toString(), '567');
});

test('oracle feed records scan prices and skips chain tx when all changes stay below threshold', async () => {
  __resetFeedStateForTests();
  process.env.CONTRACT_MORPHEUS_DATAFEED_X_ADDRESS = '0x1111111111111111111111111111111111111111';

  let currentPrice = '12.34';
  global.fetch = async (url) => {
    const value = String(url);
    if (/^https:\/\/api\.twelvedata\.com\//.test(value) && value.includes('NEO%2FUSD')) {
      return new Response(JSON.stringify({ price: currentPrice }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const first = await handler(new Request('http://local/oracle/feed', {
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
      max_priority_fee_per_gas: '100000000'
    }),
  }));
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.equal(firstBody.batch_submitted, true);

  currentPrice = '12.35'; // ~0.081% change from 12.34
  const second = await handler(new Request('http://local/oracle/feed', {
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
      max_priority_fee_per_gas: '100000000'
    }),
  }));
  assert.equal(second.status, 200);
  const secondBody = await second.json();
  assert.equal(secondBody.batch_submitted, false);
  assert.equal(secondBody.batch_count, 0);
  assert.equal(secondBody.batch_tx, null);
  assert.equal(secondBody.sync_results[0].relay_status, 'skipped');
  assert.equal(secondBody.sync_results[0].skip_reason, 'price-change-below-threshold');
  assert.equal(secondBody.sync_results[0].comparison_basis, 'current-chain-price');

  currentPrice = '12.36'; // >0.1% from submitted chain value 12.34, but only ~0.08% from prior scan 12.35
  const third = await handler(new Request('http://local/oracle/feed', {
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
      max_priority_fee_per_gas: '100000000'
    }),
  }));
  assert.equal(third.status, 200);
  const thirdBody = await third.json();
  assert.equal(thirdBody.batch_submitted, true);
  assert.equal(thirdBody.batch_count, 1);
  assert.equal(thirdBody.sync_results[0].relay_status, 'submitted');
});

test('oracle feed compares threshold using quantized on-chain integer cents', async () => {
  __resetFeedStateForTests();
  process.env.CONTRACT_MORPHEUS_DATAFEED_X_ADDRESS = '0x1111111111111111111111111111111111111111';

  let currentPrice = '1.00';
  global.fetch = async (url) => {
    const value = String(url);
    if (/^https:\/\/api\.twelvedata\.com\//.test(value) && value.includes('USDT%2FUSD')) {
      return new Response(JSON.stringify({ price: currentPrice }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const first = await handler(new Request('http://local/oracle/feed', {
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
      max_priority_fee_per_gas: '100000000'
    }),
  }));
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.equal(firstBody.batch_submitted, true);

  currentPrice = '1.009'; // +0.9%, but still 100 cents on-chain after quantization
  const second = await handler(new Request('http://local/oracle/feed', {
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
      max_priority_fee_per_gas: '100000000'
    }),
  }));
  assert.equal(second.status, 200);
  const secondBody = await second.json();
  assert.equal(secondBody.batch_submitted, false);
  assert.equal(secondBody.sync_results[0].skip_reason, 'price-change-below-threshold');
  assert.equal(secondBody.sync_results[0].change_bps, 0);
  assert.equal(secondBody.sync_results[0].comparison_basis, 'current-chain-price');

  currentPrice = '1.01'; // 101 cents, should now publish
  const third = await handler(new Request('http://local/oracle/feed', {
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
      max_priority_fee_per_gas: '100000000'
    }),
  }));
  assert.equal(third.status, 200);
  const thirdBody = await third.json();
  assert.equal(thirdBody.batch_submitted, true);
  assert.equal(thirdBody.batch_count, 1);
  assert.equal(thirdBody.sync_results[0].relay_status, 'submitted');
});

test('relay-transaction signs neo_x tx locally when broadcast is disabled', async () => {
  global.fetch = originalFetch;

  const res = await handler(new Request('http://local/relay/transaction', {
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
        max_priority_fee_per_gas: '100000000'
      }
    }),
  }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.target_chain, 'neo_x');
  assert.ok(body.raw_transaction);
  assert.ok(body.address);
});
