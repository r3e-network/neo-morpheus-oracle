import {
  env,
  normalizeMorpheusNetwork,
  resolvePayloadNetwork,
  trimString,
} from '../../platform/core.js';

export const DEFAULT_FEED_STATE_PATH = '/data/morpheus-feed-state.json';
export const MAINNET_FEED_CHANGE_THRESHOLD_BPS = 10;
export const MAINNET_FEED_MIN_UPDATE_INTERVAL_MS = 60_000;
export const MAINNET_FEED_STALE_AFTER_MS = 300_000;
export const DEFAULT_FEED_PROVIDER_TIMEOUT_MS = 8_000;
export const MAX_FEED_PROVIDER_TIMEOUT_MS = 10_000;
export const DEFAULT_FEED_SUBMISSION_WAIT_TIMEOUT_MS = 8_000;
export const FEED_PRICE_DECIMALS = 6;

export function resolveFeedNetwork(input = {}) {
  return resolvePayloadNetwork(
    input,
    normalizeMorpheusNetwork(env('MORPHEUS_NETWORK', 'NEXT_PUBLIC_MORPHEUS_NETWORK') || 'testnet')
  );
}

export function resolveFeedTargetChain(_value = 'neo_n3') {
  return 'neo_n3';
}

export function resolveFeedScope(input = {}, fallbackTargetChain = 'neo_n3') {
  const source = input && typeof input === 'object' ? input : {};
  return {
    network: resolveFeedNetwork(source),
    targetChain: resolveFeedTargetChain(
      source.target_chain ?? source.targetChain ?? fallbackTargetChain
    ),
  };
}

export function isEnabled(rawValue, fallback = true) {
  const normalized = trimString(rawValue).toLowerCase();
  if (!normalized) return fallback;
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export function normalizeBooleanLike(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = trimString(value).toLowerCase();
  if (!normalized) return fallback;
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export function hasOwnPayloadKey(payload = {}, key) {
  return Object.prototype.hasOwnProperty.call(payload, key);
}
