import {
  env,
  json,
  normalizeMorpheusNetwork,
  resolveMaxBytes,
  resolvePayloadNetwork,
  sleep,
  stableStringify,
  trimString,
} from '../platform/core.js';
import { CircuitBreaker } from '../platform/circuit-breaker.js';

const PROVIDER_CONFIG_CACHE_TTL_MS = 30_000;
const providerConfigCache = new Map();
const providerResponseCache = new Map();
const providerResponseInFlight = new Map();

// Per-provider circuit breakers
const providerBreakers = new Map();

function getOrCreateBreaker(providerId) {
  const id = normalizeProviderId(providerId);
  if (!providerBreakers.has(id)) {
    providerBreakers.set(
      id,
      new CircuitBreaker(id, {
        failureThreshold: Number(env('MORPHEUS_PROVIDER_FAILURE_THRESHOLD')) || 3,
        resetTimeoutMs: Number(env('MORPHEUS_PROVIDER_RESET_TIMEOUT_MS')) || 60_000,
        halfOpenMax: 1,
      })
    );
  }
  return providerBreakers.get(id);
}

export function getProviderHealth() {
  const result = {};
  for (const [id, breaker] of providerBreakers) {
    result[id] = breaker.getState();
  }
  return result;
}

export const BUILTIN_PROVIDER_CATALOG = [
  {
    id: 'twelvedata',
    category: 'market-data',
    description:
      'Direct TwelveData market data source for shared fetch/query and resource publication lanes. No aggregation, no smoothing.',
    supports: ['oracle', 'datafeed'],
    kernel_supports: ['oracle.fetch', 'feed.publish'],
    auth: 'apikey',
  },
  {
    id: 'binance-spot',
    category: 'market-data',
    description:
      'Direct Binance spot ticker endpoint for shared fetch/query and resource publication lanes. No aggregation, no smoothing.',
    supports: ['oracle', 'datafeed'],
    kernel_supports: ['oracle.fetch', 'feed.publish'],
    auth: 'none',
  },
  {
    id: 'coinbase-spot',
    category: 'market-data',
    description:
      'Direct Coinbase spot price endpoint for shared fetch/query and resource publication lanes. No aggregation, no smoothing.',
    supports: ['oracle', 'datafeed'],
    kernel_supports: ['oracle.fetch', 'feed.publish'],
    auth: 'none',
  },
];

export function listBuiltinProviders() {
  return BUILTIN_PROVIDER_CATALOG;
}

export function normalizeProviderId(value) {
  return trimString(value || '').toLowerCase();
}

const FEED_PROVIDER_PREFIXES = {
  'TWELVEDATA:': 'twelvedata',
  'BINANCE-SPOT:': 'binance-spot',
  'COINBASE-SPOT:': 'coinbase-spot',
};

export function inferProviderIdFromPairSymbol(value) {
  const normalized = trimString(value).toUpperCase();
  const matchedPrefix = Object.keys(FEED_PROVIDER_PREFIXES).find((prefix) =>
    normalized.startsWith(prefix)
  );
  return matchedPrefix ? FEED_PROVIDER_PREFIXES[matchedPrefix] : '';
}

