import fs from "node:fs/promises";
import path from "node:path";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  webcrypto,
} from "node:crypto";
import { fileURLToPath } from "node:url";
import { assertUntrustedScriptsEnabled, env, parseDurationMs, decodeBase64, resolveScript, resolveWasmModuleBase64, trimString } from "../platform/core.js";
import { deriveKeyBytes } from "../platform/dstack.js";
import { runScriptWithTimeout } from "../platform/script-runner.js";
import { runWasmWithTimeout } from "../platform/wasm-runner.js";
import { validateUserScriptSource } from "../platform/script-policy.js";

let oracleKeyMaterialPromise;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const ORACLE_ENVELOPE_VERSION = 2;
const ORACLE_ENVELOPE_ALGORITHM = "X25519-HKDF-SHA256-AES-256-GCM";
const ORACLE_ENVELOPE_INFO = "morpheus-confidential-payload-v2";
const AES_GCM_KEY_LENGTH_BYTES = 32;
const AES_GCM_IV_LENGTH_BYTES = 12;
const AES_GCM_TAG_LENGTH_BYTES = 16;

function getSubtle() {
  return globalThis.crypto?.subtle || webcrypto.subtle;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeHash160(value) {
  const raw = trimString(value).replace(/^0x/i, "").toLowerCase();
  return /^[0-9a-f]{40}$/.test(raw) ? `0x${raw}` : "";
}

function mergeConfidentialValue(baseValue, patchValue) {
  if (!isPlainObject(baseValue) || !isPlainObject(patchValue)) {
    return patchValue;
  }

  const merged = { ...baseValue };
  for (const [key, value] of Object.entries(patchValue)) {
    merged[key] = mergeConfidentialValue(baseValue[key], value);
  }
  return merged;
}

function getOracleKeyStorePath() {
  return trimString(env("PHALA_ORACLE_KEYSTORE_PATH")) || "/data/morpheus/oracle-key.json";
}

export function __resetOracleKeyMaterialForTests() {
  oracleKeyMaterialPromise = undefined;
}

function formatKeyMaterial({ publicKeyRawBytes, privateKeyPkcs8Bytes, source }) {
  return {
    algorithm: ORACLE_ENVELOPE_ALGORITHM,
    source,
    key_format: "raw",
    publicKeyRawBytes,
    privateKeyPkcs8Bytes,
    publicKeyRaw: Buffer.from(publicKeyRawBytes).toString("base64"),
  };
}

async function generateX25519KeyMaterial() {
  const subtle = getSubtle();
  const keyPair = await subtle.generateKey(
    { name: "X25519" },
    true,
    ["deriveBits"],
  );
  return {
    publicKeyRawBytes: Buffer.from(await subtle.exportKey("raw", keyPair.publicKey)),
    privateKeyPkcs8Bytes: Buffer.from(await subtle.exportKey("pkcs8", keyPair.privateKey)),
  };
}

async function ensureDirectory(filePath) {
  const directory = path.dirname(filePath);
  await fs.mkdir(directory, { recursive: true });
}

function resolveAbsoluteKeystorePath(filePath) {
  if (path.isAbsolute(filePath)) return filePath;
  return path.resolve(repoRoot, filePath);
}

async function deriveOracleWrapKey() {
  const keyPath = trimString(env("PHALA_DSTACK_ORACLE_ENCRYPTION_KEY_PATH")) || "morpheus/oracle/encryption/wrap/v1";
  const bytes = await deriveKeyBytes(keyPath, "oracle-encryption-wrap");
  return Buffer.from(bytes).subarray(0, 32);
}

function encryptPrivateKey(privateKeyDerBytes, wrapKey) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", wrapKey, iv);
  const ciphertext = Buffer.concat([cipher.update(privateKeyDerBytes), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    tag: tag.toString("base64"),
  };
}

function decryptPrivateKey(sealed, wrapKey) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    wrapKey,
    Buffer.from(sealed.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, "base64")),
    decipher.final(),
  ]);
}

