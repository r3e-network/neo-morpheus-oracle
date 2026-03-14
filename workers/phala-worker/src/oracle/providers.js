import { env, json, trimString } from "../platform/core.js";

const PROVIDER_CONFIG_CACHE_TTL_MS = 30_000;
const providerConfigCache = new Map();

export const BUILTIN_PROVIDER_CATALOG = [
  {
    id: "twelvedata",
    category: "market-data",
    description: "Direct TwelveData market data source. No aggregation, no smoothing.",
    supports: ["oracle", "datafeed"],
    auth: "apikey",
  },
  {
    id: "binance-spot",
    category: "market-data",
    description: "Direct Binance spot ticker endpoint. No aggregation, no smoothing.",
    supports: ["oracle", "datafeed"],
    auth: "none",
  },
  {
    id: "coinbase-spot",
    category: "market-data",
    description: "Direct Coinbase spot price endpoint. No aggregation, no smoothing.",
    supports: ["oracle", "datafeed"],
    auth: "none",
  },
];

export function listBuiltinProviders() {
  return BUILTIN_PROVIDER_CATALOG;
}

export function normalizeProviderId(value) {
  return trimString(value || "").toLowerCase();
}

const FEED_PROVIDER_PREFIXES = {
  "TWELVEDATA:": "twelvedata",
  "BINANCE-SPOT:": "binance-spot",
  "COINBASE-SPOT:": "coinbase-spot",
};

export function inferProviderIdFromPairSymbol(value) {
  const normalized = trimString(value).toUpperCase();
  const matchedPrefix = Object.keys(FEED_PROVIDER_PREFIXES).find((prefix) => normalized.startsWith(prefix));
  return matchedPrefix ? FEED_PROVIDER_PREFIXES[matchedPrefix] : "";
}

