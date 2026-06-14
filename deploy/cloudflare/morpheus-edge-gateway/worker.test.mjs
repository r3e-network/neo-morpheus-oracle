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
  assert.deepEqual(
    calls.map((call) => `${call.origin}${call.path}`),
    ['https://feed-origin.test/testnet/oracle/feed']
  );
  assert.equal(calls[0].headers['x-morpheus-network'], 'testnet');
});

// A fetch stub that hangs forever unless its AbortSignal fires (the hung-origin
// failure mode). It resolves to a rejection only when aborted, so the worker's
// AbortSignal.timeout is what frees it — never the stub itself.
function hangingFetch() {
  return (input, init = {}) =>
    new Promise((_resolve, reject) => {
      const signal = init.signal;
      if (signal) {
        if (signal.aborted) {
          reject(signal.reason || new Error('aborted'));
          return;
        }
        signal.addEventListener('abort', () => reject(signal.reason || new Error('aborted')), {
          once: true,
        });
      }
      // No resolve path: the origin "hangs".
    });
}

test('edge gateway fails fast to 503 when a proxied origin hangs (B7)', async () => {
  global.fetch = hangingFetch();
  global.caches = createCaches();

  const startedAt = Date.now();
  const response = await worker.fetch(
    new Request('https://oracle.meshmini.app/testnet/prices'),
    // 1s timeout (clamped floor) keeps the test fast but proves the abort path.
    createEnv({ MORPHEUS_EDGE_ORIGIN_TIMEOUT_MS: '1000' }),
    createCtx()
  );
  const elapsed = Date.now() - startedAt;

  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.error, 'origin_unavailable');
  // Resolved via the timeout, well under Cloudflare's ~30s wall clock.
  assert.ok(elapsed < 5000, `expected fast fail, took ${elapsed}ms`);
});

test('edge gateway runtime status reports "down" fast when origin probes hang (B7)', async () => {
  global.fetch = hangingFetch();
  global.caches = createCaches();

  const startedAt = Date.now();
  const response = await worker.fetch(
    new Request('https://oracle.meshmini.app/testnet/api/runtime/status'),
    createEnv({ MORPHEUS_EDGE_PROBE_TIMEOUT_MS: '1000' }),
    createCtx()
  );
  const elapsed = Date.now() - startedAt;

  // Both probes time out -> snapshot resolves to down (503) instead of stalling.
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.runtime.status, 'down');
  assert.ok(elapsed < 5000, `expected fast fail, took ${elapsed}ms`);
});

// --- A4: rate-limit backend failure fails closed with 503 ---

test('edge gateway fails closed with 503 when the Upstash rate-limit backend 5xxs (A4)', async () => {
  let pipelineCalls = 0;
  global.fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    const target = new URL(request.url);
    // The shared rate-limit helper posts to <upstash>/pipeline; simulate an
    // Upstash outage (5xx) which makes applyUpstashRateLimit throw.
    if (target.pathname.endsWith('/pipeline')) {
      pipelineCalls += 1;
      return jsonResponse(503, { error: 'service unavailable' });
    }
    throw new Error(`origin fetch should not be reached on rate-limit backend failure: ${target}`);
  };
  global.caches = createCaches();

  const response = await worker.fetch(
    // /vrf/random maps to the rate-limited 'vrf' route, is not runtime-auth
    // gated, and turnstile is disabled (no TURNSTILE_WORKER_SECRET).
    new Request('https://oracle.meshmini.app/testnet/vrf/random', { method: 'POST' }),
    createEnv({
      UPSTASH_REDIS_REST_URL: 'https://upstash.test',
      UPSTASH_REDIS_REST_TOKEN: 'upstash-token',
    }),
    createCtx()
  );

  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.error, 'rate_limit_backend_unavailable');
  assert.equal(payload.route, 'vrf');
  assert.equal(pipelineCalls, 1);
});

// --- A3-edge: constant-time trusted-token compare ---

test('edge gateway accepts a valid trusted token and rejects an equal-length mismatch (A3-edge)', async () => {
  const calls = [];
  global.fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    calls.push(new URL(request.url).pathname);
    return jsonResponse(200, { derived: { app_id: 'app-123' } });
  };
  global.caches = createCaches();

  // The configured token; a runtime-auth-gated route exercises the trusted
  // token check (isTrustedAutomationRequest).
  const token = 'edge-runtime-token-1234567890';
  const env = createEnv({ MORPHEUS_EDGE_RUNTIME_TOKEN: token });

  const ok = await worker.fetch(
    new Request('https://oracle.meshmini.app/testnet/runtime/keys/derived', {
      headers: { authorization: `Bearer ${token}` },
    }),
    env,
    createCtx()
  );
  assert.equal(ok.status, 200);
  assert.equal(calls.length, 1);

  // Equal-length-but-different token must be rejected (constant-time compare
  // does not early-accept on length match).
  const wrong = token.slice(0, -1) + (token.endsWith('X') ? 'Y' : 'X');
  assert.equal(wrong.length, token.length);
  const denied = await worker.fetch(
    new Request('https://oracle.meshmini.app/testnet/runtime/keys/derived', {
      headers: { authorization: `Bearer ${wrong}` },
    }),
    env,
    createCtx()
  );
  assert.equal(denied.status, 401);
  assert.deepEqual(await denied.json(), { error: 'unauthorized' });
  // No additional origin fetch happened for the rejected request.
  assert.equal(calls.length, 1);
});

// --- F10-edge: x-morpheus-runtime discriminator + catalog-derived capabilities ---

test('edge gateway runtime status surfaces the origin runtime discriminator and catalog capabilities (F10)', async () => {
  global.fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    const target = new URL(request.url);
    if (target.pathname === '/testnet/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'x-morpheus-runtime': 'tee-box-runtime',
        },
      });
    }
    if (target.pathname === '/testnet/info') {
      return new Response(JSON.stringify({ version: '1.0.0', dstack: { app_id: 'app-123' } }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'x-morpheus-runtime': 'tee-box-runtime',
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
  // Discriminator header travels with the response.
  assert.equal(response.headers.get('x-morpheus-runtime'), 'tee-box-runtime');
  const payload = await response.json();
  assert.equal(payload.runtime.origin, 'tee-box-runtime');
  // Capabilities are derived from the shared catalog (single source of truth).
  assert.equal(payload.runtime.capabilities.catalogVersion, '2026-04-tee-v1');
  assert.equal(payload.runtime.capabilities.teeRequired, true);
  assert.ok(payload.runtime.capabilities.workflowIds.includes('oracle.query'));
  assert.ok(payload.runtime.capabilities.capabilityIds.includes('oracle_query'));
  assert.deepEqual(payload.runtime.capabilities.automationTriggerKinds, ['interval', 'threshold']);
});

test('edge gateway runtime status reports an unknown discriminator when the origin omits the header (F10)', async () => {
  global.fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    const target = new URL(request.url);
    if (target.pathname === '/testnet/health') {
      return jsonResponse(200, { status: 'ok' });
    }
    if (target.pathname === '/testnet/info') {
      return jsonResponse(200, { version: '1.0.0', dstack: { app_id: 'app-123' } });
    }
    return jsonResponse(404, { error: 'not found' });
  };
  global.caches = createCaches();

  const response = await worker.fetch(
    new Request('https://oracle.meshmini.app/testnet/api/runtime/status'),
    createEnv(),
    createCtx()
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-morpheus-runtime'), 'unknown');
  const payload = await response.json();
  assert.equal(payload.runtime.origin, null);
});