async function loadStableOracleKeyMaterial() {
  const keystorePath = resolveAbsoluteKeystorePath(getOracleKeyStorePath());
  const wrapKey = await deriveOracleWrapKey();

  try {
    const raw = await fs.readFile(keystorePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!trimString(parsed.public_key_raw) || !parsed.sealed_private_key) {
      throw new Error("legacy or malformed X25519 keystore");
    }
    const publicKeyRawBytes = Buffer.from(parsed.public_key_raw, "base64");
    const privateKeyPkcs8Bytes = decryptPrivateKey(parsed.sealed_private_key, wrapKey);
    return formatKeyMaterial({ publicKeyRawBytes, privateKeyPkcs8Bytes, source: "dstack-sealed" });
  } catch {}

  const generated = await generateX25519KeyMaterial();
  const sealedPrivateKey = encryptPrivateKey(generated.privateKeyPkcs8Bytes, wrapKey);
  await ensureDirectory(keystorePath);
  await fs.writeFile(keystorePath, JSON.stringify({
    algorithm: ORACLE_ENVELOPE_ALGORITHM,
    version: ORACLE_ENVELOPE_VERSION,
    public_key_raw: generated.publicKeyRawBytes.toString("base64"),
    sealed_private_key: sealedPrivateKey,
  }, null, 2));
  return formatKeyMaterial({
    publicKeyRawBytes: generated.publicKeyRawBytes,
    privateKeyPkcs8Bytes: generated.privateKeyPkcs8Bytes,
    source: "dstack-sealed:new",
  });
}

export function resolveEncryptedPayload(payload) {
  const encryptedInputs = payload && typeof payload.encrypted_inputs === "object" ? payload.encrypted_inputs : {};
  return trimString(
    payload.encrypted_payload ||
      payload.encrypted_token ||
      encryptedInputs.payload ||
      encryptedInputs.api_token ||
      encryptedInputs.token ||
      "",
  );
}

function resolveEncryptedConfidentialPayload(payload) {
  const encryptedInputs = isPlainObject(payload?.encrypted_inputs) ? payload.encrypted_inputs : {};
  return trimString(
    payload?.encrypted_params ||
      payload?.encrypted_input ||
      encryptedInputs.params ||
      encryptedInputs.input ||
      payload?.encrypted_payload ||
      encryptedInputs.payload ||
      "",
  );
}

function resolveEncryptedConfidentialRef(payload) {
  const encryptedInputs = isPlainObject(payload?.encrypted_inputs) ? payload.encrypted_inputs : {};
  return trimString(
    payload?.encrypted_params_ref ||
      payload?.encrypted_input_ref ||
      payload?.encrypted_payload_ref ||
      encryptedInputs.params_ref ||
      encryptedInputs.input_ref ||
      encryptedInputs.payload_ref ||
      "",
  );
}

function getSupabaseRestConfig() {
  const baseUrl = trimString(env("SUPABASE_URL") || env("NEXT_PUBLIC_SUPABASE_URL") || env("morpheus_SUPABASE_URL") || "");
  const apiKey = trimString(
    env("SUPABASE_SECRET_KEY")
      || env("morpheus_SUPABASE_SECRET_KEY")
      || env("SUPABASE_SERVICE_ROLE_KEY")
      || env("morpheus_SUPABASE_SERVICE_ROLE_KEY")
      || env("SUPABASE_SERVICE_KEY")
      || "",
  );
  if (!baseUrl || !apiKey) return null;
  return {
    restUrl: `${baseUrl.replace(/\/$/, "")}/rest/v1`,
    apiKey,
  };
}

async function loadEncryptedCiphertextByRef(ref, payload = {}) {
  const restConfig = getSupabaseRestConfig();
  if (!restConfig) throw new Error("SUPABASE_URL and a Supabase secret or service-role key are required for encrypted ref resolution");
  const network = trimString(env("MORPHEUS_NETWORK") || env("NEXT_PUBLIC_MORPHEUS_NETWORK") || "testnet") === "mainnet"
    ? "mainnet"
    : "testnet";

  const url = new URL(`${restConfig.restUrl}/morpheus_encrypted_secrets`);
  url.searchParams.set("select", "id,ciphertext,network,metadata");
  url.searchParams.set("id", `eq.${ref}`);
  url.searchParams.set("network", `eq.${network}`);
  url.searchParams.set("limit", "1");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      apikey: restConfig.apiKey,
      authorization: `Bearer ${restConfig.apiKey}`,
      accept: "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`encrypted ref lookup failed: ${response.status} ${text}`.trim());
  }

  const rows = await response.json().catch(() => []);
  const row = Array.isArray(rows) ? rows[0] : null;
  assertEncryptedRefScope(row, payload);
  const ciphertext = trimString(row?.ciphertext || "");
  if (!ciphertext) {
    throw new Error(`encrypted ref not found: ${ref}`);
  }
  return ciphertext;
}

