import { appConfig } from '@/lib/config';
import {
  DEFAULT_FEED_SYMBOLS,
  getDeprecatedFeedInfo,
  getFeedDescriptor,
  normalizeFeedSymbol,
} from '@/lib/feed-defaults';
import { fetchOnchainState } from '@/lib/onchain-state';
import { recordOperationLog } from '@/lib/operation-logs';

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

async function fetchLiveQuote(pair: string) {
  if (!appConfig.phalaApiUrl) {
    return { error: 'MORPHEUS_RUNTIME_URL is not configured' };
  }

  const headers = new Headers({ accept: 'application/json' });
  if (appConfig.phalaToken) {
    headers.set('authorization', `Bearer ${appConfig.phalaToken}`);
    headers.set('x-phala-token', appConfig.phalaToken);
  }

  const quoteUrl = new URL(
    `${appConfig.phalaApiUrl.replace(/\/$/, '')}/feeds/price/${encodeURIComponent(pair)}`
  );
  if (appConfig.feedProjectSlug) {
    quoteUrl.searchParams.set('project_slug', appConfig.feedProjectSlug);
  }

  const response = await fetch(quoteUrl.toString(), {
    method: 'GET',
    headers,
    cache: 'no-store',
  });

  const text = await response.text();
  const body = maybeParseJson(text);
  if (!response.ok) {
    return {
      error: body?.error || text || `HTTP ${response.status}`,
    };
  }
  return body || { raw: text };
}

export async function GET(request: Request) {
  const onchain = await fetchOnchainState(200);
  const chainRecords = Array.isArray(onchain.neo_n3?.datafeed?.records)
    ? onchain.neo_n3.datafeed.records
    : [];

  const configured = await Promise.all(
    DEFAULT_FEED_SYMBOLS.map(async (pair) => {
      const descriptor = getFeedDescriptor(pair);
      const chainRecord =
        chainRecords.find((entry) => normalizeChainPair(entry.pair) === pair) || null;
      const live = await fetchLiveQuote(pair);
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

  const deprecatedChainRecords = chainRecords
    .map((entry) => {
      const normalized = normalizeChainPair(entry.pair);
      const deprecated = getDeprecatedFeedInfo(entry.pair);
      if (!deprecated) return null;
      return {
        storage_pair: entry.pair,
        pair: normalized,
        replacement: deprecated.replacement,
        reason: deprecated.reason,
        chain: entry,
      };
    })
    .filter(Boolean);

  const body = {
    generated_at: new Date().toISOString(),
    network: onchain.network,
    configured_pair_count: DEFAULT_FEED_SYMBOLS.length,
    synced_configured_pair_count: configured.filter((entry) => entry.synced).length,
    deprecated_chain_record_count: deprecatedChainRecords.length,
    configured,
    deprecated_chain_records: deprecatedChainRecords,
  };

  await recordOperationLog({
    route: '/api/feeds/status',
    method: 'GET',
    category: 'feed',
    requestPayload: Object.fromEntries(new URL(request.url).searchParams.entries()),
    responsePayload: body,
    httpStatus: 200,
  });

  return Response.json(body);
}
