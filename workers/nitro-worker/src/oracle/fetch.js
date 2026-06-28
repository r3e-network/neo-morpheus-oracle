import {
  env,
  getJsonPathValue,
  normalizeHeaders,
  normalizeTargetChain,
  parseBodyMaybe,
  readResponseTextWithLimit,
  resolveMaxBytes,
  trimString,
  cappedDurationMs,
} from '../platform/core.js';
import { assertResolvedHostAllowed } from '../platform/ssrf.js';
import { buildProviderRequest, fetchProviderJSON, resolveProviderPayload } from './providers.js';
import { buildSignedResultEnvelope, buildLaneSignedEnvelope } from '../chain/index.js';
import {
  decryptEncryptedToken,
  executeProgrammableOracle,
  resolveConfidentialPayload,
  resolveEncryptedTokenCiphertext,
} from './crypto.js';

function assertUrlInAllowlist(parsedUrl) {
  const rawAllowlist = env('ORACLE_HTTP_ALLOWLIST');
  if (!rawAllowlist) return;
  const allowlist = rawAllowlist
    .split(',')
    .map((entry) => trimString(entry))
    .filter(Boolean);
  if (allowlist.length === 0) return;
  const allowed = allowlist.some((entry) => {
    let allowedUrl;
    try {
      allowedUrl = new URL(entry);
    } catch {
      return false;
    }
    if (allowedUrl.origin !== parsedUrl.origin) return false;
    const allowedPath = allowedUrl.pathname.replace(/\/+$/, '');
    if (!allowedPath || allowedPath === '/') return true;
    return parsedUrl.pathname === allowedPath || parsedUrl.pathname.startsWith(`${allowedPath}/`);
  });
  if (!allowed) throw new Error('url is not in ORACLE_HTTP_ALLOWLIST');
}

