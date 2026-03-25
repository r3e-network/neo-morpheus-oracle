import test from 'node:test';
import assert from 'node:assert/strict';

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

const store = new Map();
const expiry = new Map();

function resetStore() {
  store.clear();
  expiry.clear();
}

function now() {
  return Date.now();
}

function ensureNotExpired(key) {
  const expiresAt = expiry.get(key);
  if (typeof expiresAt === 'number' && expiresAt <= now()) {
    store.delete(key);
    expiry.delete(key);
  }
}

function response(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function installUpstashMock() {
  global.fetch = async (url, init = {}) => {
    const value = String(url);
    if (!value.startsWith('https://mock-upstash.example.com')) {
      throw new Error(`unexpected fetch ${value}`);
    }

    const parsed = new URL(value);
    if (parsed.pathname === '/pipeline') {
      const commands = JSON.parse(String(init.body || '[]'));
      const results = commands.map((entry) => {
        const [op, key, ...args] = entry;
        ensureNotExpired(key);
        switch (String(op).toUpperCase()) {
          case 'INCR': {
            const next = Number(store.get(key) || 0) + 1;
            store.set(key, next);
            return { result: next };
          }
          case 'PTTL': {
            const expiresAt = expiry.get(key);
            return { result: typeof expiresAt === 'number' ? Math.max(expiresAt - now(), 0) : -1 };
          }
          case 'PEXPIRE': {
            expiry.set(key, now() + Number(args[0] || 0));
            return { result: 1 };
          }
          case 'SET': {
            const valueArg = args[0];
            const optionArgs = args.slice(1).map((item) => String(item).toUpperCase());
            const existing = store.has(key);
            if (optionArgs.includes('NX') && existing) return { result: null };
            store.set(key, valueArg);
            const pxIndex = optionArgs.indexOf('PX');
            if (pxIndex >= 0) {
              const ttl = Number(args[pxIndex + 1] || 0);
              expiry.set(key, now() + ttl);
            }
            return { result: 'OK' };
          }
          case 'DEL': {
            const existed = store.delete(key);
            expiry.delete(key);
            return { result: existed ? 1 : 0 };
          }
          default:
            throw new Error(`unsupported op ${op}`);
        }
      });
      return response(results);
    }

    const [, command, ...segments] = parsed.pathname.split('/');
    if (command === 'get') {
      const key = decodeURIComponent(segments.join('/'));
      ensureNotExpired(key);
      return response({ result: store.get(key) ?? null });
    }

    throw new Error(`unsupported path ${parsed.pathname}`);
  };
}

test.beforeEach(() => {
  resetStore();
  process.env = { ...originalEnv };
  delete process.env.MORPHEUS_RUNTIME_CONFIG_JSON;
});

test.after(() => {
  global.fetch = originalFetch;
  process.env = originalEnv;
});

test('applyRequestGuards is a no-op when Upstash guards are disabled', async () => {
  const { applyRequestGuards } = await import('./request-guards.js');
  const result = await applyRequestGuards({
    request: new Request('http://local/paymaster/authorize', {
      method: 'POST',
      headers: { authorization: 'Bearer test' },
      body: JSON.stringify({ operation_hash: '0xabc' }),
    }),
    path: '/paymaster/authorize',
    payload: { operation_hash: '0xabc' },
  });
  assert.equal(result.ok, true);
});

test('applyRequestGuards rate limits repeated paymaster requests via Upstash', async () => {
  installUpstashMock();
  process.env.UPSTASH_REDIS_REST_URL = 'https://mock-upstash.example.com';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
  process.env.MORPHEUS_UPSTASH_GUARDS_ENABLED = 'true';
  process.env.MORPHEUS_RATE_LIMIT_PAYMASTER_AUTHORIZE_MAX = '1';

  const { applyRequestGuards } = await import('./request-guards.js');
  const request = new Request('http://local/paymaster/authorize', {
    method: 'POST',
    headers: {
      authorization: 'Bearer test',
      'cf-connecting-ip': '203.0.113.7',
    },
    body: JSON.stringify({ account_id: '0x1234', dapp_id: 'demo', operation_hash: '0xaaa' }),
  });
  const payload = { account_id: '0x1234', dapp_id: 'demo', operation_hash: '0xaaa' };

  const first = await applyRequestGuards({ request, path: '/paymaster/authorize', payload });
  const second = await applyRequestGuards({
    request,
    path: '/paymaster/authorize',
    payload: { ...payload, operation_hash: '0xbbb' },
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.equal(second.response.status, 429);
});

test('applyRequestGuards bypasses fixed-window rate limiting for trusted service tokens', async () => {
  installUpstashMock();
  process.env.UPSTASH_REDIS_REST_URL = 'https://mock-upstash.example.com';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
  process.env.MORPHEUS_UPSTASH_GUARDS_ENABLED = 'true';
  process.env.PHALA_API_TOKEN = 'trusted-internal-token';
  process.env.MORPHEUS_RATE_LIMIT_PAYMASTER_AUTHORIZE_MAX = '1';

  const { applyRequestGuards } = await import('./request-guards.js');
  const makeRequest = (operationHash) =>
    new Request('http://local/paymaster/authorize', {
      method: 'POST',
      headers: {
        authorization: 'Bearer trusted-internal-token',
        'x-phala-token': 'trusted-internal-token',
        'cf-connecting-ip': '203.0.113.9',
      },
      body: JSON.stringify({ account_id: '0x1234', dapp_id: 'demo', operation_hash: operationHash }),
    });

  const first = await applyRequestGuards({
    request: makeRequest('0xaaa'),
    path: '/paymaster/authorize',
    payload: { account_id: '0x1234', dapp_id: 'demo', operation_hash: '0xaaa' },
  });
  const second = await applyRequestGuards({
    request: makeRequest('0xbbb'),
    path: '/paymaster/authorize',
    payload: { account_id: '0x1234', dapp_id: 'demo', operation_hash: '0xbbb' },
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
});

test('persistGuardResult caches idempotent responses for repeated relay requests', async () => {
  installUpstashMock();
  process.env.UPSTASH_REDIS_REST_URL = 'https://mock-upstash.example.com';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
  process.env.MORPHEUS_UPSTASH_GUARDS_ENABLED = 'true';

  const { applyRequestGuards, persistGuardResult } = await import('./request-guards.js');
  const payload = { operation_hash: '0xfeedbeef', paymaster: { operation_hash: '0xfeedbeef' } };
  const request = new Request('http://local/relay/transaction', {
    method: 'POST',
    headers: {
      authorization: 'Bearer test',
      'cf-connecting-ip': '203.0.113.8',
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const first = await applyRequestGuards({ request, path: '/relay/transaction', payload });
  assert.equal(first.ok, true);
  await persistGuardResult(
    first,
    new Response(JSON.stringify({ ok: true, txid: '0x1234' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  );

  const second = await applyRequestGuards({ request, path: '/relay/transaction', payload });
  assert.equal(second.ok, false);
  assert.equal(second.cached, true);
  assert.equal(second.response.status, 200);
  assert.deepEqual(await second.response.json(), { ok: true, txid: '0x1234' });
});

test('oracle request idempotency differentiates encrypted params and scripts', async () => {
  installUpstashMock();
  process.env.UPSTASH_REDIS_REST_URL = 'https://mock-upstash.example.com';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
  process.env.MORPHEUS_UPSTASH_GUARDS_ENABLED = 'true';

  const { applyRequestGuards } = await import('./request-guards.js');
  const makeRequest = (payload) =>
    new Request('http://local/oracle/query', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test',
        'cf-connecting-ip': '203.0.113.10',
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

  const basePayload = {
    url: 'https://postman-echo.com/get?probe=neo-morpheus',
    target_chain: 'neo_n3',
  };
  const firstPayload = {
    ...basePayload,
    encrypted_params: 'ciphertext-a',
  };
  const secondPayload = {
    ...basePayload,
    encrypted_params: 'ciphertext-b',
  };
  const scriptedPayload = {
    ...basePayload,
    encrypted_params: 'ciphertext-a',
    script: 'function process(data) { return data.args.probe; }',
  };

  const first = await applyRequestGuards({
    request: makeRequest(firstPayload),
    path: '/oracle/query',
    payload: firstPayload,
  });
  const second = await applyRequestGuards({
    request: makeRequest(secondPayload),
    path: '/oracle/query',
    payload: secondPayload,
  });
  const third = await applyRequestGuards({
    request: makeRequest(scriptedPayload),
    path: '/oracle/query',
    payload: scriptedPayload,
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(third.ok, true);
  assert.notEqual(first.idempotency.lockKey, second.idempotency.lockKey);
  assert.notEqual(first.idempotency.lockKey, third.idempotency.lockKey);
});
