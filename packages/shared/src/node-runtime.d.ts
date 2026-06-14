/**
 * Node-only runtime helpers shared by the workers (nitro-worker and
 * morpheus-relayer). Kept out of utils.js so Cloudflare Worker consumers of
 * `@neo-morpheus-oracle/shared/utils` never pull in node:crypto or process.env.
 */

/**
 * Resolve the first non-empty value among the given env-var names, checking
 * `process.env` first and the cached `MORPHEUS_RUNTIME_CONFIG_JSON` document as
 * a fallback for each name in turn. Returns '' when none are set.
 */
export function env(...names: string[]): string;

/**
 * Normalize the supported input shapes (Buffer, Uint8Array, ArrayBuffer,
 * string, or arbitrary value via stableStringify) into a Node Buffer.
 */
export function ensureBuffer(
  input: Buffer | Uint8Array | ArrayBuffer | string | unknown
): Buffer;

/**
 * SHA-256 hex digest of the given input, normalized through `ensureBuffer`.
 */
export function sha256Hex(input: Buffer | Uint8Array | ArrayBuffer | string | unknown): string;
