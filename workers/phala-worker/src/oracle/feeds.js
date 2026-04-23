import fs from 'node:fs/promises';
import path from 'node:path';
import { env, envForNetwork, json, normalizeMorpheusNetwork, parseDurationMs, resolvePayloadNetwork, strip0x, trimString } from '../platform/core.js';
import { maybeBuildDstackAttestation } from '../platform/dstack.js';
import { aggregateQuotes } from './aggregation.js';
import {
  buildSignedResultEnvelope,
  buildVerificationEnvelope,
  isConfiguredHash160,
  loadNeoN3Context,
  normalizeNeoHash160,
  relayNeoN3Invocation,
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
  getFeedPairConfig,
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

const feedStateCache = new Map();

function resolveFeedNetwork(input = {}) {
  return resolvePayloadNetwork(
    input,
    normalizeMorpheusNetwork(env('MORPHEUS_NETWORK', 'NEXT_PUBLIC_MORPHEUS_NETWORK') || 'testnet')
  );
}

function resolveFeedTargetChain(value = 'neo_n3') {
  return 'neo_n3';
}

function resolveFeedScope(input = {}, fallbackTargetChain = 'neo_n3') {
  const source = input && typeof input === 'object' ? input : {};
  return {
    network: resolveFeedNetwork(source),
    targetChain: resolveFeedTargetChain(
      source.target_chain ?? source.targetChain ?? fallbackTargetChain
    ),
  };
}

function resolveSupabaseNetwork(input = {}) {
  return resolveFeedScope(input).network;
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

async function fetchLatestFeedSnapshots(limit = 250, scope = {}) {
  const restConfig = getSupabaseRestConfig();
  if (!restConfig) return [];
  const resolvedScope = resolveFeedScope(scope);
  const url = new URL(`${restConfig.restUrl}/morpheus_feed_snapshots`);
  url.searchParams.set(
    'select',
    'symbol,target_chain,price,payload,attestation_hash,created_at,network'
  );
  url.searchParams.set('network', `eq.${resolvedScope.network}`);
  url.searchParams.set('target_chain', `eq.${resolvedScope.targetChain}`);
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
          : (row?.price ?? null),
      attestation_hash: trimString(payload.attestation_hash || row?.attestation_hash || ''),
      snapshot_created_at: trimString(row?.created_at || ''),
    };
  }
  return state;
}

function getFeedStatePathBase() {
  return trimString(env('MORPHEUS_FEED_STATE_PATH')) || DEFAULT_FEED_STATE_PATH;
}

function buildScopedFeedStatePath(basePath, network, targetChain) {
  const ext = path.extname(basePath);
  if (!ext) return `${basePath}.${network}.${targetChain}`;
  return `${basePath.slice(0, -ext.length)}.${network}.${targetChain}${ext}`;
}

function getFeedStatePath(scope = {}) {
  const resolvedScope = resolveFeedScope(scope);
  return buildScopedFeedStatePath(
    getFeedStatePathBase(),
    resolvedScope.network,
    resolvedScope.targetChain
  );
}

function normalizeFeedState(state) {
  const normalized = state && typeof state === 'object' ? state : {};
  if (!normalized.records || typeof normalized.records !== 'object') {
    normalized.records = {};
  }
  return normalized;
}

