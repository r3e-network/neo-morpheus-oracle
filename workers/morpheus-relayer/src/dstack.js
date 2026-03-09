import { DstackClient } from "@phala/dstack-sdk";
import { sha256Hex } from "../../phala-worker/src/platform/core.js";

let dstackClientPromise;
const derivedKeyCache = new Map();

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export function shouldUseDerivedKeys(config = {}) {
  return normalizeBoolean(config?.useDerivedKeys ?? process.env.PHALA_USE_DERIVED_KEYS, false);
}

export async function getDstackClient({ required = false } = {}) {
  if (!dstackClientPromise) {
    dstackClientPromise = (async () => {
      try {
        const endpoint = trimString(process.env.PHALA_DSTACK_ENDPOINT || process.env.TAPPD_ENDPOINT || "") || undefined;
        const client = new DstackClient(endpoint);
        const reachable = await client.isReachable().catch(() => false);
        return reachable ? client : null;
      } catch {
        return null;
      }
    })();
  }
  const client = await dstackClientPromise;
  if (!client && required) throw new Error("Phala dstack/tappd endpoint is not reachable");
  return client;
}

async function deriveKeyBytes(path, purpose = "") {
  const keyPath = trimString(path);
  if (!keyPath) throw new Error("derived key path required");
  const cacheKey = `${keyPath}:${purpose}`;
  if (!derivedKeyCache.has(cacheKey)) {
    derivedKeyCache.set(cacheKey, (async () => {
      const client = await getDstackClient({ required: true });
      const response = await client.getKey(keyPath, purpose || undefined);
      return Buffer.from(response.key);
    })());
  }
  return derivedKeyCache.get(cacheKey);
}

function normalizePrivateKeyHex(buffer, label) {
  let current = Buffer.from(buffer);
  for (let round = 0; round < 4; round += 1) {
    const hex = current.toString("hex");
    if (/^[0-9a-f]{64}$/i.test(hex) && !/^0+$/.test(hex)) return hex.toLowerCase();
    current = Buffer.from(sha256Hex(Buffer.concat([current, Buffer.from(label)])), "hex");
  }
  throw new Error(`unable to derive usable private key for ${label}`);
}

export async function deriveRelayerNeoN3PrivateKeyHex() {
  const keyPath = trimString(process.env.PHALA_DSTACK_RELAYER_NEO_N3_KEY_PATH || process.env.PHALA_DSTACK_NEO_N3_KEY_PATH || "") || "morpheus/neo-n3/relayer/signing/v1";
  return normalizePrivateKeyHex(await deriveKeyBytes(keyPath, "neo-n3-relayer-signing"), "neo-n3:relayer");
}

export async function deriveRelayerNeoXPrivateKeyHex() {
  const keyPath = trimString(process.env.PHALA_DSTACK_RELAYER_NEOX_KEY_PATH || process.env.PHALA_DSTACK_NEOX_KEY_PATH || "") || "morpheus/neo-x/relayer/signing/v1";
  return normalizePrivateKeyHex(await deriveKeyBytes(keyPath, "neo-x-relayer-signing"), "neo-x:relayer");
}
