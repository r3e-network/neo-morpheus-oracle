import fs from 'node:fs/promises';
import path from 'node:path';
import { Interface } from 'ethers';
import { env, json, parseDurationMs, strip0x, trimString } from '../platform/core.js';
import { maybeBuildDstackAttestation } from '../platform/dstack.js';
import {
  buildSignedResultEnvelope,
  buildVerificationEnvelope,
  isConfiguredHash160,
  loadNeoN3Context,
  normalizeNeoHash160,
  relayNeoN3Invocation,
  relayNeoXTransaction,
} from '../chain/index.js';
import {
  buildProviderRequest,
  fetchProviderJSON,
  inferProviderIdFromPairSymbol,
  resolveProviderPayload,
} from './providers.js';
import {
  applyFeedProviderDefaults,
  getDefaultFeedSymbols,
  getFeedDisplaySymbol,
  normalizeFeedPairSymbol,
  getFeedProvidersForPair,
  getFeedPriceMultiplier,
  getFeedPriceTransform,
  getFeedStoragePair,
  getFeedUnitLabel,
  getSourceSetIdForProvider,
} from './feed-registry.js';
const DEFAULT_FEED_STATE_PATH = '/data/morpheus-feed-state.json';
const MAINNET_FEED_CHANGE_THRESHOLD_BPS = 10;
const MAINNET_FEED_MIN_UPDATE_INTERVAL_MS = 60_000;
const FEED_PRICE_DECIMALS = 6;
const DATAFEED_X_READ_INTERFACE = new Interface([
  'function getAllFeedRecords() view returns ((string pair,uint256 roundId,uint256 price,uint256 timestamp,bytes32 attestationHash,uint256 sourceSetId)[])',
]);

let feedStateCache;

function resolveSupabaseNetwork() {
  return trimString(env('MORPHEUS_NETWORK', 'NEXT_PUBLIC_MORPHEUS_NETWORK') || 'testnet') ===
    'mainnet'
    ? 'mainnet'
    : 'testnet';
}

function getSupabaseRestConfig() {
  const baseUrl = trimString(
    env('SUPABASE_URL') || env('NEXT_PUBLIC_SUPABASE_URL') || env('morpheus_SUPABASE_URL') || ''
  );
  const apiKey = trimString(
    env('SUPABASE_SECRET_KEY') ||
      env('morpheus_SUPABASE_SECRET_KEY') ||
      env('SUPABASE_SERVICE_ROLE_KEY') ||
      env('morpheus_SUPABASE_SERVICE_ROLE_KEY') ||
      env('SUPABASE_SERVICE_KEY') ||
      ''
  );
  if (!baseUrl || !apiKey) return null;
  return {
    restUrl: `${baseUrl.replace(/\/$/, '')}/rest/v1`,
    apiKey,
  };
}

