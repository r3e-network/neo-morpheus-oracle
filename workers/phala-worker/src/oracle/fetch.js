import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
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

// --- Security: SSRF-safe IP classification for the oracle HTTP fetch path ---
// String-prefix host checks are bypassable via DNS rebinding, octal/hex/decimal
// IPv4 literals, and IPv6 forms, so the hostname is resolved to concrete IPs and
// every address is range-checked. Returns true when an address must be rejected.
function isBlockedIpAddress(rawAddress) {
  let address = trimString(rawAddress).toLowerCase();
  if (!address) return true;
  // Strip an IPv6 zone identifier (e.g. fe80::1%eth0) before classification.
  const zoneIndex = address.indexOf('%');
  if (zoneIndex !== -1) address = address.slice(0, zoneIndex);

  const family = isIP(address);
  if (family === 4) return isBlockedIpv4(address);
  if (family === 6) return isBlockedIpv6(address);
  // Not a parseable IP literal: treat as unsafe rather than guessing.
  return true;
}

function isBlockedIpv4(address) {
  const octets = address.split('.').map((part) => Number.parseInt(part, 10));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b] = octets;
  return (
    a === 0 || // "this" network / 0.0.0.0
    a === 127 || // loopback 127.0.0.0/8
    a === 10 || // private 10.0.0.0/8
    (a === 172 && b >= 16 && b <= 31) || // private 172.16.0.0/12
    (a === 192 && b === 168) || // private 192.168.0.0/16
    (a === 169 && b === 254) || // link-local 169.254.0.0/16 (incl. cloud metadata)
    (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64.0.0/10
    a >= 224 // multicast 224.0.0.0/4 + reserved 240.0.0.0/4 + 255.255.255.255
  );
}

// Expands a (node:net-validated) IPv6 literal into 8 numeric hextets, decoding
// any trailing dotted-decimal IPv4 (e.g. ::ffff:127.0.0.1) into two hextets.
function expandIpv6(address) {
  let value = address;
  const trailingV4 = value.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (trailingV4) {
    const parts = trailingV4[1].split('.').map((part) => Number.parseInt(part, 10));
    if (parts.length === 4 && parts.every((part) => part >= 0 && part <= 255)) {
      const hi = ((parts[0] << 8) | parts[1]).toString(16);
      const lo = ((parts[2] << 8) | parts[3]).toString(16);
      value = value.slice(0, trailingV4.index) + `${hi}:${lo}`;
    }
  }
  const [head, tail] = value.split('::');
  const headGroups = head ? head.split(':').filter(Boolean) : [];
  const tailGroups = tail !== undefined ? tail.split(':').filter(Boolean) : [];
  const missing = 8 - headGroups.length - tailGroups.length;
  const groups =
    tail === undefined
      ? headGroups
      : [...headGroups, ...new Array(Math.max(missing, 0)).fill('0'), ...tailGroups];
  if (groups.length !== 8) return null;
  return groups.map((group) => Number.parseInt(group || '0', 16));
}

function isBlockedIpv6(address) {
  const groups = expandIpv6(address);
  if (!groups || groups.some((group) => !Number.isInteger(group) || group < 0 || group > 0xffff)) {
    return true;
  }
  // IPv4-mapped (::ffff:0:0/96), IPv4-compatible (::/96) and NAT64 (64:ff9b::/96)
  // tunnel an IPv4 address in the low 32 bits — classify on the embedded IPv4.
  const isV4Mapped =
    groups[0] === 0 &&
    groups[1] === 0 &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    (groups[5] === 0 || groups[5] === 0xffff);
  const isNat64 = groups[0] === 0x64 && groups[1] === 0xff9b;
  if (isV4Mapped || isNat64) {
    const a = groups[6] >> 8;
    const b = groups[6] & 0xff;
    const c = groups[7] >> 8;
    const d = groups[7] & 0xff;
    // Bare ::ffff:0:0 / :: with no embedded host is itself unroutable.
    if (groups[6] === 0 && groups[7] === 0) return true;
    return isBlockedIpv4(`${a}.${b}.${c}.${d}`);
  }
  const first = groups[0];
  return (
    groups.every((group) => group === 0) || // :: unspecified
    (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) || // ::1 loopback
    (first & 0xffc0) === 0xfe80 || // link-local fe80::/10
    (first & 0xffc0) === 0xfec0 || // deprecated site-local fec0::/10
    (first & 0xfe00) === 0xfc00 || // unique local address (ULA) fc00::/7
    (first & 0xff00) === 0xff00 // multicast ff00::/8
  );
}

// Resolves the hostname and rejects when the literal host or any resolved
// address falls inside a private/loopback/link-local/ULA range. Used both at
// validation time and immediately before the fetch to limit DNS rebinding.
async function assertResolvedHostAllowed(hostname) {
  const host = trimString(hostname).toLowerCase();
  const literalHost = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;

  if (host === 'localhost' || host === '0.0.0.0' || host.endsWith('.local')) {
    throw new Error('private/internal URLs not allowed');
  }

  // Reject IP literals (octal/hex/decimal IPv4, IPv6) without a DNS round trip.
  if (isIP(literalHost) !== 0) {
    if (isBlockedIpAddress(literalHost)) {
      throw new Error('private/internal URLs not allowed');
    }
    return;
  }

  // Resolve through getaddrinfo (the same path the outbound fetch uses), which
  // also normalizes octal/hex/decimal IPv4 literals, then reject any private
  // address. A resolution failure is not hard-blocked here: the host could not
  // be connected to either, so the subsequent fetch fails on its own and we
  // avoid coupling validation to transient DNS/network availability.
  let records;
  try {
    records = await dnsLookup(literalHost, { all: true, verbatim: true });
  } catch {
    return;
  }
  if (!Array.isArray(records)) return;
  for (const record of records) {
    if (isBlockedIpAddress(record?.address)) {
      throw new Error('private/internal URLs not allowed');
    }
  }
}

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
    8_000,
    10_000
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
