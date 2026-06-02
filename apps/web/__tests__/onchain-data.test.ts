import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildN3IndexFeedNotificationUrl } from '../lib/n3index-feed';

/**
 * Unit tests for the hardened FeedUpdated state parser in lib/onchain-data.ts
 * (commit "fix: guard on-chain parsing ..."). The parser is reached through the
 * exported fetchNeoN3Price(pair) function, which:
 *   - fetches a list of FeedUpdated contract notifications,
 *   - finds the entry whose state_json.value[0].value (base64 pair) matches the
 *     requested pair,
 *   - and parses price (index 2) + timestamp (index 3) ONLY when the state array
 *     is well formed (>= 4 entries, truthy [2]/[3], finite numeric values).
 *
 * The recent fix added three guarantees we exercise here:
 *   1. malformed / partial upstream events must yield null instead of throwing,
 *   2. non-finite price/timestamp values must yield null,
 *   3. non-array error bodies (HTML 5xx, error object) must NOT poison the 10s
 *      in-module response cache.
 *
 * Cache state lives at module scope, so every test re-imports the module after
 * vi.resetModules() to start from a clean cache — matching the dynamic-import
 * style used by the sibling route/control-plane tests.
 */

// Base64 of the bare pair symbols (vitest runs in the node env, so the parser
// decodes via Buffer.from(...).toString('utf8')).
const NEO_USD_B64 = Buffer.from('NEO-USD', 'utf8').toString('base64'); // TkVPLVVTRA==
const GAS_USD_B64 = Buffer.from('GAS-USD', 'utf8').toString('base64');

// Mainnet datafeed contract + explorer, fixed at module import time from
// config/networks/mainnet.json — used to assert the contractLink.
const MAINNET_DATAFEED = '0x03013f49c42a14546c8bbe58f9d434c3517fccab';
const MAINNET_EXPLORER = 'https://neotube.io/contract/';

type StateItem = { value: unknown } | null | undefined;

/** Build a single FeedUpdated notification with an arbitrary state array. */
function feedEvent(pairB64: string, stateArray: StateItem[] | unknown) {
  return {
    contract_hash: MAINNET_DATAFEED,
    txid: '0xfeed',
    block_index: 123,
    state_json: { value: stateArray },
  };
}

