import test from 'node:test';
import assert from 'node:assert/strict';

import {
  __resetProviderRuntimeCachesForTests,
  fetchProviderJSON,
  listBuiltinProviders,
} from './providers.js';

const originalFetch = global.fetch;
const originalProviderCacheTtl = process.env.MORPHEUS_PROVIDER_RESPONSE_CACHE_TTL_MS;
const originalProviderRetries = process.env.MORPHEUS_PROVIDER_FETCH_RETRIES;

test.afterEach(() => {
  global.fetch = originalFetch;
  __resetProviderRuntimeCachesForTests();
  if (originalProviderCacheTtl === undefined) {
    delete process.env.MORPHEUS_PROVIDER_RESPONSE_CACHE_TTL_MS;
  } else {
    process.env.MORPHEUS_PROVIDER_RESPONSE_CACHE_TTL_MS = originalProviderCacheTtl;
  }
  if (originalProviderRetries === undefined) {
    delete process.env.MORPHEUS_PROVIDER_FETCH_RETRIES;
  } else {
    process.env.MORPHEUS_PROVIDER_FETCH_RETRIES = originalProviderRetries;
  }
});

test('fetchProviderJSON reuses a short-lived cached GET response for identical provider requests', async () => {
  process.env.MORPHEUS_PROVIDER_RESPONSE_CACHE_TTL_MS = '5000';
  process.env.MORPHEUS_PROVIDER_FETCH_RETRIES = '0';

  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ price: '12.34' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const request = {
    provider: 'twelvedata',
    pair: 'NEO-USD',
    method: 'GET',
    url: 'https://api.twelvedata.com/price?symbol=NEO/USD&apikey=secret-key',
    headers: {},
    auth_mode: 'query',
  };

  const first = await fetchProviderJSON(request, 2500);
  const second = await fetchProviderJSON(request, 2500);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(calls, 1);
  assert.deepEqual(second.data, { price: '12.34' });
});

test('fetchProviderJSON retries transient upstream failures before succeeding', async () => {
  process.env.MORPHEUS_PROVIDER_RESPONSE_CACHE_TTL_MS = '0';
  process.env.MORPHEUS_PROVIDER_FETCH_RETRIES = '2';

  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return new Response(JSON.stringify({ error: 'temporary overload' }), {
        status: 503,
        headers: { 'content-type': 'application/json', 'retry-after': '0' },
      });
    }
    return new Response(JSON.stringify({ price: '42.00' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const result = await fetchProviderJSON(
    {
      provider: 'coinbase-spot',
      pair: 'NEO-USD',
      method: 'GET',
      url: 'https://api.coinbase.com/v2/prices/NEO-USD/spot',
      headers: {},
      auth_mode: 'none',
    },
    2500
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(calls, 2);
  assert.equal(result.data?.price, '42.00');
});

test('builtin provider catalog exposes kernel lane compatibility metadata', () => {
  const providers = listBuiltinProviders();
  assert.ok(Array.isArray(providers));
  assert.ok(providers.length >= 3);
  for (const provider of providers) {
    assert.ok(Array.isArray(provider.supports));
    assert.ok(Array.isArray(provider.kernel_supports));
    assert.ok(provider.kernel_supports.includes('oracle.fetch'));
    assert.ok(provider.kernel_supports.includes('feed.publish'));
  }
});