export function stripProviderPrefixFromPairSymbol(value) {
  const normalized = trimString(value).toUpperCase();
  const matchedPrefix = Object.keys(FEED_PROVIDER_PREFIXES).find((prefix) =>
    normalized.startsWith(prefix)
  );
  return matchedPrefix ? normalized.slice(matchedPrefix.length) : normalized;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function coerceProviderParams(value) {
  if (isPlainObject(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (isPlainObject(parsed)) return parsed;
    } catch {
      return {};
    }
  }
  return {};
}

function resolveSupabaseNetwork(value) {
  return normalizeMorpheusNetwork(
    value || env('MORPHEUS_NETWORK') || env('NEXT_PUBLIC_MORPHEUS_NETWORK') || 'testnet'
  );
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

function cloneProviderResult(result) {
  if (!result || typeof result !== 'object') return result;
  return {
    ...result,
    headers:
      result.headers && typeof result.headers === 'object' ? { ...result.headers } : result.headers,
    data:
      result.data && typeof result.data === 'object' ? structuredClone(result.data) : result.data,
    provider_error:
      result.provider_error && typeof result.provider_error === 'object'
        ? { ...result.provider_error }
        : result.provider_error,
  };
}

function resolveProviderResponseCacheTtlMs() {
  const configured = Number(env('MORPHEUS_PROVIDER_RESPONSE_CACHE_TTL_MS'));
  if (!Number.isFinite(configured)) return 1_500;
  return Math.max(Math.trunc(configured), 0);
}

function resolveProviderRetryCount() {
  const configured = Number(env('MORPHEUS_PROVIDER_FETCH_RETRIES'));
  if (!Number.isFinite(configured)) return 0;
  return Math.max(Math.trunc(configured), 0);
}

function resolveRetryAfterMs(headerValue, fallbackMs) {
  const raw = trimString(headerValue);
  if (!raw) return fallbackMs;
  if (/^\d+$/.test(raw)) {
    return Math.min(Math.max(Number(raw) * 1000, 0), 5_000);
  }
  const parsedDate = Date.parse(raw);
  if (Number.isFinite(parsedDate)) {
    return Math.min(Math.max(parsedDate - Date.now(), 0), 5_000);
  }
  return fallbackMs;
}

function resolveProviderRetryDelayMs(attemptIndex, response) {
  const fallback = Math.min(250 * 2 ** Math.max(attemptIndex, 0), 2_000);
  if (!response?.headers) return fallback;
  const retryAfter =
    response.headers instanceof Headers
      ? response.headers.get('retry-after')
      : response.headers['retry-after'];
  return resolveRetryAfterMs(retryAfter, fallback);
}

function isRetryableProviderStatus(status) {
  return [408, 425, 429, 500, 502, 503, 504].includes(Number(status));
}

function isRetryableProviderError(error) {
  const message = trimString(error?.message || '').toLowerCase();
  return (
    message.includes('timed out') ||
    message.includes('network') ||
    message.includes('fetch failed') ||
    message.includes('econnreset') ||
    message.includes('socket hang up')
  );
}

function isCacheableProviderRequest(requestSpec) {
  return (
    trimString(requestSpec?.method || 'GET').toUpperCase() === 'GET' &&
    !requestSpec?.body &&
    trimString(requestSpec?.url) &&
    ['none', 'query', 'apikey', ''].includes(trimString(requestSpec?.auth_mode).toLowerCase())
  );
}

function buildProviderCacheKey(requestSpec) {
  if (!isCacheableProviderRequest(requestSpec)) return '';
  const parsedUrl = new URL(requestSpec.url);
  if (parsedUrl.searchParams.has('apikey')) {
    parsedUrl.searchParams.set('apikey', '__redacted__');
  }
  return stableStringify({
    provider: trimString(requestSpec.provider || ''),
    pair: trimString(requestSpec.pair || ''),
    method: trimString(requestSpec.method || 'GET').toUpperCase(),
    url: parsedUrl.toString(),
    headers: requestSpec.headers || {},
  });
}

export function __resetProviderRuntimeCachesForTests() {
  providerConfigCache.clear();
  providerResponseCache.clear();
  providerResponseInFlight.clear();
}

function resolveProviderResponseMaxBodyBytes() {
  return resolveMaxBytes(env('ORACLE_MAX_PROVIDER_BODY_BYTES'), 64 * 1024, 4096);
}

async function fetchSupabaseRows(table, query) {
  const restConfig = getSupabaseRestConfig();
  if (!restConfig) return null;

  const url = new URL(`${restConfig.restUrl}/${table}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      apikey: restConfig.apiKey,
      authorization: `Bearer ${restConfig.apiKey}`,
      accept: 'application/json',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`supabase ${table} lookup failed: ${response.status} ${text}`.trim());
  }

  const text = await response.text();
  if (!text) return [];
  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}

async function loadProjectProviderConfig(
  projectSlug,
  providerId,
  network = resolveSupabaseNetwork()
) {
  const normalizedProjectSlug = trimString(projectSlug);
  const normalizedProviderId = normalizeProviderId(providerId);
  if (!normalizedProjectSlug || !normalizedProviderId) return null;

  const cacheKey = `${network}:${normalizedProjectSlug}:${normalizedProviderId}`;
  const cached = providerConfigCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const projects = await fetchSupabaseRows('morpheus_projects', {
    select: 'id,slug',
    network: `eq.${network}`,
    slug: `eq.${normalizedProjectSlug}`,
    limit: 1,
  });
  const projectId = Array.isArray(projects) ? projects[0]?.id : null;
  if (!projectId) {
    providerConfigCache.set(cacheKey, {
      expiresAt: Date.now() + PROVIDER_CONFIG_CACHE_TTL_MS,
      value: null,
    });
    return null;
  }

  const configs = await fetchSupabaseRows('morpheus_provider_configs', {
    select: 'provider_id,enabled,config,created_at,updated_at',
    network: `eq.${network}`,
    project_id: `eq.${projectId}`,
    provider_id: `eq.${normalizedProviderId}`,
    limit: 1,
  });
  const value = Array.isArray(configs) ? (configs[0] ?? null) : null;
  providerConfigCache.set(cacheKey, {
    expiresAt: Date.now() + PROVIDER_CONFIG_CACHE_TTL_MS,
    value,
  });
  return value;
}

export async function resolveProviderPayload(payload, options = {}) {
  const fallbackProviderId = normalizeProviderId(options.fallbackProviderId || '');
  const inferredProviderId = normalizeProviderId(
    inferProviderIdFromPairSymbol(
      payload.symbol ||
        payload.pair ||
        (isPlainObject(payload.provider_params) ? payload.provider_params.pair : '') ||
        ''
    )
  );
  const providerId = normalizeProviderId(
    payload.provider ||
      payload.source ||
      payload.provider_id ||
      fallbackProviderId ||
      inferredProviderId
  );
  const projectSlug = trimString(payload.project_slug || options.projectSlug || '');
  const network = resolvePayloadNetwork(payload, resolveSupabaseNetwork(options.network));

  const resolvedPayload = {
    ...payload,
    ...(providerId ? { provider: providerId } : {}),
    ...(projectSlug ? { project_slug: projectSlug } : {}),
    ...(network ? { network } : {}),
    ...(payload.provider_params !== undefined
      ? { provider_params: coerceProviderParams(payload.provider_params) }
      : {}),
  };

  if (!providerId || !projectSlug) {
    return { payload: resolvedPayload, providerConfig: null };
  }

  const providerConfig = await loadProjectProviderConfig(projectSlug, providerId, network);
  if (!providerConfig) {
    return { payload: resolvedPayload, providerConfig: null };
  }

  if (providerConfig.enabled === false) {
    throw new Error(`provider ${providerId} is disabled for project ${projectSlug}`);
  }

  return {
    payload: {
      ...resolvedPayload,
      provider: providerId,
      project_slug: projectSlug,
      provider_params: {
        ...coerceProviderParams(providerConfig.config),
        ...coerceProviderParams(resolvedPayload.provider_params),
      },
    },
    providerConfig,
  };
}

export function pairToTwelveDataSymbol(pair) {
  const normalized = trimString(pair).toUpperCase().replace(/_/g, '-');
  const [base, quote = 'USD'] = normalized.split('-');
  return `${base}/${quote}`;
}

export function pairToBinanceSymbol(pair) {
  const normalized = trimString(pair).toUpperCase().replace(/_/g, '-');
  const [base, quote = 'USD'] = normalized.split('-');
  const quoteSymbol = quote === 'USD' ? 'USDT' : quote;
  return `${base}${quoteSymbol}`;
}

function requireTwelveDataApiKey() {
  const apiKey = env('TWELVEDATA_API_KEY');
  if (!apiKey) throw new Error('TWELVEDATA_API_KEY is not configured');
  return apiKey;
}

function allowUnsafeProviderBaseUrlOverride() {
  const raw = trimString(env('MORPHEUS_ALLOW_UNSAFE_PROVIDER_BASE_URL_OVERRIDE'));
  return raw === '1' || raw.toLowerCase() === 'true' || raw.toLowerCase() === 'yes';
}

export function buildProviderRequest(payload) {
  const symbolCandidate = trimString(
    payload.symbol ||
      payload.pair ||
      (isPlainObject(payload.provider_params) ? payload.provider_params.pair : '') ||
      'NEO-USD'
  );
  const provider = normalizeProviderId(
    payload.provider ||
      payload.source ||
      payload.provider_id ||
      inferProviderIdFromPairSymbol(symbolCandidate)
  );
  if (!provider) return null;

  switch (provider) {
    case 'twelvedata': {
      const params = coerceProviderParams(payload.provider_params);
      const pair =
        stripProviderPrefixFromPairSymbol(
          trimString(payload.symbol || params.pair || 'NEO-USD') || 'NEO-USD'
        ) || 'NEO-USD';
      const explicitSymbol = trimString(params.symbol || payload.provider_symbol || '');
      const sourceSymbol = explicitSymbol || pair;
      const symbol = explicitSymbol
        ? /^[A-Z0-9]+-[A-Z0-9]+$/i.test(explicitSymbol)
          ? pairToTwelveDataSymbol(explicitSymbol)
          : explicitSymbol
        : sourceSymbol.includes('/')
          ? sourceSymbol
          : pairToTwelveDataSymbol(sourceSymbol);
      const endpoint =
        trimString(params.endpoint || payload.provider_endpoint || 'price') || 'price';
      const url = new URL(`https://api.twelvedata.com/${endpoint}`);
      url.searchParams.set('symbol', symbol);
      url.searchParams.set('apikey', requireTwelveDataApiKey());
      for (const [key, value] of Object.entries(params)) {
        if (['symbol', 'endpoint'].includes(key)) continue;
        if (value !== undefined && value !== null && value !== '')
          url.searchParams.set(key, String(value));
      }
      return {
        provider,
        pair,
        method: 'GET',
        url: url.toString(),
        headers: {},
        body: undefined,
        auth_mode: 'query',
      };
    }
    case 'binance-spot': {
      const params = coerceProviderParams(payload.provider_params);
      const pair =
        stripProviderPrefixFromPairSymbol(
          trimString(payload.symbol || params.pair || 'NEO-USD') || 'NEO-USD'
        ) || 'NEO-USD';
      const symbol =
        trimString(params.symbol || payload.provider_symbol || pairToBinanceSymbol(pair)) ||
        pairToBinanceSymbol(pair);
      const requestedBaseUrl = trimString(params.base_url || payload.provider_base_url || '');
      const baseUrl =
        requestedBaseUrl && allowUnsafeProviderBaseUrlOverride()
          ? requestedBaseUrl
          : 'https://api1.binance.com';
      const url = new URL('/api/v3/ticker/price', baseUrl);
      url.searchParams.set('symbol', symbol);
      return {
        provider,
        pair: pair.replace(/_/g, '-').toUpperCase(),
        method: 'GET',
        url: url.toString(),
        headers: {},
        body: undefined,
        auth_mode: 'none',
      };
    }
    case 'coinbase-spot': {
      const params = coerceProviderParams(payload.provider_params);
      const pair =
        stripProviderPrefixFromPairSymbol(
          trimString(payload.symbol || params.symbol || 'NEO-USD') || 'NEO-USD'
        ) || 'NEO-USD';
      const normalized = pair.replace(/_/g, '-').toUpperCase();
      const url = `https://api.coinbase.com/v2/prices/${normalized}/spot`;
      return {
        provider,
        pair: normalized,
        method: 'GET',
        url,
        headers: {},
        body: undefined,
        auth_mode: 'none',
      };
    }
    default:
      throw new Error(`unknown builtin provider: ${provider}`);
  }
}

function detectProviderPayloadError(requestSpec, response, data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;

  const code = Number(data.code);
  const statusText = trimString(data.status || '');
  const message = trimString(data.message || data.error || '');

  if (requestSpec.provider === 'twelvedata') {
    if ((Number.isFinite(code) && code >= 400) || statusText.toLowerCase() === 'error') {
      return {
        status: Number.isFinite(code) && code > 0 ? code : response.status,
        message: message || 'twelvedata provider error',
      };
    }
  }

  if (Array.isArray(data.errors) && data.errors.length > 0) {
    return {
      status: response.status,
      message: trimString(JSON.stringify(data.errors).slice(0, 180)) || 'provider returned errors',
    };
  }

  return null;
}

export async function fetchProviderJSON(requestSpec, timeoutMs = 8000) {
  const providerId = normalizeProviderId(requestSpec.provider || '');
  const breaker = providerId ? getOrCreateBreaker(providerId) : null;
  if (breaker && !breaker.allow()) {
    throw new Error(`provider ${providerId} circuit breaker is open`);
  }

  const cacheKey = buildProviderCacheKey(requestSpec);
  const cacheTtlMs = resolveProviderResponseCacheTtlMs();
  const cached = cacheKey ? providerResponseCache.get(cacheKey) : null;
  if (cached && cached.expiresAt > Date.now()) {
    return cloneProviderResult(cached.value);
  }

  if (cacheKey && providerResponseInFlight.has(cacheKey)) {
    return cloneProviderResult(await providerResponseInFlight.get(cacheKey));
  }

  const execute = async () => {
    const totalAttempts = resolveProviderRetryCount() + 1;
    let lastError;

    for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(new Error(`provider fetch timed out after ${timeoutMs}ms`)),
        timeoutMs
      );

      try {
        const response = await fetch(requestSpec.url, {
          method: requestSpec.method || 'GET',
          headers: requestSpec.headers,
          body: requestSpec.body,
          signal: controller.signal,
        });

        const maxBodyBytes = resolveProviderResponseMaxBodyBytes();
        const text = await (async () => {
          if (!response.body || typeof response.body.getReader !== 'function') {
            const body = await response.text();
            if (Buffer.byteLength(body, 'utf8') > maxBodyBytes) {
              throw new Error(`provider response exceeds max size of ${maxBodyBytes} bytes`);
            }
            return body;
          }
          const reader = response.body.getReader();
          const chunks = [];
          let total = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = Buffer.from(value);
            total += chunk.length;
            if (total > maxBodyBytes) {
              await reader.cancel().catch(() => {});
              throw new Error(`provider response exceeds max size of ${maxBodyBytes} bytes`);
            }
            chunks.push(chunk);
          }
          return Buffer.concat(chunks).toString('utf8');
        })();

        let data = null;
        if (text) {
          try {
            data = JSON.parse(text);
          } catch {
            data = { raw: text };
          }
        }

        const payloadError = detectProviderPayloadError(requestSpec, response, data);
        const result = {
          ok: response.ok && !payloadError,
          status: payloadError?.status || response.status,
          headers: Object.fromEntries(response.headers.entries()),
          text,
          data,
          provider_error: payloadError,
        };

        if (!result.ok && attempt + 1 < totalAttempts && isRetryableProviderStatus(result.status)) {
          await sleep(resolveProviderRetryDelayMs(attempt, result));
          continue;
        }

        return result;
      } catch (error) {
        lastError = error;
        if (attempt + 1 >= totalAttempts || !isRetryableProviderError(error)) {
          if (controller.signal.aborted) {
            throw new Error(`provider fetch timed out after ${timeoutMs}ms`);
          }
          throw error;
        }
        await sleep(resolveProviderRetryDelayMs(attempt));
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastError || new Error('provider fetch failed');
  };

  const promise = execute();
  if (cacheKey) {
    providerResponseInFlight.set(cacheKey, promise);
  }

  try {
    const result = await promise;
    if (cacheKey && cacheTtlMs > 0 && result.ok) {
      providerResponseCache.set(cacheKey, {
        expiresAt: Date.now() + cacheTtlMs,
        value: cloneProviderResult(result),
      });
    }
    if (breaker) {
      if (result.ok) breaker.recordSuccess();
      else breaker.recordFailure();
    }
    return cloneProviderResult(result);
  } catch (error) {
    if (breaker) breaker.recordFailure();
    throw error;
  } finally {
    if (cacheKey) {
      providerResponseInFlight.delete(cacheKey);
    }
  }
}

export async function handleProvidersList() {
  return json(200, { providers: listBuiltinProviders() });
}
