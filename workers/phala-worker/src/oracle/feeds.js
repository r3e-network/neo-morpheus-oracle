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
import { buildProviderRequest, fetchProviderJSON, resolveProviderPayload } from './providers.js';
import {
  applyFeedProviderDefaults,
  getDefaultFeedSymbols,
  getFeedProvidersForPair,
  getFeedStoragePair,
  getSourceSetIdForProvider,
} from './feed-registry.js';

const DEFAULT_FEED_STATE_PATH = '/data/morpheus-feed-state.json';
const MAINNET_FEED_CHANGE_THRESHOLD_BPS = 10;
const MAINNET_FEED_MIN_UPDATE_INTERVAL_MS = 15_000;
const FEED_PRICE_DECIMALS = 2;

let feedStateCache;

export function __resetFeedStateForTests() {
  feedStateCache = undefined;
}

export function normalizePairSymbol(rawSymbol) {
  const raw = trimString(rawSymbol).toUpperCase();
  if (!raw) return 'NEO-USD';
  if (/^[A-Z0-9]+-[A-Z0-9]+$/.test(raw)) {
    const [base, quote] = raw.split('-');
    return `${base}-${quote === 'USDT' ? 'USD' : quote}`;
  }
  if (/^[A-Z0-9]+[/-_][A-Z0-9]+$/.test(raw)) {
    const [base, quote] = raw.split(/[/_-]/);
    return `${base}-${quote === 'USDT' ? 'USD' : quote}`;
  }
  if (raw.endsWith('USDT')) return `${raw.slice(0, -4)}-USD`;
  if (raw.endsWith('USD')) return `${raw.slice(0, -3)}-USD`;
  return `${raw}-USD`;
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
  return ((whole * scale) + fractionValue) * sign + '';
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

function parseProviderList(value, fallback = []) {
  if (Array.isArray(value)) {
    return value.map((entry) => trimString(entry).toLowerCase()).filter(Boolean);
  }
  const raw = trimString(value);
  if (!raw) return fallback;
  return raw.split(',').map((entry) => trimString(entry).toLowerCase()).filter(Boolean);
}

function resolveRequestedProviders(symbol, options = {}) {
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
  return response.data?.price ?? response.data?.value ?? response.data?.close ?? response.data?.data?.amount ?? null;
}

function buildSyncPolicy(targetChain, payload = {}) {
  const thresholdCandidate = payload.feed_change_threshold_bps ?? env('MORPHEUS_FEED_CHANGE_THRESHOLD_BPS');
  const intervalCandidate = payload.feed_min_update_interval_ms ?? env('MORPHEUS_FEED_MIN_UPDATE_INTERVAL_MS');
  const thresholdSource = thresholdCandidate === "" || thresholdCandidate === undefined || thresholdCandidate === null
    ? `${MAINNET_FEED_CHANGE_THRESHOLD_BPS}`
    : thresholdCandidate;
  const intervalSource = intervalCandidate === "" || intervalCandidate === undefined || intervalCandidate === null
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
  if (!Number.isFinite(previous) || !Number.isFinite(next) || previous <= 0) return Number.POSITIVE_INFINITY;
  return Math.abs((next - previous) / previous) * 10_000;
}

function shouldSubmitFeed(storageKey, quote, previousRecord, policy, force = false) {
  if (force) return { allow: true, reason: 'forced' };
  if (!previousRecord) return { allow: true, reason: 'first-observation' };

  const now = Date.now();
  const lastObservedAt = Number(previousRecord.last_observed_at_ms || previousRecord.last_submitted_at_ms || 0);
  if (policy.minUpdateIntervalMs > 0 && lastObservedAt > 0 && (now - lastObservedAt) < policy.minUpdateIntervalMs) {
    return { allow: false, reason: 'min-update-interval', storage_key: storageKey };
  }

  const previousObservedPrice = previousRecord.last_observed_price || previousRecord.price;
  const changeBps = computeChangeBps(previousObservedPrice, quote.price);
  if (policy.thresholdBps > 0 && changeBps < policy.thresholdBps) {
    return { allow: false, reason: 'price-change-below-threshold', change_bps: changeBps, storage_key: storageKey };
  }

  return { allow: true, reason: 'threshold-met', change_bps: changeBps, storage_key: storageKey };
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
  const response = await fetchProviderJSON(providerRequest, parseDurationMs(resolvedPayload.oracle_timeout_ms || env('ORACLE_TIMEOUT'), 20_000));
  if (!response.ok) {
    throw new Error(response.provider_error?.message || `${provider} fetch failed`);
  }
  const pair = providerRequest.pair || normalizePairSymbol(symbol);
  const price = extractQuotePrice(response);
  if (price === null || price === undefined || price === '') throw new Error(`${provider} response missing price`);

  const quote = {
    feed_id: `${provider}:${pair}`,
    pair,
    provider,
    price: String(price),
    decimals: FEED_PRICE_DECIMALS,
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
    pair: normalizePairSymbol(symbol),
    providers_requested: providers,
    quotes,
    errors,
  };
}

export async function handleFeedsPrice(symbol, options = {}) {
  try {
    const explicitProvider = trimString(options.provider || options.source || '').toLowerCase();
    if (explicitProvider && explicitProvider !== 'all') {
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

async function submitQuoteToN3(dataFeedHash, neoContext, payload, quote, storagePair, roundId, sourceSetId) {
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
      { type: 'Array', value: updates.map((entry) => ({ type: 'String', value: entry.storagePair })) },
      { type: 'Array', value: updates.map((entry) => ({ type: 'Integer', value: entry.roundId })) },
      { type: 'Array', value: updates.map((entry) => ({ type: 'Integer', value: decimalToIntegerString(entry.quote.price, entry.quote.decimals) })) },
      { type: 'Array', value: updates.map((entry) => ({ type: 'Integer', value: String(entry.timestampSec) })) },
      { type: 'Array', value: updates.map((entry) => ({ type: 'ByteArray', value: entry.quote.attestation_hash })) },
      { type: 'Array', value: updates.map((entry) => ({ type: 'Integer', value: String(entry.sourceSetId) })) },
    ],
    wait: Boolean(payload.wait ?? true),
    rpc_url: neoContext.rpcUrl,
    network_magic: neoContext.networkMagic,
  });
  if (invokeResult.status >= 400) {
    throw new Error(invokeResult.body?.error || 'Neo N3 batch feed submit failed');
  }
  return invokeResult.body;
}

async function submitQuoteToNeoX(dataFeedAddress, payload, quote, storagePair, roundId, sourceSetId) {
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
  const updaterPrivateKey = trimString(payload.private_key || env('MORPHEUS_RELAYER_NEOX_PRIVATE_KEY', 'PHALA_NEOX_PRIVATE_KEY'));
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
  const updaterPrivateKey = trimString(payload.private_key || env('MORPHEUS_RELAYER_NEOX_PRIVATE_KEY', 'PHALA_NEOX_PRIVATE_KEY'));
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

  const dataFeedHash = targetChain === 'neo_n3'
    ? normalizeNeoHash160(env('CONTRACT_MORPHEUS_DATAFEED_HASH', 'CONTRACT_PRICEFEED_HASH'))
    : null;
  const neoContext = targetChain === 'neo_n3'
    ? loadNeoN3Context(payload, { required: false, requireRpc: false })
    : null;
  const dataFeedAddress = targetChain === 'neo_x'
    ? trimString(env('CONTRACT_MORPHEUS_DATAFEED_X_ADDRESS'))
    : null;

  for (const symbol of symbols) {
    const quoteSet = await fetchPriceQuotes(symbol, payload);
    if (quoteSet.quotes.length === 0) {
      errors.push({ symbol, providers_requested: quoteSet.providers_requested, errors: quoteSet.errors });
      continue;
    }
    for (const quote of quoteSet.quotes) {
      const storagePair = getFeedStoragePair(quote.provider, quote.pair);
      const previousRecord = state.records[storagePair] || null;
      const decision = shouldSubmitFeed(storagePair, quote, previousRecord, policy, Boolean(payload.force));
      const roundId = trimString(payload.round_id) || buildRoundId(previousRecord);
      const sourceSetId = Number(payload.source_set_id ?? getSourceSetIdForProvider(quote.provider, 0));
      const timestampSec = Math.floor(Date.now() / 1000);
      const observedAtMs = Date.now();

      if (!decision.allow) {
        state.records[storagePair] = {
          ...(previousRecord || {}),
          provider: quote.provider,
          pair: quote.pair,
          storage_pair: storagePair,
          last_observed_price: quote.price,
          last_observed_at_ms: observedAtMs,
        };
        syncResults.push({
          provider: quote.provider,
          pair: quote.pair,
          storage_pair: storagePair,
          relay_status: 'skipped',
          skip_reason: decision.reason,
          change_bps: decision.change_bps ?? null,
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
        quote,
      });
    }
  }

  let batchTx = null;
  if (batchUpdates.length > 0) {
    if (targetChain === 'neo_n3' && dataFeedHash && isConfiguredHash160(dataFeedHash) && neoContext) {
      batchTx = await submitQuotesToN3(dataFeedHash, neoContext, payload, batchUpdates);
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
      round_id: entry.roundId,
      source_set_id: entry.sourceSetId,
      last_submitted_at_ms: Date.now(),
      last_observed_price: entry.quote.price,
      last_observed_at_ms: entry.observedAtMs,
      attestation_hash: entry.quote.attestation_hash,
    };
  }

  for (const result of syncResults) {
    if (result.relay_status === 'queued') {
      result.relay_status = batchTx ? 'submitted' : 'skipped';
      result.anchored_tx = batchTx;
    }
  }

  await saveFeedState(state);

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
