import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_FEED_SYMBOLS } from '../lib/feed-defaults';

const fetchOnchainState = vi.fn(async () => ({
  network: 'testnet',
  generated_at: '2026-06-11T00:00:00.000Z',
  neo_n3: { oracle: null, datafeed: { records: [] }, error: null },
}));

vi.mock('@/lib/onchain-state', () => ({ fetchOnchainState }));
vi.mock('@/lib/config', () => ({
  appConfig: {
    nitroApiUrl: 'https://runtime-a.example',
    nitroApiUrls: ['https://runtime-a.example', 'https://runtime-b.example'],
    nitroToken: '',
    feedProjectSlug: 'morpheus',
  },
}));

describe('feeds status builder', () => {
  beforeEach(async () => {
    const { resetFeedsStatusCache } = await import('../lib/feeds-status');
    resetFeedsStatusCache();
    fetchOnchainState.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('bounds a stalled upstream with the quote timeout instead of hanging', async () => {
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) return;
          if (signal.aborted) {
            reject(signal.reason);
            return;
          }
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    const { buildFeedsStatusBody } = await import('../lib/feeds-status');
    const body = await buildFeedsStatusBody({ quoteTimeoutMs: 25 });

    expect(body.configured).toHaveLength(DEFAULT_FEED_SYMBOLS.length);
    for (const entry of body.configured) {
      expect((entry.live as { error?: string }).error).toBeTruthy();
    }
    // The shared per-pair deadline means the second candidate is not retried
    // with a fresh timeout after the first one stalls out.
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(DEFAULT_FEED_SYMBOLS.length * 2);
  });

  it('fans out live quotes in batches of at most 5 concurrent upstream calls', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchMock = vi.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return new Response(JSON.stringify({ price: '1.23' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { buildFeedsStatusBody } = await import('../lib/feeds-status');
    const body = await buildFeedsStatusBody({ quoteTimeoutMs: 1000 });

    expect(body.configured).toHaveLength(DEFAULT_FEED_SYMBOLS.length);
    expect(fetchMock).toHaveBeenCalledTimes(DEFAULT_FEED_SYMBOLS.length);
    expect(maxInFlight).toBeLessThanOrEqual(5);
  });

  it('serves repeat callers from the short server-side cache', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ price: '1.23' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    const { getFeedsStatusBody } = await import('../lib/feeds-status');
    const first = await getFeedsStatusBody({ quoteTimeoutMs: 1000 });
    const second = await getFeedsStatusBody({ quoteTimeoutMs: 1000 });

    expect(first.cache).toBe('miss');
    expect(second.cache).toBe('hit');
    expect(second.body).toBe(first.body);
    expect(fetchMock).toHaveBeenCalledTimes(DEFAULT_FEED_SYMBOLS.length);
    expect(fetchOnchainState).toHaveBeenCalledTimes(1);
  });
});
