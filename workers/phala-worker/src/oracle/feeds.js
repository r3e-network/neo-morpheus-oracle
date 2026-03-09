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

let feedStateCache;

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

export function decimalToIntegerString(value, decimals = 8) {
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
  const isMainnetN3 = targetChain === 'neo_n3' && trimString(payload.network || env('MORPHEUS_NETWORK')).toLowerCase() === 'mainnet';
  const thresholdSource = payload.feed_change_threshold_bps || (isMainnetN3 ? (env('MORPHEUS_FEED_CHANGE_THRESHOLD_BPS') || `${MAINNET_FEED_CHANGE_THRESHOLD_BPS}`) : '0');
  const intervalSource = payload.feed_min_update_interval_ms || (isMainnetN3 ? (env('MORPHEUS_FEED_MIN_UPDATE_INTERVAL_MS') || `${MAINNET_FEED_MIN_UPDATE_INTERVAL_MS}ms`) : '0');
  const thresholdBps = Number(thresholdSource || 0);
  const minUpdateIntervalMs = parseDurationMs(intervalSource, isMainnetN3 ? MAINNET_FEED_MIN_UPDATE_INTERVAL_MS : 0);
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
  const lastSubmittedAt = Number(previousRecord.last_submitted_at_ms || 0);
  if (policy.minUpdateIntervalMs > 0 && lastSubmittedAt > 0 && (now - lastSubmittedAt) < policy.minUpdateIntervalMs) {
    return { allow: false, reason: 'min-update-interval', storage_key: storageKey };
  }

  const changeBps = computeChangeBps(previousRecord.price, quote.price);
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
    projectSlug: trimString(providerPayload.project_slug || env('MORPHEUS_FEED_PROJECT_SLUG') || ''),
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
    decimals: Number(resolvedPayload.decimals || options.decimals || 8),
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
  return relayNeoXTransaction({
    ...payload,
    target_chain: 'neo_x',
    to: dataFeedAddress,
    data,
    value: '0',
    wait: Boolean(payload.wait ?? true),
  });
}

export async function handleOracleFeed(payload) {
  const targetChain = trimString(payload.target_chain || 'neo_n3').toLowerCase() || 'neo_n3';
  const symbol = normalizePairSymbol(payload.symbol || 'NEO-USD');
  const quoteSet = await fetchPriceQuotes(symbol, payload);
  if (quoteSet.quotes.length === 0) {
    return json(502, { mode: 'pricefeed', target_chain: targetChain, pair: symbol, providers_requested: quoteSet.providers_requested, errors: quoteSet.errors });
  }

  const policy = buildSyncPolicy(targetChain, payload);
  const state = await loadFeedState();
  const syncResults = [];

  const dataFeedHash = targetChain === 'neo_n3'
    ? normalizeNeoHash160(env('CONTRACT_MORPHEUS_DATAFEED_HASH', 'CONTRACT_PRICEFEED_HASH'))
    : null;
  const neoContext = targetChain === 'neo_n3'
    ? loadNeoN3Context(payload, { required: false, requireRpc: false })
    : null;
  const dataFeedAddress = targetChain === 'neo_x'
    ? trimString(payload.contract_address || env('CONTRACT_MORPHEUS_DATAFEED_X_ADDRESS'))
    : null;

  for (const quote of quoteSet.quotes) {
    const storagePair = getFeedStoragePair(quote.provider, quote.pair);
    const previousRecord = state.records[storagePair] || null;
    const decision = shouldSubmitFeed(storagePair, quote, previousRecord, policy, Boolean(payload.force));
    const roundId = trimString(payload.round_id) || buildRoundId(previousRecord);
    const sourceSetId = Number(payload.source_set_id ?? getSourceSetIdForProvider(quote.provider, 0));

    if (!decision.allow) {
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

    let anchoredTx = null;
    let relayStatus = 'skipped';
    if (targetChain === 'neo_n3' && dataFeedHash && isConfiguredHash160(dataFeedHash) && neoContext) {
      anchoredTx = await submitQuoteToN3(dataFeedHash, neoContext, payload, quote, storagePair, roundId, sourceSetId);
      relayStatus = 'submitted';
    } else if (targetChain === 'neo_x' && dataFeedAddress) {
      anchoredTx = await submitQuoteToNeoX(dataFeedAddress, payload, quote, storagePair, roundId, sourceSetId);
      relayStatus = 'submitted';
    }

    state.records[storagePair] = {
      provider: quote.provider,
      pair: quote.pair,
      storage_pair: storagePair,
      price: quote.price,
      round_id: roundId,
      source_set_id: sourceSetId,
      last_submitted_at_ms: Date.now(),
      attestation_hash: quote.attestation_hash,
    };

    syncResults.push({
      provider: quote.provider,
      pair: quote.pair,
      storage_pair: storagePair,
      relay_status: relayStatus,
      anchored_tx: anchoredTx,
      change_bps: decision.change_bps ?? null,
      quote,
    });
  }

  await saveFeedState(state);

  return json(200, {
    mode: 'pricefeed',
    target_chain: targetChain,
    pair: symbol,
    providers_requested: quoteSet.providers_requested,
    sync_results: syncResults,
    errors: quoteSet.errors,
  });
}

export function listFeedSymbols() {
  return getDefaultFeedSymbols();
}
