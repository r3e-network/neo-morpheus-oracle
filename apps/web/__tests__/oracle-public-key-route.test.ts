import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('oracle public key route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv('MORPHEUS_NETWORK', 'testnet');
    vi.stubEnv('MORPHEUS_RUNTIME_URL', 'https://runtime.example');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('serves a degraded 200 response when the runtime rejects public key access', async () => {
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

    const { GET } = await import('../app/api/oracle/public-key/route');
    const response = await GET(new Request('https://example.test/api/oracle/public-key?network=testnet'));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-morpheus-upstream-status')).toBe('401');
    await expect(response.json()).resolves.toMatchObject({
      available: false,
      degraded: true,
      public_key: null,
      key_source: 'unavailable',
      error: 'oracle_public_key_unavailable',
      upstream_status: 401,
    });
  });

  it('uses request network overrides for runtime candidate selection', async () => {
    vi.stubEnv('MORPHEUS_NETWORK', 'mainnet');
    vi.stubEnv('MORPHEUS_RUNTIME_URL_TESTNET', 'https://testnet-runtime.example');
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ public_key: 'pub', key_source: 'testnet-runtime' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    const { GET } = await import('../app/api/oracle/public-key/route');
    const response = await GET(new Request('https://example.test/api/oracle/public-key?network=testnet'));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://testnet-runtime.example/oracle/public-key',
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('x-morpheus-network')).toBe('testnet');
  });
});
