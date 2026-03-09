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

function getSupabaseRestConfig() {
  const baseUrl = trimString(env("SUPABASE_URL") || env("NEXT_PUBLIC_SUPABASE_URL") || env("morpheus_SUPABASE_URL") || "");
  const apiKey = trimString(
    env("SUPABASE_SERVICE_ROLE_KEY")
      || env("morpheus_SUPABASE_SERVICE_ROLE_KEY")
      || env("SUPABASE_SERVICE_KEY")
      || env("SUPABASE_SECRET_KEY")
      || env("morpheus_SUPABASE_SECRET_KEY")
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

async function loadProjectProviderConfig(projectSlug, providerId) {
  const normalizedProjectSlug = trimString(projectSlug);
  const normalizedProviderId = normalizeProviderId(providerId);
  if (!normalizedProjectSlug || !normalizedProviderId) return null;

  const cacheKey = `${normalizedProjectSlug}:${normalizedProviderId}`;
  const cached = providerConfigCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const projects = await fetchSupabaseRows("morpheus_projects", {
    select: "id,slug",
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
  const providerId = normalizeProviderId(payload.provider || payload.source || payload.provider_id || fallbackProviderId);
  const projectSlug = trimString(payload.project_slug || options.projectSlug || "");

  const resolvedPayload = {
    ...payload,
    ...(providerId ? { provider: providerId } : {}),
    ...(projectSlug ? { project_slug: projectSlug } : {}),
    ...(payload.provider_params !== undefined ? { provider_params: coerceProviderParams(payload.provider_params) } : {}),
  };

  if (!providerId || !projectSlug) {
    return { payload: resolvedPayload, providerConfig: null };
  }

  const providerConfig = await loadProjectProviderConfig(projectSlug, providerId);
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

function requireTwelveDataApiKey() {
  const apiKey = env("TWELVEDATA_API_KEY");
  if (!apiKey) throw new Error("TWELVEDATA_API_KEY is not configured");
  return apiKey;
}

export function buildProviderRequest(payload) {
  const provider = normalizeProviderId(payload.provider || payload.source || payload.provider_id);
  if (!provider) return null;

  switch (provider) {
    case "twelvedata": {
      const params = coerceProviderParams(payload.provider_params);
      const pair = trimString(payload.symbol || params.symbol || "NEO-USD") || "NEO-USD";
      const symbol = pairToTwelveDataSymbol(pair);
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
    case "coinbase-spot": {
      const params = coerceProviderParams(payload.provider_params);
      const pair = trimString(payload.symbol || params.symbol || "NEO-USD") || "NEO-USD";
      const normalized = pair.replace(/_/g, "-").toUpperCase();
      const url = `https://api.coinbase.com/v2/prices/${normalized}/spot`;
      return { provider, pair: normalized, method: "GET", url, headers: {}, body: undefined, auth_mode: "none" };
    }
    default:
      throw new Error(`unknown builtin provider: ${provider}`);
  }
}

export async function fetchProviderJSON(requestSpec, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`provider fetch timed out after ${timeoutMs}ms`)), timeoutMs);
  let response;
  try {
    response = await fetch(requestSpec.url, {
      method: requestSpec.method || "GET",
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
  return {
    ok: response.ok,
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    text,
    data,
  };
}

export async function handleProvidersList() {
  return json(200, { providers: listBuiltinProviders() });
}
