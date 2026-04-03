import { createHash } from 'node:crypto';

export const SUPPORTED_ORACLE_TARGET_CHAINS = new Set(['neo_n3', 'neo_x']);
export const DEFAULT_NEO_NETWORK_MAGIC = 894710606;
export const DEFAULT_WAIT_TIMEOUT_MS = 120000;
export const DEFAULT_POLL_INTERVAL_MS = 2000;
export const REPLAY_WINDOW_MS = 10 * 60 * 1000;

export const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

let runtimeConfigCache;
const runtimeConfigByNetworkCache = new Map();

function getRuntimeConfig() {
  if (runtimeConfigCache !== undefined) return runtimeConfigCache;
  const raw = String(process.env.MORPHEUS_RUNTIME_CONFIG_JSON || '').trim();
  if (!raw) {
    runtimeConfigCache = {};
    return runtimeConfigCache;
  }
  try {
    runtimeConfigCache = JSON.parse(raw);
  } catch {
    runtimeConfigCache = {};
  }
  return runtimeConfigCache;
}

function parseRuntimeConfigJson(raw) {
  const text = String(raw || '').trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function getRuntimeConfigForNetwork(network) {
  const normalizedNetwork =
    String(network || '')
      .trim()
      .toLowerCase() === 'mainnet'
      ? 'mainnet'
      : 'testnet';
  if (runtimeConfigByNetworkCache.has(normalizedNetwork)) {
    return runtimeConfigByNetworkCache.get(normalizedNetwork);
  }
  const upper = normalizedNetwork.toUpperCase();
  const parsed = parseRuntimeConfigJson(
    process.env[`${upper}_RUNTIME_CONFIG_JSON`] ||
      process.env[`MORPHEUS_${upper}_RUNTIME_CONFIG_JSON`] ||
      ''
  );
  runtimeConfigByNetworkCache.set(normalizedNetwork, parsed);
  return parsed;
}

export function env(...names) {
  const runtimeConfig = getRuntimeConfig();
  for (const name of names) {
    const value = String(process.env[name] || runtimeConfig[name] || '').trim();
    if (value) return value;
  }
  return '';
}

export function normalizeMorpheusNetwork(value, fallback = 'testnet') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (normalized === 'mainnet' || normalized === 'testnet') return normalized;
  return fallback === 'mainnet' ? 'mainnet' : 'testnet';
}

export function resolvePayloadNetwork(payload = {}, fallback = 'testnet') {
  return normalizeMorpheusNetwork(
    payload?.network ||
      payload?.morpheus_network ||
      payload?.runtime_network ||
      payload?.environment,
    fallback
  );
}

export function envForNetwork(networkInput, ...names) {
  const network = normalizeMorpheusNetwork(networkInput);
  const upper = network.toUpperCase();
  const scopedRuntimeConfig = getRuntimeConfigForNetwork(network);
  const runtimeConfig = getRuntimeConfig();
  for (const name of names) {
    const value = String(
      process.env[`${name}_${upper}`] ||
        scopedRuntimeConfig[name] ||
        process.env[name] ||
        runtimeConfig[name] ||
        ''
    ).trim();
    if (value) return value;
  }
  return '';
}

export function trimString(value) {
  return String(value || '').trim();
}

export function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function stableStringify(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const entries = Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`).join(',')}}`;
}

export function resolveMaxBytes(value, fallbackBytes = 0, minBytes = 1024) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return Math.max(fallbackBytes, minBytes);
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return Math.max(fallbackBytes, minBytes);
  return Math.max(Math.trunc(numeric), minBytes);
}

export function measureSerializedSizeBytes(value) {
  return Buffer.byteLength(stableStringify(value), 'utf8');
}

export function enforceSerializedSizeLimit(value, label, maxBytes) {
  const size = measureSerializedSizeBytes(value);
  if (size > maxBytes) {
    throw new Error(`${label} exceeds max size of ${maxBytes} bytes`);
  }
  return size;
}

export function ensureBuffer(input) {
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof Uint8Array) return Buffer.from(input);
  if (input instanceof ArrayBuffer) return Buffer.from(input);
  if (typeof input === 'string') return Buffer.from(input, 'utf8');
  return Buffer.from(stableStringify(input), 'utf8');
}

export function sha256Hex(input) {
  return createHash('sha256').update(ensureBuffer(input)).digest('hex');
}

export function isHexString(value) {
  const raw = trimString(value).replace(/^0x/i, '');
  return raw.length > 0 && raw.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(raw);
}

export function strip0x(value) {
  return trimString(value).replace(/^0x/i, '');
}

export function decodeBase64(value) {
  const normalized = trimString(value).replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Buffer.from(padded, 'base64');
}