function isEnabled(rawValue, fallback = true) {
  const normalized = trimString(rawValue).toLowerCase();
  if (!normalized) return fallback;
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

async function fetchLatestFeedSnapshots(limit = 250) {
  const restConfig = getSupabaseRestConfig();
  if (!restConfig) return [];
  const url = new URL(`${restConfig.restUrl}/morpheus_feed_snapshots`);
  url.searchParams.set(
    'select',
    'symbol,target_chain,price,payload,attestation_hash,created_at,network'
  );
  url.searchParams.set('network', `eq.${resolveSupabaseNetwork()}`);
  url.searchParams.set('order', 'created_at.desc');
  url.searchParams.set('limit', String(Math.max(limit, 1)));
  const response = await fetch(url.toString(), {
    headers: {
      apikey: restConfig.apiKey,
      authorization: `Bearer ${restConfig.apiKey}`,
      accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(
      `supabase morpheus_feed_snapshots GET failed: ${response.status} ${await response.text()}`
    );
  }
  const text = await response.text();
  if (!text) return [];
  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}

async function persistFeedSnapshots(rows) {
  const restConfig = getSupabaseRestConfig();
  if (!restConfig || !Array.isArray(rows) || rows.length === 0) return false;
  const response = await fetch(`${restConfig.restUrl}/morpheus_feed_snapshots`, {
    method: 'POST',
    headers: {
      apikey: restConfig.apiKey,
      authorization: `Bearer ${restConfig.apiKey}`,
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify(rows),
  });
  if (!response.ok) {
    throw new Error(
      `supabase morpheus_feed_snapshots POST failed: ${response.status} ${await response.text()}`
    );
  }
  return true;
}

function applySnapshotRowsToFeedState(state, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return state;
  const seenStoragePairs = new Set();
  for (const row of rows) {
    const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
    const storagePair = trimString(payload.storage_pair || row?.symbol || '');
    if (!storagePair || seenStoragePairs.has(storagePair)) continue;
    seenStoragePairs.add(storagePair);
    state.records[storagePair] = {
      ...(state.records[storagePair] || {}),
      ...payload,
      storage_pair: storagePair,
      pair: trimString(payload.pair || row?.symbol || storagePair),
      price:
        payload.price !== undefined && payload.price !== null && trimString(payload.price) !== ''
          ? payload.price
          : row?.price ?? null,
      attestation_hash: trimString(payload.attestation_hash || row?.attestation_hash || ''),
      snapshot_created_at: trimString(row?.created_at || ''),
    };
  }
  return state;
}

export function __resetFeedStateForTests() {
  feedStateCache = undefined;
}

export async function __loadFeedStateForTests() {
  return loadFeedState();
}

export function __buildFeedSnapshotRowsForTests(targetChain, syncResults, state, batchTx) {
  return buildFeedSnapshotRows(targetChain, syncResults, state, batchTx);
}

export function normalizePairSymbol(rawSymbol) {
  const raw = trimString(rawSymbol).toUpperCase();
  if (!raw) return 'NEO-USD';
  if (raw.includes(':')) {
    return normalizeFeedPairSymbol(raw);
  }
  if (/^[A-Z0-9]+-[A-Z0-9]+$/.test(raw)) {
    const [base, quote] = raw.split('-');
    return normalizeFeedPairSymbol(`${base}-${quote === 'USDT' ? 'USD' : quote}`);
  }
  if (/^[A-Z0-9]+[-/_][A-Z0-9]+$/.test(raw)) {
    const [base, quote] = raw.split(/[-/_]/);
    return normalizeFeedPairSymbol(`${base}-${quote === 'USDT' ? 'USD' : quote}`);
  }
  if (raw.endsWith('USDT')) return normalizeFeedPairSymbol(`${raw.slice(0, -4)}-USD`);
  if (raw.endsWith('USD')) return normalizeFeedPairSymbol(`${raw.slice(0, -3)}-USD`);
  return normalizeFeedPairSymbol(`${raw}-USD`);
}

export function decimalToIntegerString(value, decimals = FEED_PRICE_DECIMALS) {
  const raw = trimString(value);
  if (!raw) throw new Error('decimal value required');
  const sign = raw.startsWith('-') ? -1n : 1n;
  const normalized = raw.replace(/^[+-]/, '');
  if (!/^\d+(\.\d+)?$/.test(normalized)) throw new Error(`invalid decimal value: ${value}`);
  const [wholePart, fractionPart = ''] = normalized.split('.');
  const whole = BigInt(wholePart || '0');
  const fraction = (fractionPart + '0'.repeat(decimals)).slice(0, decimals);
  const fractionValue = BigInt(fraction || '0');
  const scale = 10n ** BigInt(decimals);
  return (whole * scale + fractionValue) * sign + '';
}

export function integerToDecimalString(value, decimals = FEED_PRICE_DECIMALS) {
  const raw = String(value ?? '0');
  const negative = raw.startsWith('-');
  const digits = raw.replace(/^[+-]/, '') || '0';
  const padded = digits.padStart(decimals + 1, '0');
  const whole = padded.slice(0, -decimals) || '0';
  const fraction = padded.slice(-decimals);
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

export function multiplyDecimalString(value, multiplier = 1) {
  const raw = trimString(value);
  const factor = Number(multiplier);
  if (!raw) throw new Error('decimal value required');
  if (!Number.isFinite(factor) || factor <= 0) throw new Error(`invalid multiplier: ${multiplier}`);
  if (factor === 1) return raw;

  const sign = raw.startsWith('-') ? '-' : '';
  const normalized = raw.replace(/^[+-]/, '');
  if (!/^\d+(\.\d+)?$/.test(normalized)) throw new Error(`invalid decimal value: ${value}`);

  const [wholePart, fractionPart = ''] = normalized.split('.');
  const scale = 10n ** BigInt(fractionPart.length);
  const base = BigInt(`${wholePart}${fractionPart}` || '0');
  const scaled = base * BigInt(Math.trunc(factor));
  const digits = scaled.toString().padStart(fractionPart.length + 1, '0');
  const whole = fractionPart.length > 0 ? digits.slice(0, -fractionPart.length) : digits;
  const fraction =
    fractionPart.length > 0 ? digits.slice(-fractionPart.length).replace(/0+$/, '') : '';
  return `${sign}${fraction ? `${whole}.${fraction}` : whole}`;
}

function normalizeDecimalNumberString(value, precision = 12) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error(`invalid numeric value: ${value}`);
  return numeric.toFixed(precision).replace(/\.?0+$/, '');
}

export function transformDecimalString(value, { transform = '', multiplier = 1 } = {}) {
  let numeric = Number(trimString(value));
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(`invalid decimal value: ${value}`);
  }
  if (transform === 'inverse') {
    numeric = 1 / numeric;
  }
  if (Number(multiplier) !== 1) {
    numeric *= Number(multiplier);
  }
  return normalizeDecimalNumberString(numeric);
}

function getFeedStatePath() {
  return trimString(env('MORPHEUS_FEED_STATE_PATH')) || DEFAULT_FEED_STATE_PATH;
}

async function loadFeedState() {
  if (feedStateCache) return feedStateCache;
  try {
    const raw = await fs.readFile(getFeedStatePath(), 'utf8');
    feedStateCache = JSON.parse(raw);
  } catch {
    feedStateCache = { records: {} };
  }
  if (!feedStateCache.records || typeof feedStateCache.records !== 'object') {
    feedStateCache.records = {};
  }
  if (
    isEnabled(env('MORPHEUS_FEED_BOOTSTRAP_SUPABASE_ENABLED'), true) &&
    Object.keys(feedStateCache.records).length === 0
  ) {
    try {
      const rows = await fetchLatestFeedSnapshots();
      feedStateCache = applySnapshotRowsToFeedState(feedStateCache, rows);
    } catch {
      // keep pricefeed startup independent from Supabase health
    }
  }
  return feedStateCache;
}

async function saveFeedState(state) {
  feedStateCache = state;
  try {
    await fs.mkdir(path.dirname(getFeedStatePath()), { recursive: true });
    await fs.writeFile(getFeedStatePath(), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  } catch {
    // best effort only; feed sync still works without persistence
  }
}

function buildFeedSnapshotRows(targetChain, syncResults, state, batchTx) {
  const network = resolveSupabaseNetwork();
  const rows = [];
  for (const result of Array.isArray(syncResults) ? syncResults : []) {
    const storagePair = trimString(result?.storage_pair || '');
    const record = storagePair ? state.records?.[storagePair] || {} : {};
    const quote = result?.quote && typeof result.quote === 'object' ? result.quote : null;
    const price = record?.price ?? record?.last_observed_price ?? quote?.price ?? null;
    rows.push({
      network,
      symbol: storagePair || trimString(result?.pair || ''),
      target_chain: targetChain,
      price,
      attestation_hash: trimString(record?.attestation_hash || quote?.attestation_hash || ''),
      payload: {
        ...(record && typeof record === 'object' ? record : {}),
        relay_status: result?.relay_status || null,
        skip_reason: result?.skip_reason || null,
        change_bps: result?.change_bps ?? null,
        comparison_basis: result?.comparison_basis ?? null,
        anchored_tx: result?.anchored_tx ?? batchTx ?? null,
      },
    });
  }
  return rows.filter((entry) => trimString(entry.symbol));
}

function parseProviderList(value, fallback = []) {
  if (Array.isArray(value)) {
    return value.map((entry) => trimString(entry).toLowerCase()).filter(Boolean);
  }
  const raw = trimString(value);
  if (!raw) return fallback;
  return raw
    .split(',')
    .map((entry) => trimString(entry).toLowerCase())
    .filter(Boolean);
}

function resolveRequestedProviders(symbol, options = {}) {
  const inferredProvider = trimString(inferProviderIdFromPairSymbol(symbol)).toLowerCase();
  if (inferredProvider) return [inferredProvider];

  const explicitProviders = parseProviderList(options.providers || options.provider_list);
  if (explicitProviders.length > 0) return explicitProviders;

  const explicitProvider = trimString(options.provider || options.source || '').toLowerCase();
  if (explicitProvider && explicitProvider !== 'all') return [explicitProvider];

  const configured = parseProviderList(env('MORPHEUS_FEED_PROVIDERS'), []);
  const available = getFeedProvidersForPair(symbol);
  if (configured.length > 0) {
    return configured.filter((provider) => available.length === 0 || available.includes(provider));
  }
  return available.length > 0 ? available : ['twelvedata'];
}

function extractQuotePrice(response) {
  return (
    response.data?.price ??
    response.data?.value ??
    response.data?.close ??
    response.data?.data?.amount ??
    null
  );
}

function buildSyncPolicy(targetChain, payload = {}) {
  const thresholdCandidate =
    payload.feed_change_threshold_bps ?? env('MORPHEUS_FEED_CHANGE_THRESHOLD_BPS');
  const intervalCandidate =
    payload.feed_min_update_interval_ms ?? env('MORPHEUS_FEED_MIN_UPDATE_INTERVAL_MS');
  const thresholdSource =
    thresholdCandidate === '' || thresholdCandidate === undefined || thresholdCandidate === null
      ? `${MAINNET_FEED_CHANGE_THRESHOLD_BPS}`
      : thresholdCandidate;
  const intervalSource =
    intervalCandidate === '' || intervalCandidate === undefined || intervalCandidate === null
      ? `${MAINNET_FEED_MIN_UPDATE_INTERVAL_MS}ms`
      : intervalCandidate;
  const thresholdBps = Number(thresholdSource || 0);
  const minUpdateIntervalMs = parseDurationMs(intervalSource, MAINNET_FEED_MIN_UPDATE_INTERVAL_MS);
  return {
    thresholdBps: Math.max(Number.isFinite(thresholdBps) ? thresholdBps : 0, 0),
    minUpdateIntervalMs: Math.max(minUpdateIntervalMs, 0),
  };
}

function computeChangeBps(previousPrice, nextPrice) {
  const previous = Number(previousPrice);
  const next = Number(nextPrice);
  if (!Number.isFinite(previous) || !Number.isFinite(next) || previous <= 0)
    return Number.POSITIVE_INFINITY;
  return Math.abs((next - previous) / previous) * 10_000;
}

function isPrintableAscii(value) {
  return /^[\x09\x0a\x0d\x20-\x7e]*$/.test(value);
}

function decodeNeoByteString(bytes) {
  const text = bytes.toString('utf8');
  const reversedText = Buffer.from(bytes).reverse().toString('utf8');
  const knownPairPrefixes = ['TWELVEDATA:', 'BINANCE-SPOT:', 'COINBASE-SPOT:'];
  if (
    isPrintableAscii(reversedText) &&
    knownPairPrefixes.some((prefix) => reversedText.startsWith(prefix))
  ) {
    return reversedText;
  }
  if (isPrintableAscii(text)) return text;
  if (isPrintableAscii(reversedText) && /^[A-Z0-9:_-]+$/.test(reversedText)) {
    return reversedText;
  }
  return `0x${bytes.toString('hex')}`;
}

function parseNeoStackItem(item) {
  if (!item || typeof item !== 'object') return null;
  const type = trimString(item.type).toLowerCase();
  switch (type) {
    case 'array':
    case 'struct':
      return Array.isArray(item.value) ? item.value.map((entry) => parseNeoStackItem(entry)) : [];
    case 'string':
    case 'hash160':
    case 'hash256':
      return String(item.value ?? '');
    case 'integer':
      return String(item.value ?? '0');
    case 'boolean':
      return Boolean(item.value);
    case 'bytestring':
    case 'bytearray': {
      const raw = trimString(item.value);
      if (!raw) return '';
      const bytes = Buffer.from(raw, 'base64');
      const decoded = decodeNeoByteString(bytes);
      if (bytes.length === 20 && typeof decoded === 'string' && decoded.startsWith('0x')) {
        return `0x${Buffer.from(bytes).reverse().toString('hex')}`;
      }
      return decoded;
    }
    default:
      return item.value ?? null;
  }
}

async function fetchJsonRpc(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      trimString(payload?.error?.message) ||
        trimString(payload?.message) ||
        `rpc request failed with status ${response.status}`
    );
  }
  if (payload?.error?.message) {
    throw new Error(payload.error.message);
  }
  return payload?.result;
}

async function fetchNeoN3FeedRecords(rpcUrl, contractHash) {
  if (!trimString(rpcUrl) || !trimString(contractHash)) return {};
  const result = await fetchJsonRpc(rpcUrl, {
    jsonrpc: '2.0',
    id: 1,
    method: 'invokefunction',
    params: [contractHash, 'getAllFeedRecords', []],
  });
  if (String(result?.state || '').toUpperCase() === 'FAULT') {
    throw new Error(trimString(result?.exception) || 'getAllFeedRecords faulted');
  }
  const rawRecords = parseNeoStackItem(result?.stack?.[0]);
  if (!Array.isArray(rawRecords)) return {};
  return Object.fromEntries(
    rawRecords
      .filter((entry) => Array.isArray(entry) && entry.length >= 6)
      .map((entry) => {
        const storagePair = trimString(entry[0]);
        const priceUnits = String(entry[2] ?? '0');
        return [
          storagePair,
          {
            storage_pair: storagePair,
            pair: storagePair.includes(':')
              ? storagePair.split(':').slice(1).join(':')
              : storagePair,
            round_id: String(entry[1] ?? '0'),
            price_units: priceUnits,
            price: integerToDecimalString(priceUnits, FEED_PRICE_DECIMALS),
            timestamp: String(entry[3] ?? '0'),
            attestation_hash: trimString(entry[4]),
            source_set_id: String(entry[5] ?? '0'),
            price_scale_decimals: FEED_PRICE_DECIMALS,
          },
        ];
      })
  );
}

async function fetchNeoXFeedRecords(rpcUrl, contractAddress) {
  if (!trimString(rpcUrl) || !trimString(contractAddress)) return {};
  const callData = DATAFEED_X_READ_INTERFACE.encodeFunctionData('getAllFeedRecords');
  const response = await fetchJsonRpc(rpcUrl, {
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_call',
    params: [{ to: contractAddress, data: callData }, 'latest'],
  });
  const [records] = DATAFEED_X_READ_INTERFACE.decodeFunctionResult('getAllFeedRecords', response);
  return Object.fromEntries(
    Array.from(records || []).map((entry) => {
      const storagePair = String(entry.pair ?? '');
      const priceUnits = entry.price?.toString?.() ?? String(entry.price ?? '0');
      return [
        storagePair,
        {
          storage_pair: storagePair,
          pair: storagePair.includes(':') ? storagePair.split(':').slice(1).join(':') : storagePair,
          round_id: entry.roundId?.toString?.() ?? String(entry.roundId ?? '0'),
          price_units: priceUnits,
          price: integerToDecimalString(priceUnits, FEED_PRICE_DECIMALS),
          timestamp: entry.timestamp?.toString?.() ?? String(entry.timestamp ?? '0'),
          attestation_hash:
            entry.attestationHash?.toString?.() ?? String(entry.attestationHash ?? ''),
          source_set_id: entry.sourceSetId?.toString?.() ?? String(entry.sourceSetId ?? '0'),
          price_scale_decimals: FEED_PRICE_DECIMALS,
        },
      ];
    })
  );
}

async function loadOnchainFeedRecords(
  targetChain,
  { neoContext = null, neoXRpcUrl = null, dataFeedHash = null, dataFeedAddress = null } = {}
) {
  try {
    if (targetChain === 'neo_n3') {
      return await fetchNeoN3FeedRecords(neoContext?.rpcUrl, dataFeedHash);
    }
    if (targetChain === 'neo_x') {
      return await fetchNeoXFeedRecords(
        trimString(neoXRpcUrl) || trimString(env('NEO_X_RPC_URL', 'NEOX_RPC_URL', 'EVM_RPC_URL')),
        dataFeedAddress
      );
    }
  } catch {
    // best effort; local state remains a valid fallback
  }
  return {};
}

function shouldSubmitFeed(storageKey, quote, previousRecord, policy, force = false) {
  if (force) return { allow: true, reason: 'forced' };
  if (!previousRecord) return { allow: true, reason: 'first-observation' };

  const now = Date.now();
  const lastSubmittedAt = Number(previousRecord.last_submitted_at_ms || 0);
  if (
    policy.minUpdateIntervalMs > 0 &&
    lastSubmittedAt > 0 &&
    now - lastSubmittedAt < policy.minUpdateIntervalMs
  ) {
    return { allow: false, reason: 'min-update-interval', storage_key: storageKey };
  }

  const previousPriceUnits = String(
    previousRecord.price_units ??
      previousRecord.price_cents ??
      decimalToIntegerString(previousRecord.price ?? '0', quote.decimals)
  );
  const nextPriceUnits = decimalToIntegerString(quote.price, quote.decimals);
  const changeBps = computeChangeBps(previousPriceUnits, nextPriceUnits);
  if (policy.thresholdBps > 0 && changeBps < policy.thresholdBps) {
    return {
      allow: false,
      reason: 'price-change-below-threshold',
      change_bps: changeBps,
      comparison_basis: 'current-chain-price',
      current_chain_price_units: previousPriceUnits,
      candidate_price_units: nextPriceUnits,
      storage_key: storageKey,
    };
  }

  return {
    allow: true,
    reason: 'threshold-met',
    change_bps: changeBps,
    comparison_basis: 'current-chain-price',
    current_chain_price_units: previousPriceUnits,
    candidate_price_units: nextPriceUnits,
    storage_key: storageKey,
  };
}

async function resolveQuoteForProvider(symbol, options, provider) {
  const providerPayload = applyFeedProviderDefaults(symbol, provider, {
    ...options,
    provider,
    symbol: normalizePairSymbol(symbol),
  });

  const { payload: resolvedPayload } = await resolveProviderPayload(providerPayload, {
    projectSlug: trimString(providerPayload.project_slug || ''),
    fallbackProviderId: provider,
  });
  const providerRequest = buildProviderRequest(resolvedPayload);
  if (!providerRequest) throw new Error('provider request could not be built');
  const response = await fetchProviderJSON(
    providerRequest,
    parseDurationMs(resolvedPayload.oracle_timeout_ms || env('ORACLE_TIMEOUT'), 20_000)
  );
  if (!response.ok) {
    throw new Error(response.provider_error?.message || `${provider} fetch failed`);
  }
  const pair = providerRequest.pair || normalizePairSymbol(symbol);
  const storagePair = getFeedStoragePair(provider, pair);
  const rawPrice = extractQuotePrice(response);
  if (rawPrice === null || rawPrice === undefined || rawPrice === '')
    throw new Error(`${provider} response missing price`);
  const displaySymbol = getFeedDisplaySymbol(storagePair);
  const unitLabel = getFeedUnitLabel(storagePair) || null;
  const priceMultiplier = getFeedPriceMultiplier(storagePair);
  const priceTransform = getFeedPriceTransform(storagePair);
  const price = transformDecimalString(String(rawPrice), {
    transform: priceTransform,
    multiplier: priceMultiplier,
  });

  const quote = {
    feed_id: `${provider}:${pair}`,
    pair: storagePair,
    provider_pair: pair,
    display_symbol: displaySymbol,
    unit_label: unitLabel,
    provider,
    raw_price: String(rawPrice),
    price_transform: priceTransform || null,
    price_multiplier: priceMultiplier,
    price: String(price),
    decimals: FEED_PRICE_DECIMALS,
    price_scale_decimals: FEED_PRICE_DECIMALS,
    timestamp: new Date().toISOString(),
    sources: [provider],
  };
  const signed = await buildSignedResultEnvelope(quote, resolvedPayload);
  const teeAttestation = await maybeBuildDstackAttestation(resolvedPayload, quote);
  return {
    ...quote,
    signature: signed.signature,
    public_key: signed.public_key,
    attestation_hash: signed.attestation_hash,
    tee_attestation: teeAttestation,
    verification: buildVerificationEnvelope(signed, teeAttestation),
  };
}

export async function fetchPriceQuote(symbol, options = {}) {
  const providers = resolveRequestedProviders(symbol, options);
  if (providers.length === 0) throw new Error(`no providers configured for ${symbol}`);
  return resolveQuoteForProvider(symbol, options, providers[0]);
}

export async function fetchPriceQuotes(symbol, options = {}) {
  const providers = resolveRequestedProviders(symbol, options);
  if (providers.length === 0) throw new Error(`no providers configured for ${symbol}`);
  const normalizedPair = normalizePairSymbol(symbol);

  const quotes = [];
  const errors = [];
  for (const provider of providers) {
    try {
      quotes.push(await resolveQuoteForProvider(symbol, options, provider));
    } catch (error) {
      errors.push({ provider, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return {
    pair:
      providers.length === 1 ? getFeedStoragePair(providers[0], normalizedPair) : normalizedPair,
    providers_requested: providers,
    quotes,
    errors,
  };
}

export async function handleFeedsPrice(symbol, options = {}) {
  try {
    const explicitProvider = trimString(options.provider || options.source || '').toLowerCase();
    const inferredProvider = trimString(inferProviderIdFromPairSymbol(symbol)).toLowerCase();
    if ((explicitProvider && explicitProvider !== 'all') || inferredProvider) {
      return json(200, await fetchPriceQuote(symbol, options));
    }
    return json(200, await fetchPriceQuotes(symbol, options));
  } catch (error) {
    return json(502, { error: error instanceof Error ? error.message : String(error) });
  }
}

function buildRoundId(previousRecord) {
  if (!previousRecord?.round_id) return String(Math.floor(Date.now() / 1000));
  return String(Number(previousRecord.round_id) + 1);
}

function buildNeoN3RelaySigningPayload(payload = {}) {
  const signingKey = trimString(
    payload.private_key ||
      payload.signing_key ||
      env('MORPHEUS_UPDATER_NEO_N3_PRIVATE_KEY', 'MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY')
  );
  const wif = trimString(
    payload.wif || env('MORPHEUS_UPDATER_NEO_N3_WIF', 'MORPHEUS_RELAYER_NEO_N3_WIF')
  );
  return {
    ...(signingKey ? { private_key: signingKey } : {}),
    ...(wif ? { wif } : {}),
  };
}

export function __buildNeoN3RelaySigningPayloadForTests(payload = {}) {
  return buildNeoN3RelaySigningPayload(payload);
}

async function submitQuoteToN3(
  dataFeedHash,
  neoContext,
  payload,
  quote,
  storagePair,
  roundId,
  sourceSetId
) {
  const invokeResult = await relayNeoN3Invocation({
    request_id: trimString(payload.request_id) || `pricefeed:${storagePair}:${Date.now()}`,
    contract_hash: dataFeedHash,
    method: 'updateFeed',
    params: [
      { type: 'String', value: storagePair },
      { type: 'Integer', value: roundId },
      { type: 'Integer', value: decimalToIntegerString(quote.price, quote.decimals) },
      { type: 'Integer', value: String(Math.floor(Date.now() / 1000)) },
      { type: 'ByteArray', value: quote.attestation_hash },
      { type: 'Integer', value: String(sourceSetId) },
    ],
    wait: Boolean(payload.wait ?? true),
    rpc_url: neoContext.rpcUrl,
    network_magic: neoContext.networkMagic,
    ...buildNeoN3RelaySigningPayload(payload),
  });
  if (invokeResult.status >= 400) {
    throw new Error(invokeResult.body?.error || 'Neo N3 feed submit failed');
  }
  return invokeResult.body;
}

async function submitQuotesToN3(dataFeedHash, neoContext, payload, updates) {
  const invokeResult = await relayNeoN3Invocation({
    request_id: trimString(payload.request_id) || `pricefeed:batch:${Date.now()}`,
    contract_hash: dataFeedHash,
    method: 'updateFeeds',
    params: [
      {
        type: 'Array',
        value: updates.map((entry) => ({ type: 'String', value: entry.storagePair })),
      },
      { type: 'Array', value: updates.map((entry) => ({ type: 'Integer', value: entry.roundId })) },
      {
        type: 'Array',
        value: updates.map((entry) => ({
          type: 'Integer',
          value: decimalToIntegerString(entry.quote.price, entry.quote.decimals),
        })),
      },
      {
        type: 'Array',
        value: updates.map((entry) => ({ type: 'Integer', value: String(entry.timestampSec) })),
      },
      {
        type: 'Array',
        value: updates.map((entry) => ({ type: 'ByteArray', value: entry.quote.attestation_hash })),
      },
      {
        type: 'Array',
        value: updates.map((entry) => ({ type: 'Integer', value: String(entry.sourceSetId) })),
      },
    ],
    wait: Boolean(payload.wait ?? true),
    rpc_url: neoContext.rpcUrl,
    network_magic: neoContext.networkMagic,
    ...buildNeoN3RelaySigningPayload(payload),
  });
  if (invokeResult.status >= 400) {
    throw new Error(invokeResult.body?.error || 'Neo N3 batch feed submit failed');
  }
  return invokeResult.body;
}

function isMissingNeoN3BatchUpdateMethod(error) {
  const message = trimString(error instanceof Error ? error.message : String(error)).toLowerCase();
  return message.includes('method not found: updatefeeds/6');
}

async function submitQuotesToN3WithFallback(dataFeedHash, neoContext, payload, updates) {
  try {
    return await submitQuotesToN3(dataFeedHash, neoContext, payload, updates);
  } catch (error) {
    if (!isMissingNeoN3BatchUpdateMethod(error)) {
      throw error;
    }

    const txs = [];
    for (const entry of updates) {
      const tx = await submitQuoteToN3(
        dataFeedHash,
        neoContext,
        payload,
        entry.quote,
        entry.storagePair,
        entry.roundId,
        entry.sourceSetId
      );
      txs.push({
        storage_pair: entry.storagePair,
        tx,
      });
    }

    return {
      mode: 'single_fallback',
      reason: 'neo_n3_updatefeeds_missing',
      txs,
    };
  }
}

async function submitQuoteToNeoX(
  dataFeedAddress,
  payload,
  quote,
  storagePair,
  roundId,
  sourceSetId
) {
  const feedInterface = new Interface([
    'function updateFeed(string pair,uint256 roundId,uint256 price,uint256 timestamp,bytes32 attestationHash,uint256 sourceSetId)',
  ]);
  const data = feedInterface.encodeFunctionData('updateFeed', [
    storagePair,
    BigInt(roundId),
    BigInt(decimalToIntegerString(quote.price, quote.decimals)),
    BigInt(Math.floor(Date.now() / 1000)),
    `0x${strip0x(quote.attestation_hash || '0')}`.padEnd(66, '0'),
    BigInt(sourceSetId),
  ]);
  const updaterPrivateKey = trimString(
    payload.private_key || env('MORPHEUS_RELAYER_NEOX_PRIVATE_KEY', 'PHALA_NEOX_PRIVATE_KEY')
  );
  return relayNeoXTransaction({
    ...payload,
    target_chain: 'neo_x',
    private_key: updaterPrivateKey || undefined,
    use_derived_keys: payload.use_derived_keys ?? false,
    to: dataFeedAddress,
    data,
    value: '0',
    wait: Boolean(payload.wait ?? true),
  });
}

async function submitQuotesToNeoX(dataFeedAddress, payload, updates) {
  const feedInterface = new Interface([
    'function updateFeeds(string[] pairs,uint256[] roundIds,uint256[] prices,uint256[] timestamps,bytes32[] attestationHashes,uint256[] sourceSetIds)',
  ]);
  const data = feedInterface.encodeFunctionData('updateFeeds', [
    updates.map((entry) => entry.storagePair),
    updates.map((entry) => BigInt(entry.roundId)),
    updates.map((entry) => BigInt(decimalToIntegerString(entry.quote.price, entry.quote.decimals))),
    updates.map((entry) => BigInt(entry.timestampSec)),
    updates.map((entry) => `0x${strip0x(entry.quote.attestation_hash || '0')}`.padEnd(66, '0')),
    updates.map((entry) => BigInt(entry.sourceSetId)),
  ]);
  const updaterPrivateKey = trimString(
    payload.private_key || env('MORPHEUS_RELAYER_NEOX_PRIVATE_KEY', 'PHALA_NEOX_PRIVATE_KEY')
  );
  return relayNeoXTransaction({
    ...payload,
    target_chain: 'neo_x',
    private_key: updaterPrivateKey || undefined,
    use_derived_keys: payload.use_derived_keys ?? false,
    to: dataFeedAddress,
    data,
    value: '0',
    wait: Boolean(payload.wait ?? true),
  });
}

function resolveRequestedSymbols(payload = {}) {
  const explicitSymbols = Array.isArray(payload.symbols)
    ? payload.symbols
    : parseProviderList(payload.symbols || payload.symbol_list || '', []);
  if (Array.isArray(explicitSymbols) && explicitSymbols.length > 0) {
    return explicitSymbols.map((symbol) => normalizePairSymbol(symbol));
  }
  if (trimString(payload.symbol)) return [normalizePairSymbol(payload.symbol)];
  return getDefaultFeedSymbols().map((symbol) => normalizePairSymbol(symbol));
}

export async function handleOracleFeed(payload) {
  const targetChain = trimString(payload.target_chain || 'neo_n3').toLowerCase() || 'neo_n3';
  const symbols = resolveRequestedSymbols(payload);

  const policy = buildSyncPolicy(targetChain, payload);
  const state = await loadFeedState();
  const syncResults = [];
  const batchUpdates = [];
  const errors = [];

  const dataFeedHash =
    targetChain === 'neo_n3'
      ? normalizeNeoHash160(env('CONTRACT_MORPHEUS_DATAFEED_HASH', 'CONTRACT_PRICEFEED_HASH'))
      : null;
  const neoContext =
    targetChain === 'neo_n3'
      ? loadNeoN3Context(payload, { required: false, requireRpc: false })
      : null;
  const dataFeedAddress =
    targetChain === 'neo_x' ? trimString(env('CONTRACT_MORPHEUS_DATAFEED_X_ADDRESS')) : null;
  const onchainRecords = await loadOnchainFeedRecords(targetChain, {
    neoContext,
    neoXRpcUrl: trimString(payload.rpc_url),
    dataFeedHash,
    dataFeedAddress,
  });

  for (const symbol of symbols) {
    const quoteSet = await fetchPriceQuotes(symbol, payload);
    if (quoteSet.quotes.length === 0) {
      errors.push({
        symbol,
        providers_requested: quoteSet.providers_requested,
        errors: quoteSet.errors,
      });
      continue;
    }
    for (const quote of quoteSet.quotes) {
      const storagePair = getFeedStoragePair(quote.provider, quote.pair);
      const previousRecord = {
        ...(state.records[storagePair] || {}),
        ...(onchainRecords[storagePair] || {}),
      };
      const hasPreviousRecord = Object.keys(previousRecord).length > 0;
      const decision = shouldSubmitFeed(
        storagePair,
        quote,
        hasPreviousRecord ? previousRecord : null,
        policy,
        Boolean(payload.force)
      );
      const roundId =
        trimString(payload.round_id) || buildRoundId(hasPreviousRecord ? previousRecord : null);
      const sourceSetId = Number(
        payload.source_set_id ?? getSourceSetIdForProvider(quote.provider, 0)
      );
      const timestampSec = Math.floor(Date.now() / 1000);
      const observedAtMs = Date.now();

      if (!decision.allow) {
        state.records[storagePair] = {
          ...(hasPreviousRecord ? previousRecord : {}),
          provider: quote.provider,
          pair: quote.pair,
          storage_pair: storagePair,
          last_observed_price: quote.price,
          last_observed_price_units: decimalToIntegerString(quote.price, quote.decimals),
          last_observed_at_ms: observedAtMs,
          price_scale_decimals: FEED_PRICE_DECIMALS,
        };
        syncResults.push({
          provider: quote.provider,
          pair: quote.pair,
          storage_pair: storagePair,
          relay_status: 'skipped',
          skip_reason: decision.reason,
          change_bps: decision.change_bps ?? null,
          comparison_basis: decision.comparison_basis ?? null,
          quote,
        });
        continue;
      }

      batchUpdates.push({
        quote,
        storagePair,
        roundId,
        sourceSetId,
        timestampSec,
        observedAtMs,
      });
      syncResults.push({
        provider: quote.provider,
        pair: quote.pair,
        storage_pair: storagePair,
        relay_status: 'queued',
        change_bps: decision.change_bps ?? null,
        comparison_basis: decision.comparison_basis ?? null,
        quote,
      });
    }
  }

  let batchTx = null;
  if (batchUpdates.length > 0) {
    if (
      targetChain === 'neo_n3' &&
      dataFeedHash &&
      isConfiguredHash160(dataFeedHash) &&
      neoContext
    ) {
      batchTx = await submitQuotesToN3WithFallback(dataFeedHash, neoContext, payload, batchUpdates);
    } else if (targetChain === 'neo_x' && dataFeedAddress) {
      batchTx = await submitQuotesToNeoX(dataFeedAddress, payload, batchUpdates);
    }
  }

  for (const entry of batchUpdates) {
    state.records[entry.storagePair] = {
      provider: entry.quote.provider,
      pair: entry.quote.pair,
      storage_pair: entry.storagePair,
      price: entry.quote.price,
      price_units: decimalToIntegerString(entry.quote.price, entry.quote.decimals),
      round_id: entry.roundId,
      source_set_id: entry.sourceSetId,
      last_submitted_at_ms: Date.now(),
      last_observed_price: entry.quote.price,
      last_observed_price_units: decimalToIntegerString(entry.quote.price, entry.quote.decimals),
      last_observed_at_ms: entry.observedAtMs,
      attestation_hash: entry.quote.attestation_hash,
      price_scale_decimals: FEED_PRICE_DECIMALS,
    };
  }

  for (const result of syncResults) {
    if (result.relay_status === 'queued') {
      result.relay_status = batchTx ? 'submitted' : 'skipped';
      result.anchored_tx = batchTx;
    }
  }

  await saveFeedState(state);
  if (isEnabled(env('MORPHEUS_FEED_SNAPSHOT_SUPABASE_ENABLED'), true)) {
    const snapshotRows = buildFeedSnapshotRows(targetChain, syncResults, state, batchTx);
    try {
      await persistFeedSnapshots(snapshotRows);
    } catch {
      // keep pricefeed path independent from Supabase write health
    }
  }

  return json(200, {
    mode: 'pricefeed',
    target_chain: targetChain,
    symbols,
    batch_submitted: batchUpdates.length > 0,
    batch_count: batchUpdates.length,
    batch_tx: batchTx,
    sync_results: syncResults,
    errors,
  });
}

export function listFeedSymbols() {
  return getDefaultFeedSymbols();
}
