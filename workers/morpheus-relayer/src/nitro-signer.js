// AWS Nitro signer + Secrets Manager adapter (legacy local key-derivation fallback).
//
// The relayer signs Neo N3 fulfillments through the 8787 enclave; this module is
// only the legacy derived-key fallback path. It replaces the former Phala dstack/
// tappd TEE client: instead of asking a dstack endpoint for derived key bytes, it
// derives deterministic per-(path,purpose) key bytes from a master secret held in
// AWS Secrets Manager (read via the instance role), or from an env seed when one
// is configured. Exported names/signatures are unchanged so neo-n3.js imports are
// unaffected.
import { env, sha256Hex, trimString } from '../../nitro-worker/src/platform/core.js';

const derivedKeyCache = new Map();
const secretCache = new Map(); // secretId -> Promise<Buffer>
let secretsClientPromise;

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

export function shouldUseDerivedKeys(config = {}) {
  return normalizeBoolean(
    config?.useDerivedKeys ?? env('NITRO_USE_DERIVED_KEYS', 'PHALA_USE_DERIVED_KEYS'),
    false
  );
}

function normalizeRole(role) {
  const normalized = trimString(role || 'relayer');
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(normalized)) {
    throw new Error('invalid derived Neo N3 key role');
  }
  return normalized;
}

// Master secret id (overridable via env); created on the box: random bytes, base64.
function masterSecretId() {
  return (
    trimString(env('NITRO_SIGNER_SECRET_ID', 'MORPHEUS_X25519_SECRET_ID')) || 'morpheus/x25519-wrap'
  );
}

// Optional env seed: when set, key derivation uses this directly instead of
// Secrets Manager (keeps tests and local runs working without AWS access).
function masterSeedFromEnv() {
  const raw = trimString(env('NITRO_SIGNER_SEED', 'PHALA_SIGNER_SEED'));
  if (!raw) return null;
  if (/^[0-9a-fA-F]{64,}$/.test(raw) && raw.length % 2 === 0) {
    return Buffer.from(raw, 'hex');
  }
  try {
    const buf = Buffer.from(raw, 'base64');
    if (buf.length >= 16) return buf;
  } catch {
    /* fall through */
  }
  return Buffer.from(raw, 'utf8');
}

async function getSecretsClient() {
  if (!secretsClientPromise) {
    secretsClientPromise = (async () => {
      const region = trimString(env('AWS_REGION', 'NITRO_AWS_REGION')) || 'us-east-1';
      // Lazy import so paths that use an env seed never require the AWS SDK.
      const mod = await import('@aws-sdk/client-secrets-manager');
      const client = new mod.SecretsManagerClient({ region });
      return {
        async getSecret(secretId) {
          const out = await client.send(new mod.GetSecretValueCommand({ SecretId: secretId }));
          return trimString(out.SecretString || '');
        },
      };
    })();
  }
  return secretsClientPromise;
}

async function fetchSecretBytes(secretId) {
  if (!secretCache.has(secretId)) {
    secretCache.set(
      secretId,
      (async () => {
        const provider = await getSecretsClient();
        const b64 = await provider.getSecret(secretId);
        if (!b64) throw new Error(`secret ${secretId} is empty or unavailable`);
        const buf = Buffer.from(b64, 'base64');
        if (buf.length < 16) throw new Error(`secret ${secretId} decoded too short`);
        return buf;
      })()
    );
  }
  return secretCache.get(secretId);
}

async function getMasterSecret() {
  const seed = masterSeedFromEnv();
  if (seed) return seed;
  return fetchSecretBytes(masterSecretId());
}

// Deterministic per-(path,purpose) 32-byte sub-key derived from the master secret.
async function deriveKeyBytes(path, purpose = '') {
  const keyPath = trimString(path);
  if (!keyPath) throw new Error('derived key path required');
  const cacheKey = `${keyPath}:${purpose}`;
  if (!derivedKeyCache.has(cacheKey)) {
    derivedKeyCache.set(
      cacheKey,
      (async () => {
        const master = await getMasterSecret();
        const material = Buffer.concat([
          master,
          Buffer.from(`\x00${keyPath}\x00${purpose}`, 'utf8'),
        ]);
        return Buffer.from(sha256Hex(material), 'hex');
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
  const rolePathEnvKey = `NITRO_${normalizedRole.toUpperCase()}_NEO_N3_KEY_PATH`;
  const legacyRolePathEnvKey = `PHALA_DSTACK_${normalizedRole.toUpperCase()}_NEO_N3_KEY_PATH`;
  const keyPath =
    trimString(
      env(
        rolePathEnvKey,
        legacyRolePathEnvKey,
        'NITRO_NEO_N3_KEY_PATH',
        'PHALA_DSTACK_NEO_N3_KEY_PATH'
      )
    ) || `morpheus/neo-n3/${normalizedRole}/signing/v1`;
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

// Light runtime marker for the Nitro signer (the 8787 enclave holds signing keys).
export async function getNitroInfo({ required = false } = {}) {
  const endpoint =
    trimString(env('NITRO_SIGNER_ENDPOINT', 'MORPHEUS_NITRO_SIGNER_ENDPOINT')) ||
    'http://127.0.0.1:8787';
  try {
    const res = await fetch(new URL('/health', endpoint).toString(), { method: 'GET' });
    const body = await res.json().catch(() => ({}));
    return { runtime: body.runtime || 'aws-nitro-signer', network: body.network || null, client_kind: 'nitro' };
  } catch (error) {
    if (required) throw new Error('Nitro signer health endpoint is unavailable');
    return { runtime: 'aws-nitro-signer', network: null, client_kind: 'nitro' };
  }
}

// Back-compat alias: the prior dstack client concept does not exist on Nitro;
// return a marker carrying the runtime info instead.
export async function getDstackClient({ required = false } = {}) {
  const info = await getNitroInfo({ required });
  return { client: null, kind: 'nitro', info };
}
