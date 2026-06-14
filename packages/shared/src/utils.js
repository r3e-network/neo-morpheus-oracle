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
 * Bounded-concurrency map preserving input order, with fail-fast abort.
 *
 * Runs `worker(item, index)` over `items` with at most `limit` concurrent
 * invocations (clamped to `[1, items.length]`). Results are written back at
 * their original index so the resolved array matches the sequential
 * `items.map(worker)` ordering exactly.
 *
 * Fail-fast semantics: once any worker throws, the shared cursor is frozen so
 * idle workers stop pulling new items (in-flight workers still settle), and the
 * first thrown error rejects the returned promise. This is the abort-the-tick
 * default the relayer's engine scans rely on — a faulted scan must not keep
 * issuing RPC calls for the rest of the range, and the rejection must propagate
 * so a partially-scanned cursor is never advanced. Callers that need every item
 * attempted regardless of individual failures must NOT use this helper.
 */
export async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  let failed = false;

  async function runWorker() {
    while (!failed) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  }

  const width = Math.max(Math.min(limit, items.length), 1);
  await Promise.all(Array.from({ length: width }, () => runWorker()));
  return results;
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
 * - Object keys sort via a locale-pinned collator (NOT code-unit order); this
 *   matches every digest the worker has ever signed. The collation is pinned
 *   to `Intl.Collator('en', { sensitivity: 'variant', caseFirst: 'false' })`
 *   so the sort no longer depends on the host's default locale: a bare
 *   `String.prototype.localeCompare()` resolves against the runtime's default
 *   locale, which can differ per box/region and would silently reorder mixed
 *   alphabet/case keys, producing a different digest for the same payload.
 *   Pinning the locale removes that environment axis (verified byte-identical
 *   to the prior `localeCompare` output across all golden vectors); it does
 *   NOT remove the residual ICU-version dependency, which is consistent across
 *   the deployed Node runtimes.
 * - Typed arrays get no special casing (plain-object numeric keys).
 */
const STABLE_KEY_COLLATOR = new Intl.Collator('en', {
  sensitivity: 'variant',
  caseFirst: 'false',
});

export function stableStringify(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const entries = Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => STABLE_KEY_COLLATOR.compare(a, b));
  return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`).join(',')}}`;
}
