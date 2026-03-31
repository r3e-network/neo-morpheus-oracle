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
 * Deterministic JSON stringification shared across worker, relayer, and web
 * verification flows so digest calculations stay byte-for-byte aligned.
 */
export function stableStringify(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  if (value instanceof Uint8Array) return JSON.stringify(Buffer.from(value).toString('base64'));
  if (typeof value === 'object') {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(String(value));
}
