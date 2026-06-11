/**
 * Node-only runtime helpers shared by the workers (nitro-worker and
 * morpheus-relayer). Kept out of utils.js so the Cloudflare Worker consumers
 * of `@neo-morpheus-oracle/shared/utils` never pull in node:crypto or
 * process.env access.
 */
import { createHash } from 'node:crypto';

import { stableStringify } from './utils.js';

let runtimeConfigCache;

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

/**
 * Resolve the first non-empty value among the given names, checking
 * process.env first and the cached MORPHEUS_RUNTIME_CONFIG_JSON document as a
 * fallback for each name in turn.
 */
export function env(...names) {
  const runtimeConfig = getRuntimeConfig();
  for (const name of names) {
    const value = String(process.env[name] || runtimeConfig[name] || '').trim();
    if (value) return value;
  }
  return '';
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
