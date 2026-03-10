const HYBRID_ENVELOPE_VERSION = 1;
const HYBRID_ENVELOPE_ALGORITHM = "RSA-OAEP-AES-256-GCM";
const AES_GCM_TAG_LENGTH_BYTES = 16;

function pemToArrayBuffer(pem: string) {
  const base64 = pem.replace(/-----BEGIN PUBLIC KEY-----/g, "").replace(/-----END PUBLIC KEY-----/g, "").replace(/\s+/g, "");
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return window.btoa(binary);
}

async function importOracleRsaKey(publicKeyPem: string) {
  return window.crypto.subtle.importKey(
    "spki",
    pemToArrayBuffer(publicKeyPem),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
}

export async function encryptTextWithOraclePublicKey(publicKeyPem: string, plaintext: string) {
  const rsaKey = await importOracleRsaKey(publicKeyPem);
  const aesKey = await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt"],
  );
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const encryptedBytes = new Uint8Array(
    await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      aesKey,
      plaintextBytes,
    ),
  );

  const ciphertext = encryptedBytes.slice(0, encryptedBytes.length - AES_GCM_TAG_LENGTH_BYTES);
  const tag = encryptedBytes.slice(encryptedBytes.length - AES_GCM_TAG_LENGTH_BYTES);
  const rawAesKey = new Uint8Array(await window.crypto.subtle.exportKey("raw", aesKey));
  const encryptedKey = new Uint8Array(
    await window.crypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      rsaKey,
      rawAesKey,
    ),
  );

  return bytesToBase64(
    new TextEncoder().encode(JSON.stringify({
      version: HYBRID_ENVELOPE_VERSION,
      algorithm: HYBRID_ENVELOPE_ALGORITHM,
      encrypted_key: bytesToBase64(encryptedKey),
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(ciphertext),
      tag: bytesToBase64(tag),
    })),
  );
}

export async function encryptJsonWithOraclePublicKey(publicKeyPem: string, jsonText: string) {
  const parsed = JSON.parse(jsonText);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("confidential payload must be a JSON object");
  }
  return encryptTextWithOraclePublicKey(publicKeyPem, JSON.stringify(parsed));
}