export function toPem(label, bytes) {
  const b64 = Buffer.from(bytes).toString('base64');
  const wrapped = b64.match(/.{1,64}/g)?.join('\n') || b64;
  return `-----BEGIN ${label}-----\n${wrapped}\n-----END ${label}-----`;
}

export function normalizeTargetChain(value) {
  const normalized = trimString(value || 'neo_n3').toLowerCase();
  if (!SUPPORTED_ORACLE_TARGET_CHAINS.has(normalized)) {
    throw new Error(`unsupported target_chain: ${value}`);
  }
  return normalized;
}

export function normalizeHeaders(input) {
  const headers = new Headers();
  if (!input || typeof input !== 'object') return headers;
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string') headers.set(key, value);
  }
  return headers;
}

export function parseBodyMaybe(raw, contentType) {
  if (!raw) return null;
  const looksJson =
    String(contentType || '').includes('application/json') || /^[\[{]/.test(raw.trim());
  if (!looksJson) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getJsonPathValue(value, path) {
  if (!path || typeof value !== 'object' || value === null) return undefined;
  return String(path)
    .split('.')
    .filter(Boolean)
    .reduce(
      (current, segment) => (current && typeof current === 'object' ? current[segment] : undefined),
      value
    );
}

export function parseDurationMs(value, fallbackMs = 0) {
  if (value === undefined || value === null || value === '') return fallbackMs;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(Math.trunc(value), 0);

  const raw = trimString(value).toLowerCase();
  if (!raw) return fallbackMs;
  if (/^\d+$/.test(raw)) return Math.max(Number(raw), 0);

  const match = raw.match(/^(\d+(?:\.\d+)?)(ms|s|m)$/);
  if (!match) return fallbackMs;
  const amount = Number(match[1]);
  const unit = match[2];
  const scale = unit === 'ms' ? 1 : unit === 's' ? 1000 : 60_000;
  return Math.max(Math.round(amount * scale), 0);
}

// --- Security: timeout cap for user-controlled durations (M-10) ---
export const MAX_USER_TIMEOUT_MS = 30_000;

export function cappedDurationMs(value, fallbackMs = 0, maxMs = MAX_USER_TIMEOUT_MS) {
  return Math.min(parseDurationMs(value, fallbackMs), maxMs);
}

// --- Security: SSRF-safe URL validation for RPC endpoints (M-08, H-07) ---
export function validateRpcUrl(rawUrl) {
  const url = trimString(rawUrl);
  if (!url) return url;
  const parsedUrl = new URL(url);
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('RPC URL must use http or https');
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
    throw new Error('private/internal RPC URLs not allowed');
  }
  return url;
}

// --- Security: sanitize error messages before returning to caller (M-06) ---
// Blacklist approach: pass through unless error matches sensitive patterns.
const SENSITIVE_PATTERNS = [
  /private[_ ]?key/i,
  /secret[_ ]?key/i,
  /signing[_ ]?key/i,
  /^Error:\s*0x[0-9a-f]{20,}/im,
  /wif\b.*\bKx?\w{30,}/i,
  /\/home\/|^\/(?:usr|etc|var|tmp)\//,
  /node_modules/,
  /\.js:\d+:\d+/,
  /^Error:\s*[0-9a-f]{64}\b/im,
];

export function sanitizeErrorMessage(error) {
  if (!(error instanceof Error)) return String(error).slice(0, 200);
  const msg = error.message;
  if (SENSITIVE_PATTERNS.some((p) => p.test(msg))) return 'internal error';
  return msg.slice(0, 200);
}

export function assertUntrustedScriptsEnabled() {
  if (!normalizeBoolean(env('MORPHEUS_ENABLE_UNTRUSTED_SCRIPTS'), false)) {
    throw new Error(
      'user-supplied scripts are disabled; set MORPHEUS_ENABLE_UNTRUSTED_SCRIPTS=true to opt in'
    );
  }
}

export function resolveScript(payload) {
  if (typeof payload.script === 'string' && payload.script.trim()) return payload.script;
  if (typeof payload.script_base64 === 'string' && payload.script_base64.trim()) {
    return decodeBase64(payload.script_base64).toString('utf8');
  }
  return '';
}

export function resolveWasmModuleBase64(payload) {
  if (typeof payload.wasm_base64 === 'string' && payload.wasm_base64.trim())
    return trimString(payload.wasm_base64);
  if (typeof payload.wasm_module_base64 === 'string' && payload.wasm_module_base64.trim())
    return trimString(payload.wasm_module_base64);
  if (typeof payload.module_base64 === 'string' && payload.module_base64.trim())
    return trimString(payload.module_base64);
  return '';
}

export function requestLog(level, event, data = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...data,
  };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
  return entry;
}
