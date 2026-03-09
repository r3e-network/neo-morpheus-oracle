import fs from "node:fs/promises";
import path from "node:path";
import {
  constants,
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  privateDecrypt,
  randomBytes,
} from "node:crypto";
import { fileURLToPath } from "node:url";
import { assertUntrustedScriptsEnabled, env, parseDurationMs, decodeBase64, resolveScript, toPem, trimString } from "../platform/core.js";
import { deriveKeyBytes, shouldUseDerivedKeys } from "../platform/dstack.js";
import { runScriptWithTimeout } from "../platform/script-runner.js";

let oracleKeyMaterialPromise;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function formatKeyMaterial({ publicKeyDerBytes, privateKeyDerBytes, source }) {
  const publicKey = createPublicKey({ key: publicKeyDerBytes, type: "spki", format: "der" });
  const privateKey = createPrivateKey({ key: privateKeyDerBytes, type: "pkcs8", format: "der" });
  return {
    algorithm: "RSA-OAEP-SHA256",
    source,
    publicKey,
    privateKey,
    publicKeyDerBytes,
    privateKeyDerBytes,
    publicKeyDer: Buffer.from(publicKeyDerBytes).toString("base64"),
    publicKeyPem: toPem("PUBLIC KEY", publicKeyDerBytes),
  };
}

function generateRsaKeyMaterial() {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicExponent: 0x10001,
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "der" },
  });
  return {
    publicKeyDerBytes: Buffer.from(publicKey),
    privateKeyDerBytes: Buffer.from(privateKey),
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
    const publicKeyDerBytes = Buffer.from(parsed.public_key_der, "base64");
    const privateKeyDerBytes = decryptPrivateKey(parsed.sealed_private_key, wrapKey);
    return formatKeyMaterial({ publicKeyDerBytes, privateKeyDerBytes, source: "dstack-sealed" });
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  const generated = generateRsaKeyMaterial();
  const sealedPrivateKey = encryptPrivateKey(generated.privateKeyDerBytes, wrapKey);
  await ensureDirectory(keystorePath);
  await fs.writeFile(keystorePath, JSON.stringify({
    algorithm: "RSA-OAEP-SHA256",
    version: 1,
    public_key_der: generated.publicKeyDerBytes.toString("base64"),
    sealed_private_key: sealedPrivateKey,
  }, null, 2));
  return formatKeyMaterial({
    publicKeyDerBytes: generated.publicKeyDerBytes,
    privateKeyDerBytes: generated.privateKeyDerBytes,
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

export async function ensureOracleKeyMaterial(payload = {}) {
  if (!oracleKeyMaterialPromise) {
    oracleKeyMaterialPromise = (async () => {
      try {
        if (shouldUseDerivedKeys(payload)) {
          return await loadStableOracleKeyMaterial();
        }
      } catch {
        // fall back to ephemeral in-memory key material
      }

      const generated = generateRsaKeyMaterial();
      return formatKeyMaterial({
        publicKeyDerBytes: generated.publicKeyDerBytes,
        privateKeyDerBytes: generated.privateKeyDerBytes,
        source: "ephemeral-memory",
      });
    })();
  }

  return oracleKeyMaterialPromise;
}

export async function decryptEncryptedToken(ciphertext, payload = {}) {
  if (!ciphertext) return null;
  const { privateKey } = await ensureOracleKeyMaterial(payload);
  const plaintext = privateDecrypt(
    {
      key: privateKey,
      oaepHash: "sha256",
      padding: constants.RSA_PKCS1_OAEP_PADDING,
    },
    decodeBase64(ciphertext),
  );
  return Buffer.from(plaintext).toString("utf8");
}

export async function resolveConfidentialPayload(payload = {}) {
  const ciphertext = resolveEncryptedConfidentialPayload(payload);
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
  const script = resolveScript(payload);
  if (!script) {
    return {
      executed: false,
      result: context.selected_value ?? context.data ?? context.raw_response,
    };
  }

  assertUntrustedScriptsEnabled();

  const timeoutMs = parseDurationMs(
    payload.script_timeout_ms || payload.oracle_script_timeout_ms || env("ORACLE_SCRIPT_TIMEOUT_MS"),
    2000,
  );

  return {
    executed: true,
    result: await runScriptWithTimeout({
      mode: "oracle",
      script,
      data: context.data,
      context,
      timeoutMs,
    }),
  };
}
