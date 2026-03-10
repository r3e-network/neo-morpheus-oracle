async function fetchOracleKey() {
  const response = await fetch("/api/oracle/public-key");
  if (!response.ok) {
    throw new Error(`failed to fetch oracle key: ${response.status}`);
  }
  return response.json();
}

function decodeBase64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function encodeBytesToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function encryptWithOracleKey(publicKeyBase64, plaintext) {
  const spki = decodeBase64ToBytes(publicKeyBase64);
  const rsaKey = await crypto.subtle.importKey(
    "spki",
    spki,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
  const aesKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encryptedBytes = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    new TextEncoder().encode(plaintext),
  ));
  const ciphertextBytes = encryptedBytes.slice(0, encryptedBytes.length - 16);
  const tagBytes = encryptedBytes.slice(encryptedBytes.length - 16);
  const rawAesKey = new Uint8Array(await crypto.subtle.exportKey("raw", aesKey));
  const wrappedKey = new Uint8Array(await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    rsaKey,
    rawAesKey,
  ));
  return btoa(JSON.stringify({
    version: 1,
    algorithm: "RSA-OAEP-AES-256-GCM",
    encrypted_key: encodeBytesToBase64(wrappedKey),
    iv: encodeBytesToBase64(iv),
    ciphertext: encodeBytesToBase64(ciphertextBytes),
    tag: encodeBytesToBase64(tagBytes),
  }));
}

async function encryptSecretOnly(secretText) {
  const oracleKey = await fetchOracleKey();
  return encryptWithOracleKey(oracleKey.public_key, secretText);
}

async function encryptConfidentialJsonPatch(patchObject) {
  const oracleKey = await fetchOracleKey();
  return encryptWithOracleKey(oracleKey.public_key, JSON.stringify(patchObject));
}

// Example usage:
// const encryptedToken = await encryptSecretOnly("Bearer my-private-api-token");
// const encryptedPayload = await encryptConfidentialJsonPatch({
//   mode: "builtin",
//   function: "math.modexp",
//   input: { base: "2", exponent: "10", modulus: "17" },
//   target_chain: "neo_x"
// });
