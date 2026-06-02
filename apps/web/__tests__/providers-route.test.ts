import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('providers route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv('MORPHEUS_NETWORK', 'mainnet');
    vi.stubEnv('MORPHEUS_RUNTIME_URL_TESTNET', 'https://testnet-runtime.example');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('forwards request network selection to the runtime proxy', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ providers: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    const { GET } = await import('../app/api/providers/route');
    const response = await GET(new Request('https://example.test/api/providers?network=testnet'));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://testnet-runtime.example/providers',
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('x-morpheus-network')).toBe('testnet');
  });
});