async function readFeedStateFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return normalizeFeedState(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function loadFeedState(scope = {}) {
  const resolvedScope = resolveFeedScope(scope);
  const statePath = getFeedStatePath(resolvedScope);
  if (feedStateCache.has(statePath)) return feedStateCache.get(statePath);

  let state = await readFeedStateFile(statePath);
  if (!state) {
    const legacyPath = getFeedStatePathBase();
    if (legacyPath != statePath) {
      state = await readFeedStateFile(legacyPath);
    }
  }
  state = normalizeFeedState(state);

  if (
    isEnabled(env('MORPHEUS_FEED_BOOTSTRAP_SUPABASE_ENABLED'), true) &&
    Object.keys(state.records).length === 0
  ) {
    try {
      const rows = await fetchLatestFeedSnapshots(250, resolvedScope);
      state = applySnapshotRowsToFeedState(state, rows);
    } catch {
      // keep pricefeed startup independent from Supabase health
    }
  }

  feedStateCache.set(statePath, state);
  return state;
}

async function saveFeedState(state, scope = {}) {
  const resolvedScope = resolveFeedScope(scope);
  const statePath = getFeedStatePath(resolvedScope);
  feedStateCache.set(statePath, state);
  try {
    await fs.mkdir(path.dirname(statePath), { recursive: true });
    await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}
`, 'utf8');
  } catch {
    // best effort only; feed sync still works without persistence
  }
}

export function __resetFeedStateForTests() {
  feedStateCache.clear();
}

export async function __loadFeedStateForTests(scope = {}) {
  return loadFeedState(scope);
}

export function __buildFeedSnapshotRowsForTests(targetChain, syncResults, state, batchTx, scope = {}) {
  return buildFeedSnapshotRows(targetChain, syncResults, state, batchTx, scope);
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

function buildFeedSnapshotRows(targetChain, syncResults, state, batchTx, scope = {}) {
  const resolvedScope = resolveFeedScope(scope, targetChain);
  const rows = [];
  for (const result of Array.isArray(syncResults) ? syncResults : []) {
    const storagePair = trimString(result?.storage_pair || '');
    const record = storagePair ? state.records?.[storagePair] || {} : {};
    const quote = result?.quote && typeof result.quote === 'object' ? result.quote : null;
    const price = record?.price ?? record?.last_observed_price ?? quote?.price ?? null;
    rows.push({
      network: resolvedScope.network,
      symbol: storagePair || trimString(result?.pair || ''),
      target_chain: resolvedScope.targetChain,
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

  const network = resolveFeedNetwork(options);
  const configured = parseProviderList(envForNetwork(network, 'MORPHEUS_FEED_PROVIDERS'), []);
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

/**
 * Extract the upstream data source timestamp from the provider API response.
 * Using the provider's timestamp instead of the local clock prevents clock-skew
 * issues and ensures the recorded timestamp reflects when the price was actually
 * observed at the source (TwelveData, Binance, Coinbase), not when our worker
 * happened to process it.
 */
function extractUpstreamTimestamp(response) {
  // TwelveData: { "datetime": "2025-01-15 14:30:00" }
  if (response.data?.datetime) {
    const parsed = Date.parse(response.data.datetime);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  // TwelveData time_series: { "timestamp": 1705312200 }
  if (response.data?.timestamp) {
    const ts = Number(response.data.timestamp);
    // Distinguish seconds from milliseconds (pre-2100 cutoff in seconds)
    if (Number.isFinite(ts) && ts > 0) {
      return new Date(ts < 4_102_444_800 ? ts * 1000 : ts).toISOString();
    }
  }
  // Binance: { "time": 1705312200000 } (trade time in ms)
  if (response.data?.time) {
    const ts = Number(response.data.time);
    if (Number.isFinite(ts) && ts > 0) {
      return new Date(ts < 4_102_444_800 ? ts * 1000 : ts).toISOString();
    }
  }
  // Coinbase: { "data": { "currency": "NEO", "amount": "12.34" } } - no timestamp field;
  // fall back to response Date header if present
  if (response.headers?.date) {
    const parsed = Date.parse(response.headers.date);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  // Last resort: use local clock (safe fallback)
  return new Date().toISOString();
}

function resolvePairThresholdBps(storagePair, payload = {}, targetChain = 'neo_n3') {
  const config = getFeedPairConfig(storagePair);
  const raw =
    config?.threshold_bps ??
    config?.feed_change_threshold_bps ??
    payload?.pair_feed_change_threshold_bps ??
    payload?.feed_change_threshold_bps_by_pair?.[storagePair] ??
    null;
  if (raw === '' || raw === undefined || raw === null) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(parsed, 0);
}

function buildSyncPolicy(targetChain, payload = {}) {
  const network = resolveFeedScope(payload, targetChain).network;
  const thresholdCandidate =
    payload.feed_change_threshold_bps ?? envForNetwork(network, 'MORPHEUS_FEED_CHANGE_THRESHOLD_BPS');
  const intervalCandidate =
    payload.feed_min_update_interval_ms ?? envForNetwork(network, 'MORPHEUS_FEED_MIN_UPDATE_INTERVAL_MS');
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

function normalizeBooleanLike(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = trimString(value).toLowerCase();
  if (!normalized) return fallback;
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function resolveFeedSubmissionIssue(
  targetChain,
  { hasNeoN3DataFeedTarget = false, neoContext = null } = {}
) {
  if (targetChain === 'neo_n3') {
    if (!hasNeoN3DataFeedTarget) return 'Neo N3 datafeed contract hash is not configured';
    if (!neoContext) return 'Neo N3 signing key is not configured';
    if (!trimString(neoContext.rpcUrl)) return 'NEO_RPC_URL is required for Neo N3 feed submission';
    return '';
  }

  return '';
}

export function __resolvePairThresholdBpsForTests(storagePair, payload = {}, targetChain = 'neo_n3') {
  return resolvePairThresholdBps(storagePair, payload, targetChain);
}

export function __buildSyncPolicyForTests(targetChain, payload = {}) {
  return buildSyncPolicy(targetChain, payload);
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

async function loadOnchainFeedRecords(
  targetChain,
  { neoContext = null, dataFeedHash = null } = {}
) {
  try {
    if (targetChain === 'neo_n3') {
      return {
        records: await fetchNeoN3FeedRecords(neoContext?.rpcUrl, dataFeedHash),
        error: null,
      };
    }
  } catch (error) {
    return {
      records: {},
      error: error instanceof Error ? error.message : String(error),
    };
  }
  return { records: {}, error: null };
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

export function __shouldSubmitFeedForTests(
  storageKey,
  quote,
  previousRecord,
  policy,
  force = false
) {
  return shouldSubmitFeed(storageKey, quote, previousRecord, policy, force);
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

  // Use the upstream provider's timestamp rather than local clock, so the
  // recorded observation time reflects the data source, not worker processing.
  const upstreamTimestamp = extractUpstreamTimestamp(response);
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
    timestamp: upstreamTimestamp,
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

  const aggregation =
    quotes.length >= 2
      ? aggregateQuotes(
          quotes.map((q) => ({
            provider: q.provider,
            price: Number(q.price),
            timestamp: q.timestamp,
          })),
          {
            method:
              trimString(
                options.aggregation_method || env('MORPHEUS_AGGREGATION_METHOD') || 'median'
              ).toLowerCase() === 'trimmed-mean'
                ? 'trimmed-mean'
                : 'median',
          }
        )
      : null;

  return {
    pair:
      providers.length === 1 ? getFeedStoragePair(providers[0], normalizedPair) : normalizedPair,
    providers_requested: providers,
    quotes,
    errors,
    ...(aggregation ? { aggregation } : {}),
  };
}

export async function handleFeedsPrice(symbol, options = {}) {
  try {
    const explicitProvider = trimString(options.provider || options.source || '').toLowerCase();
    const inferredProvider = trimString(inferProviderIdFromPairSymbol(symbol)).toLowerCase();
    if ((explicitProvider && explicitProvider !== 'all') || inferredProvider) {
      return json(200, await fetchPriceQuote(symbol, options));
    }
    const result = await fetchPriceQuotes(symbol, options);
    return json(200, result);
  } catch (error) {
    return json(502, { error: error instanceof Error ? error.message : String(error) });
  }
}

function buildRoundId(previousRecord) {
  if (!previousRecord?.round_id) return String(Math.floor(Date.now() / 1000));
  return String(Number(previousRecord.round_id) + 1);
}

function buildNeoN3RelaySigningPayload(payload = {}) {
  const network = resolveFeedNetwork(payload);
  const signingKey = trimString(
    payload.private_key ||
      payload.signing_key ||
      envForNetwork(
        network,
        'MORPHEUS_UPDATER_NEO_N3_PRIVATE_KEY',
        'MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY'
      )
  );
  const wif = trimString(
    payload.wif || envForNetwork(network, 'MORPHEUS_UPDATER_NEO_N3_WIF', 'MORPHEUS_RELAYER_NEO_N3_WIF')
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
    network: payload.network,
    contract_hash: dataFeedHash,
    method: 'updateFeed',
    params: [
      { type: 'String', value: storagePair },
      { type: 'Integer', value: roundId },
      { type: 'Integer', value: decimalToIntegerString(quote.price, quote.decimals) },
      // Use provider's observation timestamp, not local clock
      { type: 'Integer', value: String(
        (() => {
          const parsed = Date.parse(quote.timestamp);
          return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : Math.floor(Date.now() / 1000);
        })()
      ) },
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
    network: payload.network,
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
  const scope = resolveFeedScope(payload, payload?.target_chain || payload?.targetChain || 'neo_n3');
  const targetChain = scope.targetChain;
  const scopedPayload = payload?.network ? payload : { ...payload, network: scope.network };
  const symbols = resolveRequestedSymbols(scopedPayload);

  const policy = buildSyncPolicy(targetChain, scopedPayload);
  const requireSubmission = normalizeBooleanLike(
    scopedPayload.require_submission ?? scopedPayload.requireSubmission,
    false
  );
  const state = await loadFeedState(scope);
  const syncResults = [];
  const batchUpdates = [];
  const errors = [];
  const aggregations = {};

  const dataFeedHash =
    targetChain === 'neo_n3'
      ? normalizeNeoHash160(
          envForNetwork(scope.network, 'CONTRACT_MORPHEUS_DATAFEED_HASH', 'CONTRACT_PRICEFEED_HASH')
        )
      : null;
  const hasNeoN3DataFeedTarget =
    targetChain === 'neo_n3' && dataFeedHash && isConfiguredHash160(dataFeedHash);
  const neoContext = hasNeoN3DataFeedTarget
    ? loadNeoN3Context(scopedPayload, { required: false, requireRpc: false })
    : null;
  const onchainFeedState = await loadOnchainFeedRecords(targetChain, {
    neoContext,
    dataFeedHash,
  });
  const onchainRecords = onchainFeedState.records;
  if (
    onchainFeedState.error &&
    Object.keys(state.records || {}).length === 0 &&
    !Boolean(scopedPayload.force)
  ) {
    return json(503, {
      mode: 'pricefeed',
      network: scope.network,
      target_chain: targetChain,
      symbols,
      batch_submitted: false,
      batch_count: 0,
      sync_results: [],
      errors: [
        {
          error: `on-chain baseline unavailable: ${onchainFeedState.error}`,
        },
      ],
    });
  }

  for (const symbol of symbols) {
    const quoteSet = await fetchPriceQuotes(symbol, scopedPayload);
    if (quoteSet.quotes.length === 0) {
      errors.push({
        symbol,
        providers_requested: quoteSet.providers_requested,
        errors: quoteSet.errors,
      });
      continue;
    }
    if (quoteSet.aggregation) {
      aggregations[symbol] = quoteSet.aggregation;
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
        {
          ...policy,
          thresholdBps: resolvePairThresholdBps(storagePair, scopedPayload, targetChain) ?? policy.thresholdBps,
        },
        Boolean(scopedPayload.force)
      );
      const roundId =
        trimString(scopedPayload.round_id) || buildRoundId(hasPreviousRecord ? previousRecord : null);
      const sourceSetId = Number(
        scopedPayload.source_set_id ?? getSourceSetIdForProvider(quote.provider, 0)
      );
      const quoteTimestampMs = Date.parse(quote.timestamp);
      const timestampSec = Number.isFinite(quoteTimestampMs)
        ? Math.floor(quoteTimestampMs / 1000)
        : Math.floor(Date.now() / 1000);
      const observedAtMs = Number.isFinite(quoteTimestampMs) ? quoteTimestampMs : Date.now();

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
        previousRecord: hasPreviousRecord ? previousRecord : null,
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
  const submissionIssue =
    batchUpdates.length > 0
      ? resolveFeedSubmissionIssue(targetChain, {
          hasNeoN3DataFeedTarget,
          neoContext,
        })
      : '';
  if (batchUpdates.length > 0) {
    if (submissionIssue) {
      errors.push({
        target_chain: targetChain,
        error: submissionIssue,
      });
    } else if (hasNeoN3DataFeedTarget && neoContext) {
      batchTx = await submitQuotesToN3WithFallback(
        dataFeedHash,
        neoContext,
        scopedPayload,
        batchUpdates
      );
    }
  }

  if (requireSubmission && batchUpdates.length > 0 && !batchTx && !submissionIssue) {
    errors.push({
      target_chain: targetChain,
      error: 'feed batch submission returned no transaction metadata',
    });
  }

  for (const entry of batchUpdates) {
    if (batchTx) {
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
      continue;
    }

    state.records[entry.storagePair] = {
      ...(entry.previousRecord || {}),
      provider: entry.quote.provider,
      pair: entry.quote.pair,
      storage_pair: entry.storagePair,
      last_observed_price: entry.quote.price,
      last_observed_price_units: decimalToIntegerString(entry.quote.price, entry.quote.decimals),
      last_observed_at_ms: entry.observedAtMs,
      price_scale_decimals: FEED_PRICE_DECIMALS,
    };
  }

  for (const result of syncResults) {
    if (result.relay_status === 'queued') {
      result.relay_status = batchTx ? 'submitted' : 'skipped';
      if (!batchTx) {
        result.skip_reason = submissionIssue ? 'submission_unavailable' : 'submission_missing_tx';
      }
      result.anchored_tx = batchTx;
    }
  }

  await saveFeedState(state, scope);
  if (isEnabled(env('MORPHEUS_FEED_SNAPSHOT_SUPABASE_ENABLED'), true)) {
    const snapshotRows = buildFeedSnapshotRows(targetChain, syncResults, state, batchTx, scope);
    try {
      await persistFeedSnapshots(snapshotRows);
    } catch {
      // keep pricefeed path independent from Supabase write health
    }
  }

  return json(200, {
    mode: 'pricefeed',
    network: scope.network,
    target_chain: targetChain,
    symbols,
    batch_submitted: Boolean(batchTx),
    batch_count: batchUpdates.length,
    batch_tx: batchTx,
    sync_results: syncResults,
    errors,
    ...(Object.keys(aggregations).length > 0 ? { aggregations } : {}),
  });
}

export function listFeedSymbols() {
  return getDefaultFeedSymbols();
}
