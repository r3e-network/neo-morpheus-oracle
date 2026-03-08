import { decodeBase64, resolveScript, toPem, trimString } from "../platform/core.js";

let oracleKeyMaterialPromise;

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

export async function ensureOracleKeyMaterial() {
  if (!oracleKeyMaterialPromise) {
    oracleKeyMaterialPromise = (async () => {
      if (!globalThis.crypto?.subtle) {
        throw new Error("WebCrypto is unavailable in this Phala runtime");
      }

      const keyPair = await globalThis.crypto.subtle.generateKey(
        {
          name: "RSA-OAEP",
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: "SHA-256",
        },
        true,
        ["encrypt", "decrypt"],
      );

      const spki = await globalThis.crypto.subtle.exportKey("spki", keyPair.publicKey);
      const spkiBytes = Buffer.from(spki);
      return {
        algorithm: "RSA-OAEP-SHA256",
        publicKey: keyPair.publicKey,
        privateKey: keyPair.privateKey,
        publicKeyDer: spkiBytes.toString("base64"),
        publicKeyPem: toPem("PUBLIC KEY", spkiBytes),
      };
    })();
  }

  return oracleKeyMaterialPromise;
}

export async function decryptEncryptedToken(ciphertext) {
  if (!ciphertext) return null;
  const { privateKey } = await ensureOracleKeyMaterial();
  const plaintext = await globalThis.crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, decodeBase64(ciphertext));
  return Buffer.from(plaintext).toString("utf8");
}

export async function executeProgrammableOracle(payload, context) {
  const script = resolveScript(payload);
  if (!script) {
    return {
      executed: false,
      result: context.selected_value ?? context.data ?? context.raw_response,
    };
  }

  const helpers = {
    getCurrentTimestamp: () => Math.floor(Date.now() / 1000),
    base64Decode: (value) => decodeBase64(value).toString("utf8"),
  };

  const evaluator = new Function(
    "data",
    "context",
    "helpers",
    `${script}\nif (typeof process !== 'function') throw new Error('script must define process(data, context, helpers)');\nreturn process(data, context, helpers);`,
  );

  return {
    executed: true,
    result: await evaluator(context.data, context, helpers),
  };
}
