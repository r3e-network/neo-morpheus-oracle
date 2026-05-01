import {
  env,
  getJsonPathValue,
  normalizeHeaders,
  normalizeTargetChain,
  parseBodyMaybe,
  parseDurationMs,
  resolveMaxBytes,
  trimString,
  cappedDurationMs,
} from '../platform/core.js';
import { buildProviderRequest, fetchProviderJSON, resolveProviderPayload } from './providers.js';
import { buildSignedResultEnvelope, buildVerificationEnvelope } from '../chain/index.js';
import {
  decryptEncryptedToken,
  executeProgrammableOracle,
  resolveConfidentialPayload,
  resolveEncryptedTokenCiphertext,
} from './crypto.js';
import { maybeBuildDstackAttestation } from '../platform/dstack.js';

export function normalizeOracleUrl(rawUrl) {
  const parsedUrl = new URL(trimString(rawUrl));
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('url must use http or https');
  }
  const host = parsedUrl.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '[::1]' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    host === '169.254.169.254' ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    throw new Error('private/internal URLs not allowed');
  }

  const rawAllowlist = env('ORACLE_HTTP_ALLOWLIST');
  if (rawAllowlist) {
    const allowlist = rawAllowlist
      .split(',')
      .map((entry) => trimString(entry))
      .filter(Boolean);
    if (allowlist.length > 0) {
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
        return (
          parsedUrl.pathname === allowedPath || parsedUrl.pathname.startsWith(`${allowedPath}/`)
        );
      });
      if (!allowed) throw new Error('url is not in ORACLE_HTTP_ALLOWLIST');
    }
  }

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

async function readResponseTextWithLimit(response, maxBytes, label) {
  if (!response.body || typeof response.body.getReader !== 'function') {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
      throw new Error(`${label} exceeds max size of ${maxBytes} bytes`);
    }
    return text;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = Buffer.from(value);
    total += chunk.length;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error(`${label} exceeds max size of ${maxBytes} bytes`);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
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

export async function performOracleFetch(payload) {
  const { payload: resolvedPayload } = await resolveProviderPayload(payload, {
    fallbackProviderId: !payload.url && payload.symbol ? 'twelvedata' : undefined,
  });
  const timeoutMs = cappedDurationMs(
    resolvedPayload.oracle_timeout_ms || resolvedPayload.fetch_timeout_ms || env('ORACLE_TIMEOUT'),
    20000,
    30_000
  );
  const maxBodyBytes = resolveMaxBytes(env('ORACLE_MAX_UPSTREAM_BODY_BYTES'), 256 * 1024, 4096);

  const providerRequest = buildProviderRequest(resolvedPayload);
  if (providerRequest) {
    const response = await fetchProviderJSON(providerRequest, timeoutMs);
    const data = response.data ?? response.text;
    if (!response.ok) {
      throw new Error(
        buildUpstreamErrorMessage(providerRequest.provider, response.status, data, response.text)
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

  const url = normalizeOracleUrl(resolvedPayload.url);
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

  const response = await fetchWithTimeout(
    url,
    {
      method: resolvedPayload.method || 'GET',
      headers,
      body: resolvedPayload.body,
    },
    timeoutMs
  );

  const rawResponse = await readResponseTextWithLimit(
    response,
    maxBodyBytes,
    'oracle upstream response'
  );
  const responseHeaders = Object.fromEntries(response.headers.entries());
  const data = parseBodyMaybe(rawResponse, response.headers.get('content-type')) ?? rawResponse;
  if (!response.ok) {
    throw new Error(buildUpstreamErrorMessage(url, response.status, data, rawResponse));
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
    const teeAttestation = await maybeBuildDstackAttestation(resolvedPayload, derived);
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
      output_hash: signed.output_hash,
      signature: signed.signature,
      public_key: signed.public_key,
      attestation_hash: signed.attestation_hash,
      tee_attestation: teeAttestation,
      verification: buildVerificationEnvelope(signed, teeAttestation),
    };
  }

  const teeAttestation = await maybeBuildDstackAttestation(resolvedPayload, derived);
  return {
    mode: executed.executed ? 'fetch+compute' : 'fetch',
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
    tee_attestation: teeAttestation,
    verification: buildVerificationEnvelope(signed, teeAttestation),
  };
}
