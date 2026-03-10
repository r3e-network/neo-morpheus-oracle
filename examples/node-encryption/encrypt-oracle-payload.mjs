import { webcrypto } from "node:crypto";

async function fetchOracleKey(baseUrl, token) {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/oracle/public-key`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    throw new Error(`failed to fetch oracle key: ${response.status}`);
  }
  return response.json();
}

async function encryptWithOracleKey(publicKeyBase64, plaintext) {
  const spki = Buffer.from(publicKeyBase64, "base64");
  const rsaKey = await webcrypto.subtle.importKey(
    "spki",
    spki,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
  const aesKey = await webcrypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt"],
  );
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const encryptedBytes = new Uint8Array(await webcrypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    new TextEncoder().encode(plaintext),
  ));
  const ciphertextBytes = encryptedBytes.slice(0, encryptedBytes.length - 16);
  const tagBytes = encryptedBytes.slice(encryptedBytes.length - 16);
  const rawAesKey = new Uint8Array(await webcrypto.subtle.exportKey("raw", aesKey));
  const wrappedKey = new Uint8Array(await webcrypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    rsaKey,
    rawAesKey,
  ));
  return Buffer.from(JSON.stringify({
    version: 1,
    algorithm: "RSA-OAEP-AES-256-GCM",
    encrypted_key: Buffer.from(wrappedKey).toString("base64"),
    iv: Buffer.from(iv).toString("base64"),
    ciphertext: Buffer.from(ciphertextBytes).toString("base64"),
    tag: Buffer.from(tagBytes).toString("base64"),
  })).toString("base64");
}

const baseUrl = process.env.PHALA_API_URL || "";
const token = process.env.PHALA_API_TOKEN || process.env.PHALA_SHARED_SECRET || "";

if (!baseUrl) {
  throw new Error("PHALA_API_URL is required");
}

const oracleKey = await fetchOracleKey(baseUrl, token);

const encryptedToken = await encryptWithOracleKey(
  oracleKey.public_key,
  "Bearer my-private-api-token",
);

const encryptedPayload = await encryptWithOracleKey(
  oracleKey.public_key,
  JSON.stringify({
    mode: "builtin",
    function: "math.modexp",
    input: { base: "2", exponent: "10", modulus: "17" },
    target_chain: "neo_x",
  }),
);

console.log(JSON.stringify({
  encrypted_token: encryptedToken,
  encrypted_payload: encryptedPayload,
}, null, 2));