function assertEncryptedRefScope(row, payload = {}) {
  const metadata = isPlainObject(row?.metadata) ? row.metadata : {};
  const boundRequester = normalizeHash160(metadata.bound_requester || metadata.requester || "");
  const boundCallbackContract = normalizeHash160(metadata.bound_callback_contract || metadata.callback_contract || "");
  const expectedRequester = normalizeHash160(payload.requester || payload.requester_script_hash || "");
  const expectedCallbackContract = normalizeHash160(payload.callback_contract || payload.callbackContract || "");

  if (boundRequester) {
    if (!expectedRequester) {
      throw new Error("encrypted ref requester binding present but requester context is missing");
    }
    if (boundRequester !== expectedRequester) {
      throw new Error("encrypted ref requester mismatch");
    }
  }

  if (boundCallbackContract) {
    if (!expectedCallbackContract) {
      throw new Error("encrypted ref callback binding present but callback context is missing");
    }
    if (boundCallbackContract !== expectedCallbackContract) {
      throw new Error("encrypted ref callback mismatch");
    }
  }
}

function parseX25519Envelope(ciphertext) {
  try {
    const decoded = Buffer.from(decodeBase64(ciphertext)).toString("utf8");
    const parsed = JSON.parse(decoded);
    if (!isPlainObject(parsed)) return null;
    if (Number(parsed.v ?? parsed.version) !== ORACLE_ENVELOPE_VERSION) return null;
    if (trimString(parsed.alg ?? parsed.algorithm) !== ORACLE_ENVELOPE_ALGORITHM) return null;
    if (!trimString(parsed.epk) || !trimString(parsed.iv) || !trimString(parsed.ct) || !trimString(parsed.tag)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function importX25519PrivateKey(privateKeyPkcs8Bytes) {
  return getSubtle().importKey(
    "pkcs8",
    privateKeyPkcs8Bytes,
    { name: "X25519" },
    false,
    ["deriveBits"],
  );
}

async function importX25519PublicKey(publicKeyRawBytes) {
  return getSubtle().importKey(
    "raw",
    publicKeyRawBytes,
    { name: "X25519" },
    false,
    [],
  );
}

async function deriveAesKey(sharedSecretBytes, senderPublicKeyBytes, recipientPublicKeyBytes, usage) {
  const subtle = getSubtle();
  const keyMaterial = await subtle.importKey(
    "raw",
    sharedSecretBytes,
    "HKDF",
    false,
    ["deriveKey"],
  );
  const info = new Uint8Array([
    ...Buffer.from(ORACLE_ENVELOPE_INFO, "utf8"),
    ...senderPublicKeyBytes,
    ...recipientPublicKeyBytes,
  ]);
  return subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: recipientPublicKeyBytes,
      info,
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    [usage],
  );
}

async function decryptX25519Envelope(envelope, keyMaterial) {
  const senderPublicKeyBytes = decodeBase64(envelope.epk);
  if (senderPublicKeyBytes.length !== 32) {
    throw new Error("invalid X25519 envelope public key length");
  }

  const iv = decodeBase64(envelope.iv);
  if (iv.length !== AES_GCM_IV_LENGTH_BYTES) {
    throw new Error("invalid X25519 envelope iv length");
  }

  const tag = decodeBase64(envelope.tag);
  if (tag.length !== AES_GCM_TAG_LENGTH_BYTES) {
    throw new Error("invalid X25519 envelope tag length");
  }

  const subtle = getSubtle();
  const [privateKey, senderPublicKey] = await Promise.all([
    importX25519PrivateKey(keyMaterial.privateKeyPkcs8Bytes),
    importX25519PublicKey(senderPublicKeyBytes),
  ]);
  const sharedSecretBytes = new Uint8Array(
    await subtle.deriveBits(
      { name: "X25519", public: senderPublicKey },
      privateKey,
      256,
    ),
  );
  const aesKey = await deriveAesKey(
    sharedSecretBytes,
    senderPublicKeyBytes,
    keyMaterial.publicKeyRawBytes,
    "decrypt",
  );
  const plaintext = await subtle.decrypt(
    { name: "AES-GCM", iv, tagLength: AES_GCM_TAG_LENGTH_BYTES * 8 },
    aesKey,
    Buffer.concat([decodeBase64(envelope.ct), tag]),
  );
  return Buffer.from(plaintext).toString("utf8");
}

export async function ensureOracleKeyMaterial(payload = {}) {
  if (!oracleKeyMaterialPromise) {
    oracleKeyMaterialPromise = (async () => {
      try {
        return await loadStableOracleKeyMaterial();
      } catch {
        // fall back to ephemeral in-memory key material
      }

      const generated = await generateX25519KeyMaterial();
      return formatKeyMaterial({
        publicKeyRawBytes: generated.publicKeyRawBytes,
        privateKeyPkcs8Bytes: generated.privateKeyPkcs8Bytes,
        source: "ephemeral-memory",
      });
    })();
  }

  return oracleKeyMaterialPromise;
}

export async function decryptEncryptedToken(ciphertext, payload = {}) {
  if (!ciphertext) return null;
  const keyMaterial = await ensureOracleKeyMaterial(payload);
  const envelope = parseX25519Envelope(ciphertext);
  if (!envelope) {
    throw new Error(`unsupported confidential payload format; expected ${ORACLE_ENVELOPE_ALGORITHM}`);
  }
  return decryptX25519Envelope(envelope, keyMaterial);
}

export async function resolveConfidentialPayload(payload = {}) {
  let ciphertext = resolveEncryptedConfidentialPayload(payload);
  const encryptedRef = resolveEncryptedConfidentialRef(payload);
  if (!ciphertext && encryptedRef) {
    ciphertext = await loadEncryptedCiphertextByRef(encryptedRef, payload);
  }
  if (!ciphertext) return payload;

  const plaintext = await decryptEncryptedToken(ciphertext, payload);
  if (!plaintext) return payload;

  let parsed;
  try {
    parsed = JSON.parse(plaintext);
  } catch {
    return payload;
  }

  if (!isPlainObject(parsed)) return payload;

  const mergedPayload = { ...payload };
  delete mergedPayload.encrypted_params;
  delete mergedPayload.encrypted_input;
  if (mergedPayload.encrypted_payload === ciphertext) {
    delete mergedPayload.encrypted_payload;
  }

  if (isPlainObject(mergedPayload.encrypted_inputs)) {
    const encryptedInputs = { ...mergedPayload.encrypted_inputs };
    if (encryptedInputs.params === ciphertext) delete encryptedInputs.params;
    if (encryptedInputs.input === ciphertext) delete encryptedInputs.input;
    if (encryptedInputs.payload === ciphertext) delete encryptedInputs.payload;
    if (Object.keys(encryptedInputs).length > 0) {
      mergedPayload.encrypted_inputs = encryptedInputs;
    } else {
      delete mergedPayload.encrypted_inputs;
    }
  }

  return mergeConfidentialValue(mergedPayload, parsed);
}

export async function executeProgrammableOracle(payload, context) {
  const wasmModuleBase64 = resolveWasmModuleBase64(payload);
  if (wasmModuleBase64) {
    const timeoutMs = parseDurationMs(
      payload.wasm_timeout_ms
        || payload.script_timeout_ms
        || payload.oracle_script_timeout_ms
        || env("ORACLE_WASM_TIMEOUT_MS", "MORPHEUS_WASM_TIMEOUT_MS")
        || 30000,
      30000,
    );
    return {
      executed: true,
      runtime: "wasm",
      result: await runWasmWithTimeout({
        mode: "oracle",
        moduleBase64: wasmModuleBase64,
        entryPoint: trimString(payload.wasm_entry || payload.wasm_entry_point || payload.entry_point || "run") || "run",
        input: { data: context.data, context },
        timeoutMs,
      }),
    };
  }

  const script = resolveScript(payload);
  if (!script) {
    return {
      executed: false,
      result: context.selected_value ?? context.data ?? context.raw_response,
    };
  }

  assertUntrustedScriptsEnabled();
  validateUserScriptSource(script);

  const timeoutMs = parseDurationMs(
    payload.script_timeout_ms || payload.oracle_script_timeout_ms || env("ORACLE_SCRIPT_TIMEOUT_MS"),
    2000,
  );

  return {
    executed: true,
    runtime: "script",
    result: await runScriptWithTimeout({
      mode: "oracle",
      script,
      data: context.data,
      context,
      timeoutMs,
    }),
  };
}
