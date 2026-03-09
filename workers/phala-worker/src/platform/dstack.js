import { wallet as neoWallet } from "@cityofzion/neon-js";
import { Wallet as EvmWallet } from "ethers";
import { DstackClient, TappdClient } from "@phala/dstack-sdk";
import { env, sha256Hex, stableStringify, trimString } from "./core.js";

let dstackClientPromise;
let dstackInfoPromise;
let dstackClientFactoryForTests = null;
const derivedKeyCache = new Map();

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export function shouldUseDerivedKeys(payload = {}) {
  return normalizeBoolean(payload.use_derived_keys ?? env("PHALA_USE_DERIVED_KEYS"), false);
}

export function shouldEmitAttestation(payload = {}) {
  return normalizeBoolean(payload.include_attestation ?? payload.emit_attestation ?? env("PHALA_EMIT_ATTESTATION"), false);
}

function resetDstackCaches() {
  dstackClientPromise = undefined;
  dstackInfoPromise = undefined;
  derivedKeyCache.clear();
}

export function __setDstackClientFactoryForTests(factory) {
  dstackClientFactoryForTests = factory;
  resetDstackCaches();
}

export function __resetDstackClientStateForTests() {
  dstackClientFactoryForTests = null;
  resetDstackCaches();
}

async function tryCreateClient(kind) {
  try {
    if (kind === "dstack") {
      const endpoint = trimString(env("PHALA_DSTACK_ENDPOINT", "DSTACK_ENDPOINT")) || undefined;
      return { client: new DstackClient(endpoint), kind: "dstack" };
    }

    const endpoint = trimString(env("PHALA_TAPPD_ENDPOINT", "TAPPD_ENDPOINT")) || undefined;
    return { client: new TappdClient(endpoint), kind: "tappd" };
  } catch {
    return null;
  }
}

export async function getDstackClient({ required = false } = {}) {
  if (!dstackClientPromise) {
    dstackClientPromise = (async () => {
      if (dstackClientFactoryForTests) {
        const injected = await dstackClientFactoryForTests();
        return injected && injected.client ? injected : { client: injected, kind: "test" };
      }

      const dstack = await tryCreateClient("dstack");
      if (dstack) return dstack;

      const tappd = await tryCreateClient("tappd");
      if (tappd) return tappd;

      return null;
    })();
  }
  const wrapped = await dstackClientPromise;
  if (!wrapped) {
    dstackClientPromise = undefined;
  }
  if (!wrapped && required) throw new Error("Phala dstack/tappd endpoint is not reachable");
  return wrapped;
}

export async function getDstackInfo({ required = false, refresh = false } = {}) {
  if (refresh) dstackInfoPromise = undefined;
  if (!dstackInfoPromise) {
    dstackInfoPromise = (async () => {
      const wrapped = await getDstackClient({ required });
      if (!wrapped) return null;
      return { ...(await wrapped.client.info()), client_kind: wrapped.kind };
    })();
  }
  const info = await dstackInfoPromise;
  if (!info && required) throw new Error("Phala dstack info is unavailable");
  return info;
}

export async function deriveKeyBytes(path, purpose = "") {
  const keyPath = trimString(path);
  if (!keyPath) throw new Error("derived key path required");
  const cacheKey = `${keyPath}:${purpose}`;
  if (!derivedKeyCache.has(cacheKey)) {
    derivedKeyCache.set(cacheKey, (async () => {
      const wrapped = await getDstackClient({ required: true });
      const response = await wrapped.client.getKey(keyPath, purpose || undefined);
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

export async function deriveNeoN3PrivateKeyHex(role = "worker") {
  const configuredPath = trimString(env("PHALA_DSTACK_NEO_N3_KEY_PATH"));
  const keyPath = configuredPath || `morpheus/neo-n3/${role}/signing/v1`;
  return normalizePrivateKeyHex(await deriveKeyBytes(keyPath, "neo-n3-signing"), `neo-n3:${role}`);
}

export async function deriveNeoXPrivateKeyHex(role = "worker") {
  const configuredPath = trimString(env("PHALA_DSTACK_NEOX_KEY_PATH"));
  const keyPath = configuredPath || `morpheus/neo-x/${role}/signing/v1`;
  return normalizePrivateKeyHex(await deriveKeyBytes(keyPath, "neo-x-signing"), `neo-x:${role}`);
}

export async function getDerivedKeySummary(role = "worker") {
  const [neoN3PrivateKey, neoXPrivateKey, info] = await Promise.all([
    deriveNeoN3PrivateKeyHex(role),
    deriveNeoXPrivateKeyHex(role),
    getDstackInfo({ required: false }),
  ]);
  const neoN3Account = new neoWallet.Account(neoN3PrivateKey);
  const neoXWallet = new EvmWallet(`0x${neoXPrivateKey}`);
  return {
    role,
    client_kind: info?.client_kind || null,
    app_id: info?.app_id || null,
    instance_id: info?.instance_id || null,
    compose_hash: info?.compose_hash || null,
    neo_n3: {
      address: neoN3Account.address,
      public_key: neoN3Account.publicKey,
      script_hash: `0x${neoN3Account.scriptHash}`,
      key_path: trimString(env("PHALA_DSTACK_NEO_N3_KEY_PATH")) || `morpheus/neo-n3/${role}/signing/v1`,
    },
    neo_x: {
      address: neoXWallet.address,
      key_path: trimString(env("PHALA_DSTACK_NEOX_KEY_PATH")) || `morpheus/neo-x/${role}/signing/v1`,
    },
  };
}

function normalizeReportData(input) {
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof Uint8Array) return Buffer.from(input);
  if (typeof input === "string") {
    const raw = trimString(input);
    if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
    return Buffer.from(sha256Hex(raw), "hex");
  }
  return Buffer.from(sha256Hex(stableStringify(input)), "hex");
}

export async function buildDstackAttestation(reportInput, { required = false } = {}) {
  const wrapped = await getDstackClient({ required });
  if (!wrapped) return null;
  const info = await getDstackInfo({ required });
  const reportData = normalizeReportData(reportInput);
  const quote = await wrapped.client.getQuote(reportData);
  return {
    client_kind: wrapped.kind,
    app_id: info?.app_id || null,
    instance_id: info?.instance_id || null,
    app_name: info?.app_name || null,
    compose_hash: info?.compose_hash || null,
    device_id: info?.device_id || null,
    key_provider_info: info?.key_provider_info || null,
    tcb_info: info?.tcb_info || null,
    quote: quote.quote,
    event_log: quote.event_log,
    report_data: quote.report_data || `0x${reportData.toString("hex")}`,
    vm_config: quote.vm_config || info?.vm_config || null,
  };
}

export async function maybeBuildDstackAttestation(payload, reportInput) {
  if (!shouldEmitAttestation(payload)) return null;
  try {
    return await buildDstackAttestation(reportInput, { required: false });
  } catch {
    return null;
  }
}
