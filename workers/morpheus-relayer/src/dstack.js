import { DstackClient, TappdClient } from '@neo-morpheus-oracle/shared/dstack-client';
import { sha256Hex } from '../../phala-worker/src/platform/core.js';

let dstackClientPromise;
const derivedKeyCache = new Map();

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

export function shouldUseDerivedKeys(config = {}) {
  return normalizeBoolean(config?.useDerivedKeys ?? process.env.PHALA_USE_DERIVED_KEYS, false);
}

function normalizeRole(role) {
  const normalized = trimString(role || 'relayer');
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(normalized)) {
    throw new Error('invalid derived Neo N3 key role');
  }
  return normalized;
}

async function tryCreateClient(kind) {
  try {
    if (kind === 'dstack') {
      const endpoint =
        trimString(process.env.PHALA_DSTACK_ENDPOINT || process.env.DSTACK_ENDPOINT || '') ||
        undefined;
      return { client: new DstackClient(endpoint), kind: 'dstack' };
    }

    const endpoint =
      trimString(process.env.PHALA_TAPPD_ENDPOINT || process.env.TAPPD_ENDPOINT || '') || undefined;
    return { client: new TappdClient(endpoint), kind: 'tappd' };
  } catch {
    return null;
  }
}

export async function getDstackClient({ required = false } = {}) {
  if (!dstackClientPromise) {
    dstackClientPromise = (async () => {
      const dstack = await tryCreateClient('dstack');
      if (dstack) return dstack;
      const tappd = await tryCreateClient('tappd');
      if (tappd) return tappd;
      return null;
    })();
  }
  const wrapped = await dstackClientPromise;
  if (!wrapped) {
    dstackClientPromise = undefined;
  }
  if (!wrapped && required) throw new Error('Phala dstack/tappd endpoint is not reachable');
  return wrapped;
}

async function deriveKeyBytes(path, purpose = '') {
  const keyPath = trimString(path);
  if (!keyPath) throw new Error('derived key path required');
  const cacheKey = `${keyPath}:${purpose}`;
  if (!derivedKeyCache.has(cacheKey)) {
    derivedKeyCache.set(
      cacheKey,
      (async () => {
        const wrapped = await getDstackClient({ required: true });
        const response = await wrapped.client.getKey(keyPath, purpose || undefined);
        return Buffer.from(response.key);
      })()
    );
  }
  return derivedKeyCache.get(cacheKey);
}

function normalizePrivateKeyHex(buffer, label) {
  let current = Buffer.from(buffer);
  for (let round = 0; round < 4; round += 1) {
    const hex = current.toString('hex');
    if (/^[0-9a-f]{64}$/i.test(hex) && !/^0+$/.test(hex)) return hex.toLowerCase();
    current = Buffer.from(sha256Hex(Buffer.concat([current, Buffer.from(label)])), 'hex');
  }
  throw new Error(`unable to derive usable private key for ${label}`);
}

export async function deriveNeoN3PrivateKeyHex(role = 'relayer') {
  const normalizedRole = normalizeRole(role);
  const rolePathEnvKey = `PHALA_DSTACK_${normalizedRole.toUpperCase()}_NEO_N3_KEY_PATH`;
  const keyPath =
    trimString(process.env[rolePathEnvKey] || process.env.PHALA_DSTACK_NEO_N3_KEY_PATH || '') ||
    `morpheus/neo-n3/${normalizedRole}/signing/v1`;
  return normalizePrivateKeyHex(
    await deriveKeyBytes(keyPath, 'neo-n3-signing'),
    `neo-n3:${normalizedRole}`
  );
}

export async function deriveRelayerNeoN3PrivateKeyHex() {
  return deriveNeoN3PrivateKeyHex('relayer');
}

export async function deriveUpdaterNeoN3PrivateKeyHex() {
  return deriveNeoN3PrivateKeyHex('updater');
}
