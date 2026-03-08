import { env, json, trimString } from "../platform/core.js";

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
      const params = payload.provider_params && typeof payload.provider_params === "object" ? payload.provider_params : {};
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
      const params = payload.provider_params && typeof payload.provider_params === "object" ? payload.provider_params : {};
      const pair = trimString(payload.symbol || params.symbol || "NEO-USD") || "NEO-USD";
      const normalized = pair.replace(/_/g, "-").toUpperCase();
      const url = `https://api.coinbase.com/v2/prices/${normalized}/spot`;
      return { provider, pair: normalized, method: "GET", url, headers: {}, body: undefined, auth_mode: "none" };
    }
    default:
      throw new Error(`unknown builtin provider: ${provider}`);
  }
}

export async function fetchProviderJSON(requestSpec) {
  const response = await fetch(requestSpec.url, {
    method: requestSpec.method || "GET",
    headers: requestSpec.headers,
    body: requestSpec.body,
  });
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
