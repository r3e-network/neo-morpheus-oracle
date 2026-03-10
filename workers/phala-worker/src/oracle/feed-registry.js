import { env, trimString } from '../platform/core.js';
import { normalizeProviderId } from './providers.js';

export const DEFAULT_FEED_PAIRS = {
  'NEO-USD': {
    providers: {
      twelvedata: { symbol: 'NEO/USD' },
      'binance-spot': { symbol: 'NEOUSDT' },
    },
  },
  'GAS-USD': {
    providers: {
      twelvedata: { symbol: 'GAS/USD' },
      'binance-spot': { symbol: 'GASUSDT' },
    },
  },
  'FLM-USD': {
    providers: {
      twelvedata: { symbol: 'FLM/USD' },
      'binance-spot': { symbol: 'FLMUSDT' },
    },
  },
  'BTC-USD': {
    providers: {
      twelvedata: { symbol: 'BTC-USD' },
    },
  },
  'ETH-USD': {
    providers: {
      twelvedata: { symbol: 'ETH-USD' },
    },
  },
  'SOL-USD': {
    providers: {
      twelvedata: { symbol: 'SOL-USD' },
    },
  },
  'TRX-USD': {
    providers: {
      twelvedata: { symbol: 'TRX-USD' },
    },
  },
  'PAXG-USD': {
    providers: {
      twelvedata: { symbol: 'PAXG-USD' },
    },
  },
  'WTI-USD': {
    providers: {
      twelvedata: { symbol: 'WTI-USD' },
    },
  },
  'USDT-USD': {
    providers: {
      twelvedata: { symbol: 'USDT-USD' },
    },
  },
  'USDC-USD': {
    providers: {
      twelvedata: { symbol: 'USDC-USD' },
    },
  },
  'BNB-USD': {
    providers: {
      twelvedata: { symbol: 'BNB-USD' },
    },
  },
  'XRP-USD': {
    providers: {
      twelvedata: { symbol: 'XRP-USD' },
    },
  },
  'DOGE-USD': {
    providers: {
      twelvedata: { symbol: 'DOGE-USD' },
    },
  },
};

const DEFAULT_SOURCE_SET_IDS = {
  twelvedata: 1,
  'binance-spot': 2,
  'coinbase-spot': 3,
};

function deepMerge(base, override) {
  if (!override || typeof override !== 'object' || Array.isArray(override)) return base;
  const output = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && output[key] && typeof output[key] === 'object' && !Array.isArray(output[key])) {
      output[key] = deepMerge(output[key], value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

function parseRegistryOverride() {
  const raw = trimString(env('MORPHEUS_FEED_PAIR_REGISTRY_JSON'));
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function getFeedPairRegistry() {
  return deepMerge(DEFAULT_FEED_PAIRS, parseRegistryOverride());
}

export function getFeedPairConfig(pair) {
  const registry = getFeedPairRegistry();
  return registry[trimString(pair).toUpperCase()] || null;
}

export function getFeedProvidersForPair(pair) {
  const config = getFeedPairConfig(pair);
  if (!config?.providers || typeof config.providers !== 'object') return [];
  return Object.keys(config.providers).map((provider) => normalizeProviderId(provider)).filter(Boolean);
}

export function getDefaultFeedSymbols() {
  return Object.keys(getFeedPairRegistry());
}

export function applyFeedProviderDefaults(pair, providerId, payload = {}) {
  const config = getFeedPairConfig(pair);
  const provider = normalizeProviderId(providerId);
  const providerDefaults = config?.providers?.[provider] && typeof config.providers[provider] === 'object'
    ? config.providers[provider]
    : {};
  return {
    ...payload,
    symbol: trimString(payload.symbol || pair).toUpperCase(),
    provider,
    provider_params: {
      ...(providerDefaults || {}),
      ...(payload.provider_params && typeof payload.provider_params === 'object' ? payload.provider_params : {}),
    },
  };
}

export function getFeedStoragePair(providerId, pair) {
  return `${normalizeProviderId(providerId).toUpperCase()}:${trimString(pair).toUpperCase()}`;
}

export function getSourceSetIdForProvider(providerId, fallback = 0) {
  return DEFAULT_SOURCE_SET_IDS[normalizeProviderId(providerId)] ?? fallback;
}
