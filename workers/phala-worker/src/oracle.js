import { randomUUID } from "crypto";
import { Interface } from "ethers";
import {
  DEFAULT_WAIT_TIMEOUT_MS,
  decodeBase64,
  env,
  getJsonPathValue,
  json,
  normalizeHeaders,
  normalizeTargetChain,
  parseBodyMaybe,
  resolveScript,
  sha256Hex,
  strip0x,
  toPem,
  trimString,
} from "./core.js";
import {
  buildSignedResultEnvelope,
  isConfiguredHash160,
  loadNeoN3Context,
  normalizeNeoHash160,
  relayNeoN3Invocation,
  relayNeoXTransaction,
} from "./chain.js";

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

export function normalizeOracleUrl(rawUrl) {
  const parsedUrl = new URL(trimString(rawUrl));
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("url must use http or https");
  }
  const host = parsedUrl.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "[::1]" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    host === "169.254.169.254" ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    throw new Error("private/internal URLs not allowed");
  }

  const rawAllowlist = env("ORACLE_HTTP_ALLOWLIST");
  if (rawAllowlist) {
    const allowlist = rawAllowlist.split(",").map((entry) => trimString(entry)).filter(Boolean);
    if (allowlist.length > 0) {
      const allowed = allowlist.some((entry) => parsedUrl.href.startsWith(entry) || parsedUrl.origin === entry.replace(/\/$/, ""));
      if (!allowed) throw new Error("url is not in ORACLE_HTTP_ALLOWLIST");
    }
  }

  return parsedUrl.toString();
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

export async function performOracleFetch(payload) {
  const url = normalizeOracleUrl(payload.url);

  const decryptedToken = await decryptEncryptedToken(resolveEncryptedPayload(payload));
  const headers = normalizeHeaders(payload.headers);
  const tokenHeader = trimString(payload.token_header || "Authorization") || "Authorization";
  if (decryptedToken) {
    const tokenPrefix = payload.token_prefix !== undefined
      ? String(payload.token_prefix)
      : tokenHeader.toLowerCase() === "authorization"
        ? "Bearer "
        : "";
    headers.set(tokenHeader, `${tokenPrefix}${decryptedToken}`);
  }

  const response = await fetch(url, {
    method: payload.method || "GET",
    headers,
    body: payload.body,
  });

  const rawResponse = await response.text();
  const responseHeaders = Object.fromEntries(response.headers.entries());
  const data = parseBodyMaybe(rawResponse, response.headers.get("content-type")) ?? rawResponse;
  const selectedValue = getJsonPathValue(data, payload.json_path);

  return {
    upstream_status: response.status,
    upstream_headers: responseHeaders,
    raw_response: rawResponse,
    data,
    selected_value: selectedValue,
  };
}

export async function buildOracleResponse(payload, mode) {
  const targetChain = normalizeTargetChain(payload.target_chain);
  const fetchResult = await performOracleFetch(payload);
  const context = {
    ...fetchResult,
    target_chain: targetChain,
    target_chain_id: payload.target_chain_id ? String(payload.target_chain_id) : null,
    request_source: trimString(payload.request_source || "chain-dispatcher") || "chain-dispatcher",
    encrypted_token_present: Boolean(resolveEncryptedPayload(payload)),
  };
  const executed = await executeProgrammableOracle(payload, context);

  const derived = {
    target_chain: context.target_chain,
    target_chain_id: context.target_chain_id,
    request_source: context.request_source,
    result: executed.result,
    extracted_value: fetchResult.selected_value ?? null,
    upstream_status: fetchResult.upstream_status,
  };
  const signed = buildSignedResultEnvelope(derived);

  if (mode === "query") {
    return {
      mode: executed.executed ? "fetch+compute" : "fetch",
      request_source: context.request_source,
      target_chain: context.target_chain,
      target_chain_id: context.target_chain_id,
      status_code: fetchResult.upstream_status,
      headers: fetchResult.upstream_headers,
      body: fetchResult.raw_response,
      body_json: typeof fetchResult.data === "string" ? null : fetchResult.data,
      extracted_value: fetchResult.selected_value ?? null,
      result: executed.result,
      output_hash: signed.output_hash,
      signature: signed.signature,
      public_key: signed.public_key,
      attestation_hash: signed.attestation_hash,
    };
  }

  return {
    mode: executed.executed ? "fetch+compute" : "fetch",
    request_source: context.request_source,
    target_chain: context.target_chain,
    target_chain_id: context.target_chain_id,
    upstream_status: fetchResult.upstream_status,
    result: executed.result,
    extracted_value: fetchResult.selected_value ?? null,
    output_hash: signed.output_hash,
    signature: signed.signature,
    public_key: signed.public_key,
    attestation_hash: signed.attestation_hash,
  };
}

export async function fetchJson(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  return { ok: response.ok, status: response.status, data };
}

export function normalizePairSymbol(rawSymbol) {
  const raw = trimString(rawSymbol).toUpperCase();
  if (!raw) return "NEO-USD";
  if (/^[A-Z0-9]+-[A-Z0-9]+$/.test(raw)) {
    const [base, quote] = raw.split("-");
    return `${base}-${quote === "USDT" ? "USD" : quote}`;
  }
  if (/^[A-Z0-9]+[/-_][A-Z0-9]+$/.test(raw)) {
    const [base, quote] = raw.split(/[/_-]/);
    return `${base}-${quote === "USDT" ? "USD" : quote}`;
  }
  if (raw.endsWith("USDT")) {
    return `${raw.slice(0, -4)}-USD`;
  }
  if (raw.endsWith("USD")) {
    return `${raw.slice(0, -3)}-USD`;
  }
  return `${raw}-USD`;
}

