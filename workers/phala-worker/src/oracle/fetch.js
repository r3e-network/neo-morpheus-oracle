import {
  env,
  getJsonPathValue,
  normalizeHeaders,
  normalizeTargetChain,
  parseBodyMaybe,
  parseDurationMs,
  trimString,
} from "../platform/core.js";
import { buildProviderRequest, fetchProviderJSON, resolveProviderPayload } from "./providers.js";
import { buildSignedResultEnvelope } from "../chain/index.js";
import { decryptEncryptedToken, executeProgrammableOracle, resolveEncryptedPayload } from "./crypto.js";

export function normalizeOracleUrl(rawUrl) {
  const parsedUrl = new URL(trimString(rawUrl));
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("url must use http or https");
  }
  const host = parsedUrl.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "[::1]" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    host === "169.254.169.254" ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    throw new Error("private/internal URLs not allowed");
  }

  const rawAllowlist = env("ORACLE_HTTP_ALLOWLIST");
  if (rawAllowlist) {
    const allowlist = rawAllowlist.split(",").map((entry) => trimString(entry)).filter(Boolean);
    if (allowlist.length > 0) {
      const allowed = allowlist.some((entry) => parsedUrl.href.startsWith(entry) || parsedUrl.origin === entry.replace(/\/$/, ""));
      if (!allowed) throw new Error("url is not in ORACLE_HTTP_ALLOWLIST");
    }
  }

  return parsedUrl.toString();
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`oracle fetch timed out after ${timeoutMs}ms`)), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`oracle fetch timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function performOracleFetch(payload) {
  const { payload: resolvedPayload } = await resolveProviderPayload(payload, {
    fallbackProviderId: !payload.url && payload.symbol ? "twelvedata" : undefined,
  });
  const timeoutMs = parseDurationMs(
    resolvedPayload.oracle_timeout_ms || resolvedPayload.fetch_timeout_ms || env("ORACLE_TIMEOUT"),
    20000,
  );

  const providerRequest = buildProviderRequest(resolvedPayload);
  if (providerRequest) {
    const response = await fetchProviderJSON(providerRequest, timeoutMs);
    const data = response.data ?? response.text;
    const selectedValue = getJsonPathValue(data, resolvedPayload.json_path);
    return {
      upstream_status: response.status,
      upstream_headers: response.headers,
      raw_response: response.text,
      data,
      selected_value: selectedValue,
      provider: providerRequest.provider,
      provider_pair: providerRequest.pair,
    };
  }

  const url = normalizeOracleUrl(resolvedPayload.url);
  const decryptedToken = await decryptEncryptedToken(resolveEncryptedPayload(resolvedPayload));
  const headers = normalizeHeaders(resolvedPayload.headers);
  const tokenHeader = trimString(resolvedPayload.token_header || "Authorization") || "Authorization";
  if (decryptedToken) {
    const tokenPrefix = resolvedPayload.token_prefix !== undefined
      ? String(resolvedPayload.token_prefix)
      : tokenHeader.toLowerCase() === "authorization"
        ? "Bearer "
        : "";
    headers.set(tokenHeader, `${tokenPrefix}${decryptedToken}`);
  }

  const response = await fetchWithTimeout(url, {
    method: resolvedPayload.method || "GET",
    headers,
    body: resolvedPayload.body,
  }, timeoutMs);

  const rawResponse = await response.text();
  const responseHeaders = Object.fromEntries(response.headers.entries());
  const data = parseBodyMaybe(rawResponse, response.headers.get("content-type")) ?? rawResponse;
  const selectedValue = getJsonPathValue(data, resolvedPayload.json_path);

  return {
    upstream_status: response.status,
    upstream_headers: responseHeaders,
    raw_response: rawResponse,
    data,
    selected_value: selectedValue,
    provider: null,
    provider_pair: null,
  };
}

export async function buildOracleResponse(payload, mode) {
  const targetChain = normalizeTargetChain(payload.target_chain);
  const fetchResult = await performOracleFetch(payload);
  const context = {
    ...fetchResult,
    target_chain: targetChain,
    target_chain_id: payload.target_chain_id ? String(payload.target_chain_id) : null,
    request_source: trimString(payload.request_source || "chain-dispatcher") || "chain-dispatcher",
    encrypted_token_present: Boolean(resolveEncryptedPayload(payload)),
  };
  const executed = await executeProgrammableOracle(payload, context);

  const derived = {
    target_chain: context.target_chain,
    target_chain_id: context.target_chain_id,
    request_source: context.request_source,
    result: executed.result,
    extracted_value: fetchResult.selected_value ?? null,
    upstream_status: fetchResult.upstream_status,
  };
  const signed = buildSignedResultEnvelope(derived);

  if (mode === "query") {
    return {
      mode: executed.executed ? "fetch+compute" : "fetch",
      request_source: context.request_source,
      target_chain: context.target_chain,
      target_chain_id: context.target_chain_id,
      status_code: fetchResult.upstream_status,
      headers: fetchResult.upstream_headers,
      body: fetchResult.raw_response,
      body_json: typeof fetchResult.data === "string" ? null : fetchResult.data,
      extracted_value: fetchResult.selected_value ?? null,
      result: executed.result,
      output_hash: signed.output_hash,
      signature: signed.signature,
      public_key: signed.public_key,
      attestation_hash: signed.attestation_hash,
    };
  }

  return {
    mode: executed.executed ? "fetch+compute" : "fetch",
    request_source: context.request_source,
    target_chain: context.target_chain,
    target_chain_id: context.target_chain_id,
    upstream_status: fetchResult.upstream_status,
    result: executed.result,
    extracted_value: fetchResult.selected_value ?? null,
    output_hash: signed.output_hash,
    signature: signed.signature,
    public_key: signed.public_key,
    attestation_hash: signed.attestation_hash,
  };
}
