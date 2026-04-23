// These helpers are re-exported from core.js to avoid duplication
export { parseDurationMs, normalizeBoolean, trimString } from './platform/core.js';

const DEFAULT_PORT = 8080;
const DEFAULT_MAX_BODY_BYTES = 262144;
const MIN_MAX_BODY_BYTES = 1024;
const DEFAULT_UPSTASH_TTL_MS = 5 * 60_000;

// Get active chains from environment
export function getActiveChains() {
  const raw = String(process.env.MORPHEUS_ACTIVE_CHAINS || '').trim();
  if (!raw) return ['neo_n3'];
  const chains = raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry === 'neo_n3');
  return chains.length > 0 ? chains : ['neo_n3'];
}

// Get server port from environment
export function getPort() {
  return Number(
    process.env.PORT || process.env.PHALA_WORKER_PORT || process.env.NITROCORE_PORT || DEFAULT_PORT
  );
}

// Get max body bytes from environment
export function getMaxBodyBytes() {
  return Math.max(
    Number(process.env.WORKER_MAX_BODY_BYTES || DEFAULT_MAX_BODY_BYTES),
    MIN_MAX_BODY_BYTES
  );
}

// Get runtime configuration JSON from environment
export function getRuntimeConfigJson() {
  const raw = String(process.env.MORPHEUS_RUNTIME_CONFIG_JSON || '').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// Get PHALA API token from environment
export function getPhalaApiToken() {
  return trimString(process.env.PHALA_API_TOKEN || process.env.PHALA_SHARED_SECRET);
}

// Get MORPHEUS runtime token from environment
export function getMorpheusRuntimeToken() {
  return trimString(process.env.MORPHEUS_RUNTIME_TOKEN);
}

// Get trusted tokens from environment
export function getTrustedTokens() {
  return [
    getMorpheusRuntimeToken(),
    getPhalaApiToken(),
    trimString(process.env.PHALA_SHARED_SECRET),
  ]
    .filter(Boolean)
    .map((t) => t.trim());
}

// Get Upstash URL from environment
export function getUpstashUrl() {
  return trimString(process.env.UPSTASH_REDIS_REST_URL).replace(/\/$/, '');
}

// Get Upstash token from environment
export function getUpstashToken() {
  return trimString(process.env.UPSTASH_REDIS_REST_TOKEN);
}

// Check if Upstash is enabled
export function getUpstashEnabled() {
  return Boolean(getUpstashUrl() && getUpstashToken());
}

// Check if Upstash fail-closed mode is enabled
export function getUpstashFailClosed() {
  return normalizeBoolean(process.env.MORPHEUS_UPSTASH_FAIL_CLOSED, false);
}

// Get Upstash default TTL from environment
export function getUpstashDefaultTtlMs() {
  return parseDurationMs(process.env.MORPHEUS_UPSTASH_DEFAULT_TTL_MS, DEFAULT_UPSTASH_TTL_MS);
}

// Check if guards are enabled
export function getGuardsEnabled() {
  return normalizeBoolean(process.env.MORPHEUS_UPSTASH_GUARDS_ENABLED, false);
}

// Rate limit policy overrides (read from env for specific route)
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_IDEMPOTENCY_TTL_MS = 60_000;
const DEFAULT_LOCK_TTL_MS = 15_000;

export function getRateLimitPolicyOverride(name, defaults = {}) {
  const upper = name.toUpperCase();
  return {
    max: Number(process.env[`MORPHEUS_RATE_LIMIT_${upper}_MAX`] || defaults.max),
    windowMs: parseDurationMs(
      process.env[`MORPHEUS_RATE_LIMIT_${upper}_WINDOW_MS`] || defaults.windowMs,
      defaults.windowMs ? parseDurationMs(defaults.windowMs) : DEFAULT_RATE_LIMIT_WINDOW_MS
    ),
    idempotencyTtlMs: parseDurationMs(
      process.env[`MORPHEUS_IDEMPOTENCY_${upper}_TTL_MS`] || defaults.idempotencyTtlMs,
      defaults.idempotencyTtlMs
        ? parseDurationMs(defaults.idempotencyTtlMs)
        : DEFAULT_IDEMPOTENCY_TTL_MS
    ),
    lockTtlMs: parseDurationMs(
      process.env[`MORPHEUS_IDEMPOTENCY_${upper}_LOCK_TTL_MS`] || defaults.lockTtlMs,
      defaults.lockTtlMs ? parseDurationMs(defaults.lockTtlMs) : DEFAULT_LOCK_TTL_MS
    ),
  };
}

// Helper to get value with fallback to runtime config
export function getConfigValue(...names) {
  const runtimeConfig = getRuntimeConfigJson();
  for (const name of names) {
    const value = String(process.env[name] || runtimeConfig[name] || '').trim();
    if (value) return value;
  }
  return '';
}