/** A well-formed NEO-USD event: [pair, roundId, price, timestamp, ...]. */
function validNeoEvent(price: unknown, timestamp: unknown) {
  return feedEvent(NEO_USD_B64, [
    { value: NEO_USD_B64 },
    { value: '42' },
    { value: price },
    { value: timestamp },
  ]);
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stubFetchSequence(responses: Array<() => Response>) {
  const fetchMock = vi.fn();
  responses.forEach((make) => fetchMock.mockImplementationOnce(async () => make()));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function importModule() {
  return import('../lib/onchain-data');
}

describe('fetchNeoN3Price FeedUpdated state parser', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    // Pin the network so contractLink + the upstream URL are deterministic.
    vi.stubEnv('MORPHEUS_NETWORK', 'mainnet');
    vi.stubEnv('NEXT_PUBLIC_MORPHEUS_NETWORK', 'mainnet');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe('happy path', () => {
    it('parses price and timestamp from a well-formed state array', async () => {
      stubFetchSequence([() => jsonResponse([validNeoEvent('2500000', '1700000000')])]);

      const { fetchNeoN3Price } = await importModule();
      const result = await fetchNeoN3Price('NEO-USD');

      expect(result).toEqual({
        // 2_500_000 / 1_000_000 scaled to 6 decimals
        price: '2.500000',
        // upstream seconds promoted to ms
        timestamp: 1_700_000_000_000,
        pair: 'TWELVEDATA:NEO-USD',
        network: 'Neo N3',
        contractLink: `${MAINNET_EXPLORER}${MAINNET_DATAFEED}`,
      });
    });

    it('selects the matching pair among multiple notifications', async () => {
      stubFetchSequence([
        () =>
          jsonResponse([
            validNeoEvent('2500000', '1700000000'),
            feedEvent(GAS_USD_B64, [
              { value: GAS_USD_B64 },
              { value: '7' },
              { value: '3140000' },
              { value: '1700000123' },
            ]),
          ]),
      ]);

      const { fetchNeoN3Price } = await importModule();

      // The GAS-USD entry must win when GAS-USD is requested, not the first row.
      const gas = await fetchNeoN3Price('GAS-USD');
      expect(gas).toMatchObject({ pair: 'TWELVEDATA:GAS-USD', price: '3.140000' });
      expect(gas?.timestamp).toBe(1_700_000_123_000);
    });

    it('accepts the canonical provider-prefixed symbol as input', async () => {
      stubFetchSequence([() => jsonResponse([validNeoEvent('1000000', '1700000000')])]);

      const { fetchNeoN3Price } = await importModule();
      // normalizeFeedSymbol("TWELVEDATA:NEO-USD") === decoded "NEO-USD" normalized.
      const result = await fetchNeoN3Price('TWELVEDATA:NEO-USD');

      expect(result?.price).toBe('1.000000');
      expect(result?.pair).toBe('TWELVEDATA:NEO-USD');
    });

    it('returns null (without throwing) when no notification matches the pair', async () => {
      stubFetchSequence([
        () =>
          jsonResponse([
            feedEvent(GAS_USD_B64, [
              { value: GAS_USD_B64 },
              { value: '7' },
              { value: '3140000' },
              { value: '1700000123' },
            ]),
          ]),
      ]);

      const { fetchNeoN3Price } = await importModule();
      await expect(fetchNeoN3Price('NEO-USD')).resolves.toBeNull();
    });
  });

  describe('malformed state arrays yield null without throwing', () => {
    it('returns null when the matched event has a short state array (< 4 entries)', async () => {
      stubFetchSequence([
        () =>
          jsonResponse([
            feedEvent(NEO_USD_B64, [{ value: NEO_USD_B64 }, { value: '42' }, { value: '2500000' }]),
          ]),
      ]);

      const { fetchNeoN3Price } = await importModule();
      await expect(fetchNeoN3Price('NEO-USD')).resolves.toBeNull();
    });

    it('returns null when state_json.value is not an array', async () => {
      stubFetchSequence([
        () =>
          jsonResponse([
            {
              txid: '0xfeed',
              block_index: 1,
              // Pair lookup uses value[0].value; an object (not array) still
              // exposes a [0]? path of undefined, so this event is simply skipped
              // and parsing must not throw.
              state_json: { value: { 0: { value: NEO_USD_B64 } } },
            },
          ]),
      ]);

      const { fetchNeoN3Price } = await importModule();
      await expect(fetchNeoN3Price('NEO-USD')).resolves.toBeNull();
    });

    it('returns null when the price element exists but its value is non-finite', async () => {
      stubFetchSequence([() => jsonResponse([validNeoEvent('not-a-number', '1700000000')])]);

      const { fetchNeoN3Price } = await importModule();
      await expect(fetchNeoN3Price('NEO-USD')).resolves.toBeNull();
    });

    it('returns null when the timestamp element exists but its value is non-finite', async () => {
      stubFetchSequence([() => jsonResponse([validNeoEvent('2500000', 'NaN-ish')])]);

      const { fetchNeoN3Price } = await importModule();
      await expect(fetchNeoN3Price('NEO-USD')).resolves.toBeNull();
    });

    it('returns null when the price/timestamp element value is missing (undefined => NaN)', async () => {
      // stateArray[2]/[3] are truthy objects so the && guard passes, but Number(undefined)
      // is NaN, exercising the Number.isFinite branch specifically.
      stubFetchSequence([
        () =>
          jsonResponse([
            feedEvent(NEO_USD_B64, [
              { value: NEO_USD_B64 },
              { value: '42' },
              {}, // price item present, .value undefined
              {}, // timestamp item present, .value undefined
            ]),
          ]),
      ]);

      const { fetchNeoN3Price } = await importModule();
      await expect(fetchNeoN3Price('NEO-USD')).resolves.toBeNull();
    });

    it('returns null when the price/timestamp elements are themselves falsy (fails && guard)', async () => {
      // length >= 4 but stateArray[2]/[3] are null, hitting the `stateArray[2] && stateArray[3]`
      // short-circuit before any Number() coercion.
      stubFetchSequence([
        () =>
          jsonResponse([
            feedEvent(NEO_USD_B64, [{ value: NEO_USD_B64 }, { value: '42' }, null, null]),
          ]),
      ]);

      const { fetchNeoN3Price } = await importModule();
      await expect(fetchNeoN3Price('NEO-USD')).resolves.toBeNull();
    });
  });

  describe('top-level response body guards', () => {
    it('returns null when the response body is a non-array error object', async () => {
      stubFetchSequence([() => jsonResponse({ error: 'upstream unavailable' }, 502)]);

      const { fetchNeoN3Price } = await importModule();
      await expect(fetchNeoN3Price('NEO-USD')).resolves.toBeNull();
    });

    it('returns null when the response body is not valid JSON', async () => {
      stubFetchSequence([
        () =>
          new Response('error code: 1027', {
            status: 502,
            headers: { 'content-type': 'text/html' },
          }),
      ]);

      const { fetchNeoN3Price } = await importModule();
      await expect(fetchNeoN3Price('NEO-USD')).resolves.toBeNull();
    });

    it('returns null and does not throw when fetch itself rejects', async () => {
      const fetchMock = vi.fn(async () => {
        throw new Error('socket hang up');
      });
      vi.stubGlobal('fetch', fetchMock);

      const { fetchNeoN3Price } = await importModule();
      await expect(fetchNeoN3Price('NEO-USD')).resolves.toBeNull();
    });
  });

  describe('cache poisoning protection', () => {
    it('does not cache a non-array error body, so a later valid array is still parsed', async () => {
      // First call: non-array error body (must NOT be cached). Second call within
      // the 10s window: a valid array. If the error body had been cached, the
      // second result would wrongly be null and fetch would be called only once.
      const fetchMock = stubFetchSequence([
        () => jsonResponse({ error: 'upstream unavailable' }, 502),
        () => jsonResponse([validNeoEvent('2500000', '1700000000')]),
      ]);

      const { fetchNeoN3Price } = await importModule();

      const first = await fetchNeoN3Price('NEO-USD');
      expect(first).toBeNull();

      const second = await fetchNeoN3Price('NEO-USD');
      expect(second?.price).toBe('2.500000');

      // Re-fetched because the bad body was never cached.
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('caches a valid array body and reuses it within the 10s window (single fetch)', async () => {
      // First call caches the array; the second call for a different pair in the
      // same array must be served from cache without a second network request.
      const fetchMock = stubFetchSequence([
        () =>
          jsonResponse([
            validNeoEvent('2500000', '1700000000'),
            feedEvent(GAS_USD_B64, [
              { value: GAS_USD_B64 },
              { value: '7' },
              { value: '3140000' },
              { value: '1700000123' },
            ]),
          ]),
      ]);

      const { fetchNeoN3Price } = await importModule();

      const neo = await fetchNeoN3Price('NEO-USD');
      const gas = await fetchNeoN3Price('GAS-USD');

      expect(neo?.price).toBe('2.500000');
      expect(gas?.price).toBe('3.140000');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});

describe('on-chain feed event lookup', () => {
  it('avoids the slow n3index contract_hash plus event_name query shape', () => {
    const url = buildN3IndexFeedNotificationUrl('mainnet', '0xfeed', 100);

    expect(url).toContain('network=eq.mainnet');
    expect(url).toContain('event_name=eq.FeedUpdated');
    expect(url).not.toContain('contract_hash=eq.');
  });

  it('supports the higher attestation lookup limit with the same broad n3index query shape', () => {
    const url = buildN3IndexFeedNotificationUrl('mainnet', '0xfeed', 200);

    expect(url).toContain('network=eq.mainnet');
    expect(url).toContain('event_name=eq.FeedUpdated');
    expect(url).toContain('limit=200');
    expect(url).not.toContain('contract_hash=eq.');
  });
});