export async function normalizeOracleUrl(rawUrl) {
  const parsedUrl = new URL(trimString(rawUrl));
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('url must use http or https');
  }
  await assertResolvedHostAllowed(parsedUrl.hostname);
  assertUrlInAllowlist(parsedUrl);
  return parsedUrl.toString();
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(`oracle fetch timed out after ${timeoutMs}ms`)),
    timeoutMs
  );
  try {
    return await fetch(url, {
      ...init,
      // The URL is caller-controlled: never follow redirects. The SSRF host
      // checks only ever ran against the original URL, so a 30x Location
      // pointing at a private/metadata address would otherwise be fetched
      // with no re-validation.
      redirect: 'error',
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

function buildUpstreamErrorMessage(source, status, data, rawResponse) {
  const body =
    typeof data === 'string'
      ? data
      : data && typeof data === 'object'
        ? JSON.stringify(data)
        : rawResponse || '';
  const compact = trimString(body).replace(/\s+/g, ' ');
  const detail = compact ? `: ${compact.slice(0, 180)}` : '';
  return `${source} upstream returned HTTP ${status}${detail}`;
}

// D4 — typed error so the oracle.query / oracle.smart-fetch lanes can surface an
// upstream data-source failure as a gateway error (502/504) with a stable,
// machine-readable `kind`, instead of a misleading 400 (which tells the relayer
// the *request* was bad and is non-retryable). A timeout becomes 504; a non-2xx
// upstream / connectivity failure becomes 502.
export class UpstreamFetchError extends Error {
  constructor(message, { httpStatus = 502, kind = 'upstream_error', upstreamStatus = null } = {}) {
    super(message);
    this.name = 'UpstreamFetchError';
    this.httpStatus = httpStatus;
    this.kind = kind;
    this.upstreamStatus = upstreamStatus;
  }
}

function isTimeoutError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /timed out/i.test(message) || error?.name === 'TimeoutError' || error?.name === 'AbortError'
  );
}

// Wrap a raw fetch/transport error (DNS, connection refused, reset, timeout,
// SSRF rejection) into the typed gateway error. SSRF/validation rejections are
// caller-fixable, so they keep 400 semantics; everything else is a gateway fault.
function toUpstreamTransportError(error) {
  if (error instanceof UpstreamFetchError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (/not allowed|must use http|not in ORACLE_HTTP_ALLOWLIST/i.test(message)) {
    return error; // caller-supplied URL problem — leave as a 400-class error
  }
  if (isTimeoutError(error)) {
    return new UpstreamFetchError(message, { httpStatus: 504, kind: 'upstream_timeout' });
  }
  return new UpstreamFetchError(message, { httpStatus: 502, kind: 'upstream_unreachable' });
}

export async function performOracleFetch(payload) {
  const { payload: resolvedPayload } = await resolveProviderPayload(payload, {
    fallbackProviderId: !payload.url && payload.symbol ? 'twelvedata' : undefined,
  });
  const timeoutMs = cappedDurationMs(
    resolvedPayload.oracle_timeout_ms || resolvedPayload.fetch_timeout_ms || env('ORACLE_TIMEOUT'),
    8_000,
    10_000
  );
  const maxBodyBytes = resolveMaxBytes(env('ORACLE_MAX_UPSTREAM_BODY_BYTES'), 256 * 1024, 4096);

  const providerRequest = buildProviderRequest(resolvedPayload);
  if (providerRequest) {
    let response;
    try {
      response = await fetchProviderJSON(providerRequest, timeoutMs);
    } catch (error) {
      throw toUpstreamTransportError(error);
    }
    const data = response.data ?? response.text;
    if (!response.ok) {
      throw new UpstreamFetchError(
        buildUpstreamErrorMessage(providerRequest.provider, response.status, data, response.text),
        {
          httpStatus: response.status === 504 ? 504 : 502,
          kind: 'upstream_http_error',
          upstreamStatus: response.status,
        }
      );
    }
    const selectedValue = getJsonPathValue(data, resolvedPayload.json_path);
    return {
      upstream_status: response.status,
      upstream_headers: response.headers,
      raw_response: response.text,
      data,
      selected_value: selectedValue,
      provider: providerRequest.provider,
      provider_pair: providerRequest.pair,
      encrypted_token_present: false,
    };
  }

  const url = await normalizeOracleUrl(resolvedPayload.url);
  const encryptedTokenCiphertext = await resolveEncryptedTokenCiphertext(resolvedPayload);
  const decryptedToken = await decryptEncryptedToken(encryptedTokenCiphertext, resolvedPayload);
  const headers = normalizeHeaders(resolvedPayload.headers);
  const tokenHeader =
    trimString(resolvedPayload.token_header || 'Authorization') || 'Authorization';
  if (decryptedToken) {
    const tokenPrefix =
      resolvedPayload.token_prefix !== undefined
        ? String(resolvedPayload.token_prefix)
        : tokenHeader.toLowerCase() === 'authorization'
          ? 'Bearer '
          : '';
    headers.set(tokenHeader, `${tokenPrefix}${decryptedToken}`);
  }

  // Re-validate the host right before connecting to limit the DNS-rebinding
  // window between initial validation and the outbound request.
  await assertResolvedHostAllowed(new URL(url).hostname);

  let response;
  try {
    response = await fetchWithTimeout(
      url,
      {
        method: resolvedPayload.method || 'GET',
        headers,
        body: resolvedPayload.body,
      },
      timeoutMs
    );
  } catch (error) {
    throw toUpstreamTransportError(error);
  }

  const rawResponse = await readResponseTextWithLimit(
    response,
    maxBodyBytes,
    'oracle upstream response'
  );
  const responseHeaders = Object.fromEntries(response.headers.entries());
  const data = parseBodyMaybe(rawResponse, response.headers.get('content-type')) ?? rawResponse;
  if (!response.ok) {
    throw new UpstreamFetchError(
      buildUpstreamErrorMessage(url, response.status, data, rawResponse),
      {
        httpStatus: response.status === 504 ? 504 : 502,
        kind: 'upstream_http_error',
        upstreamStatus: response.status,
      }
    );
  }
  const selectedValue = getJsonPathValue(data, resolvedPayload.json_path);

  return {
    upstream_status: response.status,
    upstream_headers: responseHeaders,
    raw_response: rawResponse,
    data,
    selected_value: selectedValue,
    provider: null,
    provider_pair: null,
    encrypted_token_present: Boolean(decryptedToken),
  };
}

export async function buildOracleResponse(payload, mode) {
  const resolvedPayload = await resolveConfidentialPayload(payload);
  const targetChain = normalizeTargetChain(resolvedPayload.target_chain);
  const fetchResult = await performOracleFetch(resolvedPayload);
  const context = {
    ...fetchResult,
    target_chain: targetChain,
    target_chain_id: resolvedPayload.target_chain_id
      ? String(resolvedPayload.target_chain_id)
      : null,
    request_source:
      trimString(resolvedPayload.request_source || 'chain-dispatcher') || 'chain-dispatcher',
    encrypted_token_present: Boolean(fetchResult.encrypted_token_present),
  };
  const executed = await executeProgrammableOracle(resolvedPayload, context);

  const derived = {
    target_chain: context.target_chain,
    target_chain_id: context.target_chain_id,
    request_source: context.request_source,
    result: executed.result,
    extracted_value: fetchResult.selected_value ?? null,
    upstream_status: fetchResult.upstream_status,
  };
  const signed = await buildSignedResultEnvelope(derived, resolvedPayload);

  if (mode === 'query') {
    return {
      mode: executed.executed ? 'fetch+compute' : 'fetch',
      request_source: context.request_source,
      target_chain: context.target_chain,
      target_chain_id: context.target_chain_id,
      status_code: fetchResult.upstream_status,
      headers: fetchResult.upstream_headers,
      body: fetchResult.raw_response,
      body_json: typeof fetchResult.data === 'string' ? null : fetchResult.data,
      extracted_value: fetchResult.selected_value ?? null,
      result: executed.result,
      // D5 canonical signed-result envelope — single-sourced.
      ...buildLaneSignedEnvelope(signed),
    };
  }

  return {
    mode: executed.executed ? 'fetch+compute' : 'fetch',
    request_source: context.request_source,
    target_chain: context.target_chain,
    target_chain_id: context.target_chain_id,
    upstream_status: fetchResult.upstream_status,
    result: executed.result,
    extracted_value: fetchResult.selected_value ?? null,
    // D5 canonical signed-result envelope — single-sourced.
    ...buildLaneSignedEnvelope(signed),
  };
}
