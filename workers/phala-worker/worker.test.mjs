import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const originalFetch = global.fetch;
const originalPhalaToken = process.env.PHALA_SHARED_SECRET;
const originalNeoN3Key = process.env.PHALA_NEO_N3_PRIVATE_KEY;
const originalNeoXKey = process.env.PHALA_NEOX_PRIVATE_KEY;
const originalNeoRpc = process.env.NEO_RPC_URL;
const originalNeoXRpc = process.env.NEOX_RPC_URL;
const originalNeoXRpcAlt = process.env.NEO_X_RPC_URL;
const originalEvmRpc = process.env.EVM_RPC_URL;
const originalTwelveData = process.env.TWELVEDATA_API_KEY;
const originalSupabaseUrl = process.env.SUPABASE_URL;
const originalSupabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const originalUseDerivedKeys = process.env.PHALA_USE_DERIVED_KEYS;
const originalOracleKeystorePath = process.env.PHALA_ORACLE_KEYSTORE_PATH;

process.env.PHALA_SHARED_SECRET = 'worker-test-secret';
process.env.PHALA_NEO_N3_PRIVATE_KEY = '1111111111111111111111111111111111111111111111111111111111111111';
process.env.PHALA_NEOX_PRIVATE_KEY = '0x59c6995e998f97a5a0044976f5d7d28f6af5b8b4f3d8f93f2af6d0a2b03f1abb';
process.env.NEO_RPC_URL = 'https://neo-rpc.test';
process.env.NEOX_RPC_URL = '';
process.env.NEO_X_RPC_URL = '';
process.env.EVM_RPC_URL = '';
process.env.TWELVEDATA_API_KEY = 'test-twelvedata-key';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';

const { default: handler } = await import('./src/worker.js');
const { __setDstackClientFactoryForTests, __resetDstackClientStateForTests } = await import('./src/platform/dstack.js');
const { __resetOracleKeyMaterialForTests } = await import('./src/oracle/crypto.js');

function authHeaders() {
  return {
    authorization: 'Bearer worker-test-secret',
    'content-type': 'application/json',
  };
}

async function encryptForOracle(publicKeyBase64, plaintext) {
  const spki = Buffer.from(publicKeyBase64, 'base64');
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'spki',
    spki,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt'],
  );
  const encrypted = await globalThis.crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    cryptoKey,
    new TextEncoder().encode(plaintext),
  );
  return Buffer.from(encrypted).toString('base64');
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
  process.env.SUPABASE_URL = originalSupabaseUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = originalSupabaseServiceRoleKey;
  process.env.PHALA_USE_DERIVED_KEYS = originalUseDerivedKeys;
  process.env.PHALA_ORACLE_KEYSTORE_PATH = originalOracleKeystorePath;
  __resetDstackClientStateForTests();
  __resetOracleKeyMaterialForTests();
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
  assert.ok(body.pairs.includes('XAU-USD'));
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

test('oracle public key endpoint returns RSA metadata', async () => {
  const res = await handler(new Request('http://local/oracle/public-key', { headers: authHeaders() }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.algorithm, 'RSA-OAEP-SHA256');
  assert.ok(body.public_key);
  assert.ok(body.public_key_pem);
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
  global.fetch = async (url, init) => {
    if (/^https:\/\/api\.twelvedata\.com\//.test(String(url))) {
      return new Response(JSON.stringify({ price: '12.34' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const res = await handler(new Request('http://local/oracle/feed', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      symbol: 'NEO-USD',
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
  assert.equal(body.sync_results[0].relay_status, 'submitted');
  assert.ok(body.sync_results[0].anchored_tx);
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
