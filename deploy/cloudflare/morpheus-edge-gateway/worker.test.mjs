import test from 'node:test';
import assert from 'node:assert/strict';

import worker from './worker.mjs';

function createEnv(overrides = {}) {
  return {
    MORPHEUS_ORIGIN_URL: 'https://origin.test',
    MORPHEUS_MAINNET_ORIGIN_URL: 'https://origin.test/mainnet',
    MORPHEUS_TESTNET_ORIGIN_URL: 'https://origin.test/testnet',
    MORPHEUS_MAINNET_FEED_ORIGIN_URL: 'https://feed-origin.test/mainnet',
    MORPHEUS_TESTNET_FEED_ORIGIN_URL: 'https://feed-origin.test/testnet',
    MORPHEUS_ORIGIN_TOKEN: 'origin-secret',
    ...overrides,
  };
}

function createCtx() {
  return {
    waitUntil() {},
  };
}

function createCaches() {
  return {
    default: {
      async match() {
        return null;
      },
      async put() {},
    },
  };
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const originalFetch = global.fetch;
const originalCaches = global.caches;

test.afterEach(() => {
  global.fetch = originalFetch;
  global.caches = originalCaches;
});

test('edge gateway serves the public runtime catalog without origin fetch', async () => {
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    throw new Error('origin fetch should not happen for runtime catalog');
  };
  global.caches = createCaches();

  const response = await worker.fetch(
    new Request('https://oracle.meshmini.app/testnet/api/runtime/catalog'),
    createEnv(),
    createCtx()
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.envelope.version, '2026-04-tee-v1');
  assert.equal(
    payload.networks.testnet.morpheus.publicApiUrl,
    'https://oracle.meshmini.app/testnet'
  );
  assert.ok(payload.workflows.some((item) => item.id === 'automation.upkeep'));
  assert.equal(fetchCalls, 0);
});

test('edge gateway serves runtime status from origin health and info probes', async () => {
  const calls = [];
  global.fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    const target = new URL(request.url);
    calls.push({
      path: target.pathname,
      headers: Object.fromEntries(request.headers.entries()),
    });

    if (target.pathname === '/testnet/health') {
      return jsonResponse(200, { status: 'ok' });
    }

    if (target.pathname === '/testnet/info') {
      return jsonResponse(200, {
        version: '1.2.3',
        dstack: {
          app_id: 'app-123',
          compose_hash: 'compose-hash-123',
          client_kind: 'dstack',
        },
      });
    }

    return jsonResponse(404, { error: 'not found', path: target.pathname });
  };
  global.caches = createCaches();

  const response = await worker.fetch(
    new Request('https://oracle.meshmini.app/testnet/api/runtime/status'),
    createEnv(),
    createCtx()
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(
    calls.map((call) => call.path),
    ['/testnet/health', '/testnet/info']
  );
  assert.equal(calls[0].headers.authorization, 'Bearer origin-secret');
  assert.equal(calls[1].headers.authorization, 'Bearer origin-secret');
  assert.equal(payload.catalog.envelope.version, '2026-04-tee-v1');
  assert.equal(payload.catalog.links.catalog, '/api/runtime/catalog');
  assert.equal(payload.runtime.status, 'operational');
  assert.equal(payload.runtime.health.state, 'ok');
  assert.equal(payload.runtime.info.appId, 'app-123');
});

test('edge gateway blocks raw sensitive runtime-origin routes without trusted credentials', async () => {
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    return jsonResponse(200, { derived: { app_id: 'should-not-leak' } });
  };
  global.caches = createCaches();

  for (const path of [
    '/testnet/runtime/keys/derived',
    '/testnet/keys/derived',
    '/testnet/info',
    '/testnet/oracle/query',
    '/testnet/oracle/smart-fetch',
    '/testnet/compute/execute',
    '/testnet/neodid/bind',
  ]) {
    const response = await worker.fetch(
      new Request(`https://oracle.meshmini.app${path}`),
      createEnv(),
      createCtx()
    );
    assert.equal(response.status, 401, path);
    assert.deepEqual(await response.json(), { error: 'unauthorized' });
  }
  assert.equal(fetchCalls, 0);
});

test('edge gateway still allows trusted automation to reach raw runtime-origin routes', async () => {
  const calls = [];
  global.fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    calls.push({
      path: new URL(request.url).pathname,
      headers: Object.fromEntries(request.headers.entries()),
    });
    return jsonResponse(200, { derived: { app_id: 'app-123' } });
  };
  global.caches = createCaches();

  const response = await worker.fetch(
    new Request('https://oracle.meshmini.app/testnet/runtime/keys/derived', {
      headers: { authorization: 'Bearer edge-runtime-token' },
    }),
    createEnv({ MORPHEUS_EDGE_RUNTIME_TOKEN: 'edge-runtime-token' }),
    createCtx()
  );

  assert.equal(response.status, 200);
  assert.deepEqual(
    calls.map((call) => call.path),
    ['/testnet/runtime/keys/derived']
  );
  assert.equal(calls[0].headers.authorization, 'Bearer edge-runtime-token');
});

test('edge gateway routes oracle feed publication to the dedicated DataFeed origin', async () => {
  const calls = [];
  global.fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    const target = new URL(request.url);
    calls.push({
      origin: target.origin,
      path: target.pathname,
      headers: Object.fromEntries(request.headers.entries()),
    });
    return jsonResponse(200, { mode: 'pricefeed' });
  };
  global.caches = createCaches();

  const response = await worker.fetch(
    new Request('https://oracle.meshmini.app/testnet/oracle/feed', {
      method: 'POST',
      body: JSON.stringify({ symbols: ['TWELVEDATA:NEO-USD'] }),
    }),
    createEnv(),
    createCtx()
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-morpheus-route'), 'oracle-feed');
  assert.deepEqual(calls.map((call) => `${call.origin}${call.path}`), [
    'https://feed-origin.test/testnet/oracle/feed',
  ]);
  assert.equal(calls[0].headers['x-morpheus-network'], 'testnet');
});
