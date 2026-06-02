import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('feed price route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv('MORPHEUS_NETWORK', 'mainnet');
    vi.stubEnv('MORPHEUS_RUNTIME_URL', 'https://runtime.example');
    vi.stubEnv('MORPHEUS_FEED_PROVIDER', 'twelvedata');
    vi.stubEnv('MORPHEUS_FEED_PROJECT_SLUG', 'morpheus');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('serves a degraded 200 response when the live quote upstream is temporarily unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'upstream unavailable' }), {
            status: 502,
            headers: { 'content-type': 'application/json' },
          })
      )
    );

    const { GET } = await import('../app/api/feeds/[symbol]/route');
    const response = await GET(new Request('https://example.test/api/feeds/TWELVEDATA%3ANEO-USD'), {
      params: Promise.resolve({ symbol: 'TWELVEDATA:NEO-USD' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('x-morpheus-upstream-status')).toBe('502');
    await expect(response.json()).resolves.toMatchObject({
      status: 'unavailable',
      degraded: true,
      symbol: 'TWELVEDATA:NEO-USD',
      provider: 'twelvedata',
      error: 'feed_quote_unavailable',
      upstream_status: 502,
    });
  });

  it('serves a degraded 200 response when the feed runtime rejects public quote access', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'unauthorized' }), {
            status: 401,
            headers: { 'content-type': 'application/json' },
          })
      )
    );

    const { GET } = await import('../app/api/feeds/[symbol]/route');
    const response = await GET(new Request('https://example.test/api/feeds/TWELVEDATA%3ANEO-USD'), {
      params: Promise.resolve({ symbol: 'TWELVEDATA:NEO-USD' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('x-morpheus-upstream-status')).toBe('401');
    await expect(response.json()).resolves.toMatchObject({
      status: 'unavailable',
      degraded: true,
      symbol: 'TWELVEDATA:NEO-USD',
      provider: 'twelvedata',
      error: 'feed_quote_unavailable',
      upstream_status: 401,
    });
  });
});
