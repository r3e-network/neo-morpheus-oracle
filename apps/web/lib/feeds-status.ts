import { appConfig } from '@/lib/config';
import { DEFAULT_FEED_SYMBOLS, getFeedDescriptor, normalizeFeedSymbol } from '@/lib/feed-defaults';
import { fetchOnchainState } from '@/lib/onchain-state';

const LIVE_QUOTE_TIMEOUT_MS = 10_000;
const LIVE_QUOTE_BATCH_SIZE = 5;
const STATUS_CACHE_TTL_MS = 30_000;

export type FeedsStatusBody = {
  generated_at: string;
  network: string;
  configured_pair_count: number;
  synced_configured_pair_count: number;
  configured: Array<Record<string, unknown>>;
};

export type FeedsStatusOptions = {
  quoteTimeoutMs?: number;
};

let cachedStatus: { body: FeedsStatusBody; expiresAt: number } | null = null;

function maybeParseJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeChainPair(value: string) {
  return normalizeFeedSymbol(value);
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function resolveQuoteCandidates() {
  if (Array.isArray(appConfig.nitroApiUrls) && appConfig.nitroApiUrls.length > 0) {
    return appConfig.nitroApiUrls;
  }
  return appConfig.nitroApiUrl ? [appConfig.nitroApiUrl] : [];
}

async function fetchLiveQuote(pair: string, quoteTimeoutMs: number) {
  const candidates = resolveQuoteCandidates();
  if (candidates.length === 0) {
    return { error: 'MORPHEUS_RUNTIME_URL is not configured' };
  }

  const headers = new Headers({ accept: 'application/json' });
  if (appConfig.nitroToken) {
    headers.set('authorization', `Bearer ${appConfig.nitroToken}`);
    // Emit both header names for backward-compat with the legacy Phala runtime.
    headers.set('x-nitro-token', appConfig.nitroToken);
    headers.set('x-phala-token', appConfig.nitroToken);
  }

  // One shared deadline across all failover candidates so a stalled runtime
  // endpoint cannot hang the route; once aborted, remaining candidates fail
  // immediately instead of compounding the timeout.
  const signal = AbortSignal.timeout(quoteTimeoutMs);
  let lastError: string | null = null;

  for (const baseUrl of candidates) {
    try {
      const quoteUrl = new URL(
        `${baseUrl.replace(/\/$/, '')}/feeds/price/${encodeURIComponent(pair)}`
      );
      if (appConfig.feedProjectSlug) {
        quoteUrl.searchParams.set('project_slug', appConfig.feedProjectSlug);
      }

      const response = await fetch(quoteUrl.toString(), {
        method: 'GET',
        headers,
        cache: 'no-store',
        signal,
      });

      const text = await response.text();
      const body = maybeParseJson(text);
      if (response.ok) {
        return body || { raw: text };
      }
      lastError = body?.error || text || `HTTP ${response.status}`;
      if (!isRetryableStatus(response.status)) {
        break;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (signal.aborted) {
        break;
      }
    }
  }

  return { error: lastError || 'upstream unavailable' };
}

export async function buildFeedsStatusBody(
  options: FeedsStatusOptions = {}
): Promise<FeedsStatusBody> {
  const quoteTimeoutMs = options.quoteTimeoutMs ?? LIVE_QUOTE_TIMEOUT_MS;
  const onchain = await fetchOnchainState(200);
  const chainRecords = Array.isArray(onchain.neo_n3?.datafeed?.records)
    ? onchain.neo_n3.datafeed.records
    : [];

  // Batch the live-quote fan-out so one anonymous request cannot amplify into
  // dozens of simultaneous upstream calls.
  const configured: Array<Record<string, unknown>> = [];
  for (let index = 0; index < DEFAULT_FEED_SYMBOLS.length; index += LIVE_QUOTE_BATCH_SIZE) {
    const batch = DEFAULT_FEED_SYMBOLS.slice(index, index + LIVE_QUOTE_BATCH_SIZE);
    const entries = await Promise.all(
      batch.map(async (pair) => {
        const descriptor = getFeedDescriptor(pair);
        const chainRecord =
          chainRecords.find((entry) => normalizeChainPair(entry.pair) === pair) || null;
        const live = await fetchLiveQuote(pair, quoteTimeoutMs);
        const chainValue = chainRecord?.price_display ? Number(chainRecord.price_display) : null;
        const liveValue = live?.price ? Number(live.price) : null;
        const deltaPct =
          chainValue !== null && liveValue !== null && Number.isFinite(liveValue) && chainValue > 0
            ? ((liveValue - chainValue) / chainValue) * 100
            : null;

        return {
          pair,
          storage_pair: pair,
          synced: Boolean(chainRecord),
          descriptor,
          chain: chainRecord,
          live,
          delta_pct: deltaPct,
        };
      })
    );
    configured.push(...entries);
  }

  return {
    generated_at: new Date().toISOString(),
    network: onchain.network,
    configured_pair_count: DEFAULT_FEED_SYMBOLS.length,
    synced_configured_pair_count: configured.filter((entry) => entry.synced).length,
    configured,
  };
}

export async function getFeedsStatusBody(
  options: FeedsStatusOptions = {}
): Promise<{ body: FeedsStatusBody; cache: 'hit' | 'miss' }> {
  const now = Date.now();
  if (cachedStatus && cachedStatus.expiresAt > now) {
    return { body: cachedStatus.body, cache: 'hit' };
  }
  const body = await buildFeedsStatusBody(options);
  cachedStatus = { body, expiresAt: now + STATUS_CACHE_TTL_MS };
  return { body, cache: 'miss' };
}

export function resetFeedsStatusCache() {
  cachedStatus = null;
}