export function toBinanceSymbol(pair) {
  const compact = normalizePairSymbol(pair).replace(/-/g, "");
  if (compact.endsWith("USD")) {
    return `${compact.slice(0, -3)}USDT`;
  }
  return compact;
}

export function decimalToIntegerString(value, decimals = 8) {
  const raw = trimString(value);
  if (!raw) throw new Error("decimal value required");
  const sign = raw.startsWith("-") ? -1n : 1n;
  const normalized = raw.replace(/^[+-]/, "");
  if (!/^\d+(\.\d+)?$/.test(normalized)) throw new Error(`invalid decimal value: ${value}`);
  const [wholePart, fractionPart = ""] = normalized.split(".");
  const whole = BigInt(wholePart || "0");
  const fraction = (fractionPart + "0".repeat(decimals)).slice(0, decimals);
  const fractionValue = BigInt(fraction || "0");
  const scale = 10n ** BigInt(decimals);
  return ((whole * scale) + fractionValue) * sign + "";
}

export async function fetchPriceQuote(symbol) {
  const pair = normalizePairSymbol(symbol);
  const binanceSymbol = toBinanceSymbol(pair);
  const response = await fetchJson(`https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(binanceSymbol)}`);
  if (!response.ok || !response.data?.price) {
    throw new Error("binance fetch failed");
  }

  const quote = {
    feed_id: `binance:${pair}`,
    pair,
    price: String(response.data.price),
    decimals: 8,
    timestamp: new Date().toISOString(),
    sources: ["binance"],
  };

  const signed = buildSignedResultEnvelope(quote);
  return {
    ...quote,
    signature: signed.signature,
    public_key: signed.public_key,
    attestation_hash: signed.attestation_hash,
  };
}

export async function handleFeedsPrice(symbol) {
  try {
    return json(200, await fetchPriceQuote(symbol));
  } catch (error) {
    return json(502, { error: error instanceof Error ? error.message : String(error) });
  }
}

export async function handleOracleFeed(payload) {
  const targetChain = payload.target_chain ? normalizeTargetChain(payload.target_chain) : "neo_n3";
  const quote = await fetchPriceQuote(payload.symbol || "NEO-USD");
  const roundId = String(payload.round_id || Math.floor(Date.now() / 1000));
  const sourceSetId = String(payload.source_set_id || 0);
  const timestamp = Math.floor(Date.now() / 1000);
  let anchoredTx = null;
  let relayStatus = "skipped";

  if (targetChain === "neo_n3") {
    const dataFeedHash = normalizeNeoHash160(env("CONTRACT_MORPHEUS_DATAFEED_HASH", "CONTRACT_PRICEFEED_HASH"));
    const neoContext = loadNeoN3Context(payload, { required: false, requireRpc: false });
    if (dataFeedHash && isConfiguredHash160(dataFeedHash) && neoContext) {
      const invokeResult = await relayNeoN3Invocation({
        request_id: trimString(payload.request_id) || `pricefeed:${randomUUID()}`,
        contract_hash: dataFeedHash,
        method: "updateFeed",
        params: [
          { type: "String", value: quote.pair },
          { type: "Integer", value: roundId },
          { type: "Integer", value: decimalToIntegerString(quote.price, quote.decimals) },
          { type: "Integer", value: String(timestamp) },
          { type: "ByteArray", value: quote.attestation_hash },
          { type: "Integer", value: sourceSetId },
        ],
        wait: Boolean(payload.wait ?? true),
        rpc_url: neoContext.rpcUrl,
        network_magic: neoContext.networkMagic,
      });

      if (invokeResult.status >= 400) {
        return json(invokeResult.status, invokeResult.body);
      }

      anchoredTx = invokeResult.body;
      relayStatus = "submitted";
    }
  } else {
    const dataFeedAddress = trimString(payload.contract_address || env("CONTRACT_MORPHEUS_DATAFEED_X_ADDRESS"));
    if (dataFeedAddress) {
      const feedInterface = new Interface([
        "function updateFeed(string pair,uint256 roundId,uint256 price,uint256 timestamp,bytes32 attestationHash,uint256 sourceSetId)",
      ]);
      const data = feedInterface.encodeFunctionData("updateFeed", [
        quote.pair,
        BigInt(roundId),
        BigInt(decimalToIntegerString(quote.price, quote.decimals)),
        BigInt(timestamp),
        `0x${strip0x(quote.attestation_hash || "0")}`.padEnd(66, "0"),
        BigInt(sourceSetId),
      ]);
      anchoredTx = await relayNeoXTransaction({
        ...payload,
        target_chain: "neo_x",
        to: dataFeedAddress,
        data,
        value: "0",
        wait: Boolean(payload.wait ?? true),
      });
      relayStatus = "submitted";
    }
  }

  return json(200, {
    mode: "pricefeed",
    target_chain: targetChain,
    ...quote,
    relay_status: relayStatus,
    anchored_tx: anchoredTx,
  });
}

export async function handleVrf(payload) {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const randomness = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const signed = buildSignedResultEnvelope({ randomness });
  return json(200, {
    request_id: payload.request_id || crypto.randomUUID(),
    randomness,
    signature: signed.signature,
    public_key: signed.public_key,
    attestation_hash: signed.attestation_hash,
    timestamp: Math.floor(Date.now() / 1000),
  });
}