export function stripProviderPrefixFromPairSymbol(value) {
  const normalized = trimString(value).toUpperCase();
  const matchedPrefix = Object.keys(FEED_PROVIDER_PREFIXES).find((prefix) => normalized.startsWith(prefix));
  return matchedPrefix ? normalized.slice(matchedPrefix.length) : normalized;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function coerceProviderParams(value) {
  if (isPlainObject(value)) return value;
  if (typeof value === "string") {
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
  return trimString(value || env("MORPHEUS_NETWORK") || env("NEXT_PUBLIC_MORPHEUS_NETWORK") || "testnet") === "mainnet"
    ? "mainnet"
    : "testnet";
}

function getSupabaseRestConfig() {
  const baseUrl = trimString(env("SUPABASE_URL") || env("NEXT_PUBLIC_SUPABASE_URL") || env("morpheus_SUPABASE_URL") || "");
  const apiKey = trimString(
    env("SUPABASE_SECRET_KEY")
      || env("morpheus_SUPABASE_SECRET_KEY")
      || env("SUPABASE_SERVICE_ROLE_KEY")
      || env("morpheus_SUPABASE_SERVICE_ROLE_KEY")
      || env("SUPABASE_SERVICE_KEY")
      || "",
  );
  if (!baseUrl || !apiKey) return null;
  return {
    restUrl: `${baseUrl.replace(/\/$/, "")}/rest/v1`,
    apiKey,
  };
}

async function fetchSupabaseRows(table, query) {
  const restConfig = getSupabaseRestConfig();
  if (!restConfig) return null;

  const url = new URL(`${restConfig.restUrl}/${table}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      apikey: restConfig.apiKey,
      authorization: `Bearer ${restConfig.apiKey}`,
      accept: "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
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

async function loadProjectProviderConfig(projectSlug, providerId, network = resolveSupabaseNetwork()) {
  const normalizedProjectSlug = trimString(projectSlug);
  const normalizedProviderId = normalizeProviderId(providerId);
  if (!normalizedProjectSlug || !normalizedProviderId) return null;

  const cacheKey = `${network}:${normalizedProjectSlug}:${normalizedProviderId}`;
  const cached = providerConfigCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const projects = await fetchSupabaseRows("morpheus_projects", {
    select: "id,slug",
    network: `eq.${network}`,
    slug: `eq.${normalizedProjectSlug}`,
    limit: 1,
  });
  const projectId = Array.isArray(projects) ? projects[0]?.id : null;
  if (!projectId) {
    providerConfigCache.set(cacheKey, { expiresAt: Date.now() + PROVIDER_CONFIG_CACHE_TTL_MS, value: null });
    return null;
  }

  const configs = await fetchSupabaseRows("morpheus_provider_configs", {
    select: "provider_id,enabled,config,created_at,updated_at",
    network: `eq.${network}`,
    project_id: `eq.${projectId}`,
    provider_id: `eq.${normalizedProviderId}`,
    limit: 1,
  });
  const value = Array.isArray(configs) ? (configs[0] ?? null) : null;
  providerConfigCache.set(cacheKey, { expiresAt: Date.now() + PROVIDER_CONFIG_CACHE_TTL_MS, value });
  return value;
}

export async function resolveProviderPayload(payload, options = {}) {
  const fallbackProviderId = normalizeProviderId(options.fallbackProviderId || "");
  const inferredProviderId = normalizeProviderId(inferProviderIdFromPairSymbol(
    payload.symbol
      || payload.pair
      || (isPlainObject(payload.provider_params) ? payload.provider_params.pair : "")
      || "",
  ));
  const providerId = normalizeProviderId(payload.provider || payload.source || payload.provider_id || fallbackProviderId || inferredProviderId);
  const projectSlug = trimString(payload.project_slug || options.projectSlug || "");
  const network = resolveSupabaseNetwork(payload.network || options.network);

  const resolvedPayload = {
    ...payload,
    ...(providerId ? { provider: providerId } : {}),
    ...(projectSlug ? { project_slug: projectSlug } : {}),
    ...(network ? { network } : {}),
    ...(payload.provider_params !== undefined ? { provider_params: coerceProviderParams(payload.provider_params) } : {}),
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
  const normalized = trimString(pair).toUpperCase().replace(/_/g, "-");
  const [base, quote = "USD"] = normalized.split("-");
  return `${base}/${quote}`;
}

export function pairToBinanceSymbol(pair) {
  const normalized = trimString(pair).toUpperCase().replace(/_/g, "-");
  const [base, quote = 'USD'] = normalized.split('-');
  const quoteSymbol = quote === 'USD' ? 'USDT' : quote;
  return `${base}${quoteSymbol}`;
}

function requireTwelveDataApiKey() {
  const apiKey = env("TWELVEDATA_API_KEY");
  if (!apiKey) throw new Error("TWELVEDATA_API_KEY is not configured");
  return apiKey;
}

function allowUnsafeProviderBaseUrlOverride() {
  const raw = trimString(env("MORPHEUS_ALLOW_UNSAFE_PROVIDER_BASE_URL_OVERRIDE"));
  return raw === "1" || raw.toLowerCase() === "true" || raw.toLowerCase() === "yes";
}

export function buildProviderRequest(payload) {
  const symbolCandidate = trimString(
    payload.symbol
      || payload.pair
      || (isPlainObject(payload.provider_params) ? payload.provider_params.pair : "")
      || "NEO-USD",
  );
  const provider = normalizeProviderId(payload.provider || payload.source || payload.provider_id || inferProviderIdFromPairSymbol(symbolCandidate));
  if (!provider) return null;

  switch (provider) {
    case "twelvedata": {
      const params = coerceProviderParams(payload.provider_params);
      const pair = stripProviderPrefixFromPairSymbol(trimString(payload.symbol || params.pair || "NEO-USD") || "NEO-USD") || "NEO-USD";
      const explicitSymbol = trimString(params.symbol || payload.provider_symbol || "");
      const sourceSymbol = explicitSymbol || pair;
      const symbol = explicitSymbol
        ? (/^[A-Z0-9]+-[A-Z0-9]+$/i.test(explicitSymbol) ? pairToTwelveDataSymbol(explicitSymbol) : explicitSymbol)
        : (sourceSymbol.includes("/") ? sourceSymbol : pairToTwelveDataSymbol(sourceSymbol));
      const endpoint = trimString(params.endpoint || payload.provider_endpoint || "price") || "price";
      const url = new URL(`https://api.twelvedata.com/${endpoint}`);
      url.searchParams.set("symbol", symbol);
      url.searchParams.set("apikey", requireTwelveDataApiKey());
      for (const [key, value] of Object.entries(params)) {
        if (["symbol", "endpoint"].includes(key)) continue;
        if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
      }
      return { provider, pair, method: "GET", url: url.toString(), headers: {}, body: undefined, auth_mode: "query" };
    }
    case "binance-spot": {
      const params = coerceProviderParams(payload.provider_params);
      const pair = stripProviderPrefixFromPairSymbol(trimString(payload.symbol || params.pair || "NEO-USD") || "NEO-USD") || "NEO-USD";
      const symbol = trimString(params.symbol || payload.provider_symbol || pairToBinanceSymbol(pair)) || pairToBinanceSymbol(pair);
      const requestedBaseUrl = trimString(params.base_url || payload.provider_base_url || "");
      const baseUrl = requestedBaseUrl && allowUnsafeProviderBaseUrlOverride()
        ? requestedBaseUrl
        : "https://api1.binance.com";
      const url = new URL('/api/v3/ticker/price', baseUrl);
      url.searchParams.set('symbol', symbol);
      return { provider, pair: pair.replace(/_/g, '-').toUpperCase(), method: 'GET', url: url.toString(), headers: {}, body: undefined, auth_mode: 'none' };
    }
    case "coinbase-spot": {
      const params = coerceProviderParams(payload.provider_params);
      const pair = stripProviderPrefixFromPairSymbol(trimString(payload.symbol || params.symbol || "NEO-USD") || "NEO-USD") || "NEO-USD";
      const normalized = pair.replace(/_/g, "-").toUpperCase();
      const url = `https://api.coinbase.com/v2/prices/${normalized}/spot`;
      return { provider, pair: normalized, method: "GET", url, headers: {}, body: undefined, auth_mode: "none" };
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

export async function fetchProviderJSON(requestSpec, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`provider fetch timed out after ${timeoutMs}ms`)), timeoutMs);
  let response;
  try {
    response = await fetch(requestSpec.url, {
      method: requestSpec.method || 'GET',
      headers: requestSpec.headers,
      body: requestSpec.body,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`provider fetch timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  const payloadError = detectProviderPayloadError(requestSpec, response, data);
  return {
    ok: response.ok && !payloadError,
    status: payloadError?.status || response.status,
    headers: Object.fromEntries(response.headers.entries()),
    text,
    data,
    provider_error: payloadError,
  };
}

export async function handleProvidersList() {
  return json(200, { providers: listBuiltinProviders() });
}
