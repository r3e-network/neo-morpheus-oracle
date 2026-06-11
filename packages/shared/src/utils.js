/**
 * HTTP JSON response helper
 */
export function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/**
 * Safely trims string values, returns empty string for non-strings
 */
export function trimString(value) {
  return String(value || '').trim();
}

/**
 * Parse an ISO timestamp string to milliseconds since epoch
 * Returns 0 if parsing fails
 */
export function parseTimestampMs(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Get client IP address from request headers
 * Checks Cloudflare-specific headers first, then falls back to standard headers
 */
export function getClientIp(request) {
  const headers = request.headers;
  const forwarded =
    trimString(headers.get('cf-connecting-ip')) ||
    trimString(headers.get('x-real-ip')) ||
    trimString(headers.get('x-client-ip'));
  if (forwarded) return forwarded;

  const xff = trimString(headers.get('x-forwarded-for'));
  if (xff) return trimString(xff.split(',')[0]);

  return 'unknown';
}

/**
 * Constant-time string comparison safe against timing attacks.
 * Works in all JS runtimes (Node, Cloudflare Workers, Deno).
 */
export function timingSafeCompare(a, b) {
  const sa = String(a || '');
  const sb = String(b || '');
  if (sa.length !== sb.length) return false;
  let diff = 0;
  for (let i = 0; i < sa.length; i++) diff |= sa.charCodeAt(i) ^ sb.charCodeAt(i);
  return diff === 0;
}

/**
 * Deterministic JSON stringification shared across worker, relayer, and web
 * verification flows so digest calculations stay byte-for-byte aligned.
 *
 * This is the canonical implementation behind the nitro-worker's signed
 * `output_hash` digests, pinned by the golden vectors in
 * stable-stringify-vectors.mjs. Semantics (do NOT change without rotating the
 * verification scheme — live signatures were produced from these bytes):
 * - `null`/`undefined` serialize as `null` at the top level and inside
 *   arrays; object entries whose value is `undefined` are dropped.
 * - `bigint` serializes as its decimal string in quotes.
 * - Object keys sort via `localeCompare` (NOT code-unit order); this matches
 *   every digest the worker has ever signed.
 * - Typed arrays get no special casing (plain-object numeric keys).
 */
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
