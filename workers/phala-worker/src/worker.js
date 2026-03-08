import { createHash, randomUUID } from "crypto";
import { experimental, rpc as neoRpc, sc, tx, u, wallet as neoWallet } from "@cityofzion/neon-js";
import { JsonRpcProvider, Wallet as EvmWallet } from "ethers";

const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

const SUPPORTED_ORACLE_TARGET_CHAINS = new Set(["neo_n3", "neo_x"]);
const DEFAULT_NEO_NETWORK_MAGIC = 894710606;
const DEFAULT_WAIT_TIMEOUT_MS = 120000;
const DEFAULT_POLL_INTERVAL_MS = 2000;
const REPLAY_WINDOW_MS = 10 * 60 * 1000;

let oracleKeyMaterialPromise;
const seenRequestIds = new Map();

function env(...names) {
  for (const name of names) {
    const value = String(process.env[name] || "").trim();
    if (value) return value;
  }
  return "";
}

function trimString(value) {
  return String(value || "").trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stableStringify(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const entries = Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`).join(",")}}`;
}

function ensureBuffer(input) {
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof Uint8Array) return Buffer.from(input);
  if (input instanceof ArrayBuffer) return Buffer.from(input);
  if (typeof input === "string") return Buffer.from(input, "utf8");
  return Buffer.from(stableStringify(input), "utf8");
}

function sha256Hex(input) {
  return createHash("sha256").update(ensureBuffer(input)).digest("hex");
}

function isHexString(value) {
  const raw = trimString(value).replace(/^0x/i, "");
  return raw.length > 0 && raw.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(raw);
}

function strip0x(value) {
  return trimString(value).replace(/^0x/i, "");
}

function decodeBase64(value) {
  const normalized = trimString(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Buffer.from(padded, "base64");
}

function toPem(label, bytes) {
  const b64 = Buffer.from(bytes).toString("base64");
  const wrapped = b64.match(/.{1,64}/g)?.join("\n") || b64;
  return `-----BEGIN ${label}-----\n${wrapped}\n-----END ${label}-----`;
}

function normalizeTargetChain(value) {
  const normalized = trimString(value || "neo_n3").toLowerCase();
  if (!SUPPORTED_ORACLE_TARGET_CHAINS.has(normalized)) {
    throw new Error(`unsupported target_chain: ${value}`);
  }
  return normalized;
}

function normalizeHeaders(input) {
  const headers = new Headers();
  if (!input || typeof input !== "object") return headers;
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string") headers.set(key, value);
  }
  return headers;
}

function parseBodyMaybe(raw, contentType) {
  if (!raw) return null;
  const looksJson = String(contentType || "").includes("application/json") || /^[\[{]/.test(raw.trim());
  if (!looksJson) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getJsonPathValue(value, path) {
  if (!path || typeof value !== "object" || value === null) return undefined;
  return String(path)
    .split(".")
    .filter(Boolean)
    .reduce((current, segment) => (current && typeof current === "object" ? current[segment] : undefined), value);
}

function resolveScript(payload) {
  if (typeof payload.script === "string" && payload.script.trim()) return payload.script;
  if (typeof payload.script_base64 === "string" && payload.script_base64.trim()) {
    return decodeBase64(payload.script_base64).toString("utf8");
  }
  return "";
}

function resolveEncryptedPayload(payload) {
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

function bigintPowMod(base, exponent, modulus) {
  let result = 1n;
  let b = BigInt(base) % BigInt(modulus);
  let e = BigInt(exponent);
  const m = BigInt(modulus);
  while (e > 0n) {
    if (e & 1n) result = (result * b) % m;
    e >>= 1n;
    b = (b * b) % m;
  }
  return result;
}

function multiplyMatrices(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || !left.length || !right.length) {
    throw new Error("matrix.multiply requires non-empty left/right matrices");
  }
  const rows = left.length;
  const shared = left[0].length;
  const cols = right[0].length;
  if (!left.every((row) => Array.isArray(row) && row.length === shared)) throw new Error("invalid left matrix");
  if (!right.every((row) => Array.isArray(row) && row.length === cols)) throw new Error("invalid right matrix");
  if (right.length !== shared) throw new Error("matrix dimensions do not align");
  const out = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
  for (let i = 0; i < rows; i += 1) {
    for (let j = 0; j < cols; j += 1) {
      let sum = 0;
      for (let k = 0; k < shared; k += 1) sum += Number(left[i][k]) * Number(right[k][j]);
      out[i][j] = sum;
    }
  }
  return out;
}

function cosineSimilarity(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length || left.length === 0) {
    throw new Error("vector.cosine_similarity requires equal-length non-empty vectors");
  }
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let i = 0; i < left.length; i += 1) {
    const a = Number(left[i]);
    const b = Number(right[i]);
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (leftNorm === 0 || rightNorm === 0) throw new Error("cosine similarity undefined for zero vector");
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function listBuiltinComputeFunctions() {
  return [
    "hash.sha256",
    "math.modexp",
    "matrix.multiply",
    "vector.cosine_similarity",
    "zkp.public_signal_hash",
    "zkp.proof_digest",
    "fhe.batch_plan",
    "fhe.noise_budget_estimate",
  ];
}

async function executeBuiltinCompute(payload) {
  const fn = trimString(payload.function || payload.compute_fn);
  const input = payload.input ?? payload.compute_args ?? {};
  switch (fn) {
    case "hash.sha256":
      return { function: fn, result: { digest: sha256Hex(stableStringify(input)) } };
    case "math.modexp":
      return { function: fn, result: { value: bigintPowMod(input.base, input.exponent, input.modulus).toString() } };
    case "matrix.multiply":
      return { function: fn, result: { matrix: multiplyMatrices(input.left, input.right) } };
    case "vector.cosine_similarity":
      return { function: fn, result: { similarity: cosineSimilarity(input.left, input.right) } };
    case "zkp.public_signal_hash":
      return { function: fn, result: { digest: sha256Hex(stableStringify({ circuit_id: input.circuit_id || null, signals: input.signals || [] })) } };
    case "zkp.proof_digest":
      return { function: fn, result: { digest: sha256Hex(stableStringify({ proof: input.proof || input, verifying_key: input.verifying_key || null })) } };
    case "fhe.batch_plan": {
      const slotCount = Number(input.slot_count || input.slotCount || 0);
      const ciphertextCount = Number(input.ciphertext_count || input.ciphertextCount || 0);
      const slotsPerCiphertext = slotCount > 0 && ciphertextCount > 0 ? Math.ceil(slotCount / ciphertextCount) : slotCount;
      return { function: fn, result: { slot_count: slotCount, ciphertext_count: ciphertextCount, slots_per_ciphertext: slotsPerCiphertext } };
    }
    case "fhe.noise_budget_estimate": {
      const multiplicativeDepth = Number(input.multiplicative_depth || input.multiplicativeDepth || 1);
      const scaleBits = Number(input.scale_bits || input.scaleBits || 40);
      const modulusBits = Number(input.modulus_bits || input.modulusBits || 218);
      const estimatedNoiseBudget = Math.max(modulusBits - (multiplicativeDepth * scaleBits), 0);
      return { function: fn, result: { multiplicative_depth: multiplicativeDepth, scale_bits: scaleBits, modulus_bits: modulusBits, estimated_noise_budget: estimatedNoiseBudget } };
    }
    default:
      throw new Error(`unknown builtin compute function: ${fn}`);
  }
}

function normalizeOracleUrl(rawUrl) {
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

function normalizePairSymbol(rawSymbol) {
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

function toBinanceSymbol(pair) {
  const compact = normalizePairSymbol(pair).replace(/-/g, "");
  if (compact.endsWith("USD")) {
    return `${compact.slice(0, -3)}USDT`;
  }
  return compact;
}

function decimalToIntegerString(value, decimals = 8) {
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

function pruneSeenRequestIds() {
  const cutoff = Date.now() - REPLAY_WINDOW_MS;
  for (const [requestId, createdAt] of seenRequestIds.entries()) {
    if (createdAt < cutoff) seenRequestIds.delete(requestId);
  }
}

function rememberRequestId(requestId) {
  pruneSeenRequestIds();
  if (seenRequestIds.has(requestId)) return false;
  seenRequestIds.set(requestId, Date.now());
  return true;
}

function forgetRequestId(requestId) {
  if (requestId) seenRequestIds.delete(requestId);
}

function resolveSigningBytes(payload) {
  if (trimString(payload.data_hex)) {
    return {
      bytes: Buffer.from(strip0x(payload.data_hex), "hex"),
      source: "data_hex",
    };
  }
  if (trimString(payload.data_base64)) {
    return {
      bytes: decodeBase64(payload.data_base64),
      source: "data_base64",
    };
  }
  if (typeof payload.message === "string") {
    return {
      bytes: Buffer.from(payload.message, "utf8"),
      source: "message",
    };
  }
  if (typeof payload.data === "string") {
    return {
      bytes: Buffer.from(payload.data, "utf8"),
      source: "data:string",
    };
  }
  if (payload.data !== undefined) {
    return {
      bytes: Buffer.from(stableStringify(payload.data), "utf8"),
      source: "data:json",
    };
  }
  throw new Error("one of data, message, data_hex, or data_base64 is required");
}

function normalizeNeoHash160(value) {
  const raw = trimString(value);
  if (!raw) return "";
  if (neoWallet.isAddress(raw)) {
    return `0x${neoWallet.getScriptHashFromAddress(raw).toLowerCase()}`;
  }
  const hex = strip0x(raw).toLowerCase();
  if (/^[0-9a-f]{40}$/.test(hex)) return `0x${hex}`;
  return "";
}

function isConfiguredHash160(value) {
  return /^0x[0-9a-f]{40}$/.test(value) && !/^0x0{40}$/.test(value);
}

function normalizeContractHash(value) {
  const normalized = normalizeNeoHash160(value);
  if (!normalized) throw new Error(`invalid contract hash: ${value}`);
  return normalized;
}

function canonicalizeMethodName(method) {
  const trimmed = trimString(method);
  if (!trimmed) return "";
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

function createByteArrayParam(value) {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array || value instanceof ArrayBuffer) {
    return sc.ContractParam.byteArray(u.HexString.fromHex(Buffer.from(value).toString("hex")));
  }
  const raw = trimString(value);
  if (!raw) return sc.ContractParam.byteArray(u.HexString.fromHex(""));
  if (isHexString(raw)) {
    return sc.ContractParam.byteArray(u.HexString.fromHex(strip0x(raw)));
  }
  return sc.ContractParam.byteArray(raw);
}

function toNeoContractParam(param) {
  if (!param || typeof param !== "object") throw new Error("invalid Neo contract param");
  const type = trimString(param.type).toLowerCase();
  switch (type) {
    case "string":
      return sc.ContractParam.string(String(param.value ?? ""));
    case "integer":
      return sc.ContractParam.integer(String(param.value ?? "0"));
    case "boolean":
      return sc.ContractParam.boolean(Boolean(param.value));
    case "bytearray":
      return createByteArrayParam(param.value);
    case "hash160":
      return sc.ContractParam.hash160(String(param.value ?? ""));
    case "hash256":
      return sc.ContractParam.hash256(String(param.value ?? ""));
    case "publickey":
      return sc.ContractParam.publicKey(String(param.value ?? ""));
    case "any":
      return sc.ContractParam.any(param.value ?? null);
    case "array": {
      if (!Array.isArray(param.value)) throw new Error("Array param requires array value");
      return sc.ContractParam.array(...param.value.map((item) => toNeoContractParam(item).toJson()));
    }
    default:
      throw new Error(`unsupported Neo contract param type: ${param.type}`);
  }
}

function parseTxProxyAllowlist(raw) {
  const out = new Map();
  const text = trimString(raw);
  if (!text) return out;

  const parsed = JSON.parse(text);
  const contracts = parsed && typeof parsed === "object" ? parsed.contracts : null;
  if (!contracts || typeof contracts !== "object") return out;

  for (const [contract, methods] of Object.entries(contracts)) {
    const normalized = normalizeNeoHash160(contract);
    if (!normalized) continue;
    const entry = { allowAll: false, methods: new Set() };
    if (Array.isArray(methods)) {
      for (const method of methods) {
        const canonical = trimString(method);
        if (!canonical) continue;
        if (canonical === "*") {
          entry.allowAll = true;
          continue;
        }
        entry.methods.add(canonicalizeMethodName(canonical));
      }
    }
    out.set(normalized, entry);
  }
  return out;
}

function addAllow(allowlist, contractHash, ...methods) {
  const normalized = normalizeNeoHash160(contractHash);
  if (!normalized || !isConfiguredHash160(normalized)) return;
  const current = allowlist.get(normalized) || { allowAll: false, methods: new Set() };
  for (const method of methods) {
    const canonical = trimString(method);
    if (!canonical) continue;
    if (canonical === "*") {
      current.allowAll = true;
      continue;
    }
    current.methods.add(canonicalizeMethodName(canonical));
  }
  allowlist.set(normalized, current);
}

function buildTxProxyAllowlist() {
  const allowlist = parseTxProxyAllowlist(env("TXPROXY_ALLOWLIST"));
  addAllow(allowlist, env("CONTRACT_PRICEFEED_HASH"), "update");
  addAllow(allowlist, env("CONTRACT_RANDOMNESSLOG_HASH"), "record");
  addAllow(allowlist, env("CONTRACT_AUTOMATIONANCHOR_HASH"), "markExecuted");
  addAllow(allowlist, env("CONTRACT_MORPHEUS_ORACLE_HASH"), "fulfillRequest");
  addAllow(allowlist, env("CONTRACT_PAYMENTHUB_HASH"), "pay");
  addAllow(allowlist, env("CONTRACT_GOVERNANCE_HASH"), "stake", "unstake", "vote");
  addAllow(allowlist, env("CONTRACT_GAS_HASH") || "0xd2a4cff31913016155e38e474a2c06d08be276cf", "transfer");
  return allowlist;
}

function allowlistAllows(contractHash, method) {
  const allowlist = buildTxProxyAllowlist();
  const entry = allowlist.get(normalizeContractHash(contractHash));
  if (!entry) return false;
  if (entry.allowAll) return true;
  return entry.methods.has(canonicalizeMethodName(method));
}

function transferTargetsPaymentHub(params, paymentHubHash) {
  if (!Array.isArray(params) || params.length < 2) return false;
  const target = params[1];
  if (!target || trimString(target.type).toLowerCase() !== "hash160") return false;
  return normalizeNeoHash160(target.value) === normalizeNeoHash160(paymentHubHash);
}

function checkNeoIntentPolicy(payload) {
  const intent = trimString(payload.intent).toLowerCase();
  if (!intent) return null;

  const contractHash = normalizeContractHash(payload.contract_hash);
  const method = canonicalizeMethodName(payload.method);
  const gasHash = normalizeNeoHash160(env("CONTRACT_GAS_HASH") || "0xd2a4cff31913016155e38e474a2c06d08be276cf");
  const paymentHubHash = normalizeNeoHash160(env("CONTRACT_PAYMENTHUB_HASH"));
  const governanceHash = normalizeNeoHash160(env("CONTRACT_GOVERNANCE_HASH"));

  switch (intent) {
    case "gas-sponsor":
    case "gas_sponsor":
      if (contractHash !== gasHash || method !== "transfer") {
        return { status: 403, error: "gas-sponsor intent only allows GAS transfer" };
      }
      return null;
    case "payments":
    case "payment":
      if (!paymentHubHash) {
        return { status: 503, error: "payments intent requires CONTRACT_PAYMENTHUB_HASH" };
      }
      if (contractHash === paymentHubHash && method === "pay") return null;
      if (!gasHash) {
        return { status: 503, error: "payments intent requires CONTRACT_GAS_HASH" };
      }
      if (contractHash !== gasHash || method !== "transfer") {
        return { status: 403, error: "payments intent only allows GAS transfer to PaymentHub" };
      }
      if (!transferTargetsPaymentHub(payload.params, paymentHubHash)) {
        return { status: 403, error: "payments intent requires transfer to PaymentHub" };
      }
      return null;
    case "governance":
      if (!governanceHash) {
        return { status: 503, error: "governance intent requires CONTRACT_GOVERNANCE_HASH" };
      }
      if (contractHash !== governanceHash) {
        return { status: 403, error: "governance intent requires Governance contract" };
      }
      if (!["stake", "unstake", "vote"].includes(method)) {
        return { status: 403, error: "governance intent only allows stake/unstake/vote" };
      }
      return null;
    default:
      return { status: 400, error: `unknown intent: ${payload.intent}` };
  }
}

function getNeoSigners(account, scope = "CalledByEntry") {
  return [{ account: account.scriptHash, scopes: trimString(scope) || "CalledByEntry" }];
}

function normalizeNeoRawTransaction(rawTransaction) {
  const raw = trimString(rawTransaction);
  if (!raw) throw new Error("raw transaction required");
  if (isHexString(raw)) {
    return u.HexString.fromHex(strip0x(raw)).toBase64();
  }
  return raw;
}

async function waitForNeoApplicationLog(rpcClient, txHash, timeoutMs = DEFAULT_WAIT_TIMEOUT_MS, pollIntervalMs = DEFAULT_POLL_INTERVAL_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      return await rpcClient.getApplicationLog(txHash);
    } catch {
      await sleep(pollIntervalMs);
    }
  }
  throw new Error(`timed out waiting for Neo application log: ${txHash}`);
}

function getNeoExecutionSummary(appLog) {
  const execution = appLog?.executions?.[0];
  return {
    vmState: execution?.vmstate || execution?.VMState || null,
    exception: execution?.exception || execution?.Exception || null,
  };
}

function loadNeoN3Context(payload = {}, { required = false, requireRpc = false } = {}) {
  const key =
    trimString(payload.private_key) ||
    trimString(payload.signing_key) ||
    trimString(payload.wif) ||
    env("PHALA_NEO_N3_PRIVATE_KEY", "PHALA_NEO_N3_WIF", "NEO_PLATFORM_KEY", "TEE_PRIVATE_KEY", "NEO_TESTNET_WIF");

  if (!key) {
    if (required) throw new Error("Neo N3 signing key is not configured");
    return null;
  }

  const rpcUrl = trimString(payload.rpc_url) || env("NEO_RPC_URL");
  if (requireRpc && !rpcUrl) throw new Error("NEO_RPC_URL is required for Neo N3 relay");

  const networkMagic = Number(payload.network_magic || env("NEO_NETWORK_MAGIC") || DEFAULT_NEO_NETWORK_MAGIC);
  return {
    account: new neoWallet.Account(key),
    rpcUrl,
    networkMagic: Number.isFinite(networkMagic) ? networkMagic : DEFAULT_NEO_NETWORK_MAGIC,
  };
}

function loadNeoXContext(payload = {}, { required = false, requireRpc = false } = {}) {
  let privateKey =
    trimString(payload.private_key) ||
    trimString(payload.signing_key) ||
    env("PHALA_NEOX_PRIVATE_KEY", "NEO_X_PRIVATE_KEY", "NEOX_PRIVATE_KEY", "EVM_PRIVATE_KEY");

  if (!privateKey) {
    if (required) throw new Error("Neo X signing key is not configured");
    return null;
  }

  const rpcUrl = trimString(payload.rpc_url) || env("NEO_X_RPC_URL", "NEOX_RPC_URL", "EVM_RPC_URL");
  if (requireRpc && !rpcUrl) throw new Error("NEO_X_RPC_URL is required for Neo X relay");

  if (/^[0-9a-fA-F]{64}$/.test(privateKey)) {
    privateKey = `0x${privateKey}`;
  }

  const provider = rpcUrl ? new JsonRpcProvider(rpcUrl) : null;
  const wallet = provider ? new EvmWallet(privateKey, provider) : new EvmWallet(privateKey);
  const chainIdRaw = payload.chain_id ?? payload.chainId ?? env("NEO_X_CHAIN_ID", "NEOX_CHAIN_ID", "EVM_CHAIN_ID");
  const chainId = chainIdRaw !== undefined && chainIdRaw !== "" ? Number(chainIdRaw) : undefined;

  return { wallet, provider, rpcUrl, chainId };
}

function maybeSignNeoN3Bytes(bytes) {
  const context = loadNeoN3Context({}, { required: false, requireRpc: false });
  if (!context) return null;

  const payloadBuffer = ensureBuffer(bytes);
  return {
    signature: neoWallet.sign(payloadBuffer.toString("hex"), context.account.privateKey),
    public_key: context.account.publicKey,
    address: context.account.address,
    script_hash: `0x${context.account.scriptHash}`,
  };
}

function buildSignedResultEnvelope(result) {
  const payloadBytes = Buffer.from(stableStringify(result), "utf8");
  const outputHash = sha256Hex(payloadBytes);
  const signature = maybeSignNeoN3Bytes(payloadBytes);
  return {
    output_hash: outputHash,
    attestation_hash: outputHash,
    signature: signature?.signature || null,
    public_key: signature?.public_key || null,
    signer_address: signature?.address || null,
    signer_script_hash: signature?.script_hash || null,
  };
}

async function ensureOracleKeyMaterial() {
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

async function decryptEncryptedToken(ciphertext) {
  if (!ciphertext) return null;
  const { privateKey } = await ensureOracleKeyMaterial();
  const plaintext = await globalThis.crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, decodeBase64(ciphertext));
  return Buffer.from(plaintext).toString("utf8");
}

async function executeProgrammableOracle(payload, context) {
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

async function executeStandaloneCompute(payload) {
  const script = resolveScript(payload);
  if (!script) {
    throw new Error("script or script_base64 required");
  }

  const entryPoint = trimString(payload.entry_point || "process") || "process";
  const helpers = {
    getCurrentTimestamp: () => Math.floor(Date.now() / 1000),
  };

  const evaluator = new Function(
    "input",
    "helpers",
    `${script}\nconst target = typeof ${entryPoint} === 'function' ? ${entryPoint} : (typeof process === 'function' ? process : null);\nif (!target) throw new Error('entry point not found');\nreturn target(input, helpers);`,
  );

  return {
    entry_point: entryPoint,
    result: await evaluator(payload.input ?? {}, helpers),
  };
}

async function performOracleFetch(payload) {
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

async function buildOracleResponse(payload, mode) {
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

async function fetchJson(url, init = {}) {
  const res = await fetch(url, init);
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  return { ok: res.ok, status: res.status, data };
}

async function fetchPriceQuote(symbol) {
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

async function handleFeedsPrice(symbol) {
  try {
    return json(200, await fetchPriceQuote(symbol));
  } catch (error) {
    return json(502, { error: error instanceof Error ? error.message : String(error) });
  }
}

async function relayNeoN3Invocation(payload) {
  const requestId = trimString(payload.request_id || payload.requestId) || `txproxy:${randomUUID()}`;
  const contractHash = normalizeContractHash(payload.contract_hash);
  const method = canonicalizeMethodName(payload.method);
  if (!method) throw new Error("method required");
  if (!allowlistAllows(contractHash, method)) {
    return { status: 403, body: { error: "contract/method not allowed" } };
  }

  const intentError = checkNeoIntentPolicy({ ...payload, contract_hash: contractHash, method });
  if (intentError) {
    return { status: intentError.status, body: { error: intentError.error } };
  }

  if (!rememberRequestId(requestId)) {
    return { status: 409, body: { error: "request_id already used", request_id: requestId } };
  }

  try {
    const context = loadNeoN3Context(payload, { required: true, requireRpc: true });
    const params = Array.isArray(payload.params) ? payload.params.map((param) => toNeoContractParam(param)) : [];
    const rpcClient = new neoRpc.RPCClient(context.rpcUrl);
    const contract = new experimental.SmartContract(contractHash, {
      rpcAddress: context.rpcUrl,
      networkMagic: context.networkMagic,
      account: context.account,
    });
    const signers = getNeoSigners(context.account, payload.signer_scope || payload.scope || "CalledByEntry");
    const simulation = await contract.testInvoke(method, params, signers);
    if (String(simulation?.state || "") === "FAULT") {
      forgetRequestId(requestId);
      return {
        status: 400,
        body: {
          request_id: requestId,
          error: simulation?.exception || "Neo invocation simulation failed",
          vm_state: simulation?.state || "FAULT",
        },
      };
    }

    const txHashRaw = await contract.invoke(method, params, signers);
    const txHash = trimString(txHashRaw).startsWith("0x") ? trimString(txHashRaw) : `0x${trimString(txHashRaw)}`;

    let vmState = simulation?.state || "HALT";
    let exception = simulation?.exception || undefined;
    let appLog;
    if (payload.wait) {
      appLog = await waitForNeoApplicationLog(
        rpcClient,
        txHash,
        Number(payload.timeout_ms) || DEFAULT_WAIT_TIMEOUT_MS,
        Number(payload.poll_interval_ms) || DEFAULT_POLL_INTERVAL_MS,
      );
      const summary = getNeoExecutionSummary(appLog);
      vmState = summary.vmState || vmState;
      exception = summary.exception || exception;
    }

    return {
      status: 200,
      body: {
        request_id: requestId,
        target_chain: "neo_n3",
        tx_hash: txHash,
        vm_state: vmState,
        exception,
        app_log: appLog,
      },
    };
  } catch (error) {
    forgetRequestId(requestId);
    throw error;
  }
}

async function sponsorNeoN3Transaction(payload) {
  const context = loadNeoN3Context(payload, { required: true, requireRpc: false });
  const txBase64 = trimString(payload.tx_base64 || payload.txBase64);
  const userAddress = trimString(payload.user_address || payload.userAddress);
  if (!txBase64 || !userAddress) {
    throw new Error("tx_base64 and user_address are required for Neo N3 sponsorship relay");
  }

  const sponsorAccount = context.account;
  const transaction = tx.Transaction.deserialize(txBase64);
  const hasUserSigner = transaction.signers.some((signer) => neoWallet.getAddressFromScriptHash(String(signer.account)) === userAddress);
  if (!hasUserSigner) {
    throw new Error("transaction does not belong to the supplied user_address");
  }

  const sponsorScriptHash = sponsorAccount.scriptHash;
  const hasSponsorSigner = transaction.signers.some((signer) => String(signer.account) === sponsorScriptHash);
  if (!hasSponsorSigner) {
    transaction.signers.push(new tx.Signer({
      account: sponsorAccount.scriptHash,
      scopes: tx.WitnessScope.None,
    }));
  }

  const feePerByte = Number(payload.fee_per_byte || payload.feePerByte || 1000);
  const priorityFee = Number(payload.priority_fee || payload.priorityFee || 100000);
  const dummySignatures = transaction.signers.map((signer) => {
    if (String(signer.account) === sponsorAccount.scriptHash) {
      return new tx.Witness({
        invocationScript: "0c40" + "00".repeat(64),
        verificationScript: "21" + sponsorAccount.publicKey + "ac",
      });
    }
    return new tx.Witness({ invocationScript: "", verificationScript: "" });
  });

  const size = transaction.serialize().length / 2 + dummySignatures.reduce((sum, witness) => sum + witness.serialize().length / 2, 0);
  const calculatedFee = (size * feePerByte) + priorityFee;
  transaction.networkFee = u.BigInteger.fromNumber(Math.floor(calculatedFee));
  transaction.sign(sponsorAccount, context.networkMagic);

  const sponsoredTx = transaction.serialize(true);
  const result = {
    target_chain: "neo_n3",
    sponsor_address: sponsorAccount.address,
    sponsor_public_key: sponsorAccount.publicKey,
    network_fee: transaction.networkFee.toString(),
    sponsored_tx_base64: sponsoredTx,
    witnesses: transaction.witnesses.map((witness) => witness.serialize()),
  };

  if (!payload.broadcast) {
    return result;
  }

  if (!context.rpcUrl) {
    throw new Error("NEO_RPC_URL is required to broadcast sponsored Neo N3 transactions");
  }

  const rpcClient = new neoRpc.RPCClient(context.rpcUrl);
  const txHashRaw = await rpcClient.sendRawTransaction(normalizeNeoRawTransaction(sponsoredTx));
  const txHash = trimString(txHashRaw).startsWith("0x") ? trimString(txHashRaw) : `0x${trimString(txHashRaw)}`;
  let appLog;
  if (payload.wait) {
    appLog = await waitForNeoApplicationLog(
      rpcClient,
      txHash,
      Number(payload.timeout_ms) || DEFAULT_WAIT_TIMEOUT_MS,
      Number(payload.poll_interval_ms) || DEFAULT_POLL_INTERVAL_MS,
    );
  }

  return {
    ...result,
    tx_hash: txHash,
    app_log: appLog,
  };
}

async function broadcastNeoN3RawTransaction(payload) {
  const context = loadNeoN3Context(payload, { required: false, requireRpc: true });
  const rpcClient = new neoRpc.RPCClient(context.rpcUrl);
  const txHashRaw = await rpcClient.sendRawTransaction(normalizeNeoRawTransaction(
    payload.raw_transaction || payload.raw_tx || payload.signed_tx || payload.tx_base64 || payload.tx_hex,
  ));
  const txHash = trimString(txHashRaw).startsWith("0x") ? trimString(txHashRaw) : `0x${trimString(txHashRaw)}`;

  let appLog;
  if (payload.wait) {
    appLog = await waitForNeoApplicationLog(
      rpcClient,
      txHash,
      Number(payload.timeout_ms) || DEFAULT_WAIT_TIMEOUT_MS,
      Number(payload.poll_interval_ms) || DEFAULT_POLL_INTERVAL_MS,
    );
  }

  return {
    target_chain: "neo_n3",
    tx_hash: txHash,
    app_log: appLog,
  };
}

function normalizeBigIntLike(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  return BigInt(String(value));
}

function normalizeEvmTransaction(payload) {
  const txPayload = payload.transaction && typeof payload.transaction === "object" ? payload.transaction : payload;
  const transaction = {
    to: trimString(txPayload.to),
    data: trimString(txPayload.data || txPayload.calldata || txPayload.call_data || "0x") || "0x",
    value: normalizeBigIntLike(txPayload.value),
    nonce: txPayload.nonce !== undefined ? Number(txPayload.nonce) : undefined,
    chainId: txPayload.chain_id !== undefined ? Number(txPayload.chain_id) : (txPayload.chainId !== undefined ? Number(txPayload.chainId) : undefined),
    type: txPayload.type !== undefined ? Number(txPayload.type) : undefined,
    gasLimit: normalizeBigIntLike(txPayload.gas_limit ?? txPayload.gasLimit),
    gasPrice: normalizeBigIntLike(txPayload.gas_price ?? txPayload.gasPrice),
    maxFeePerGas: normalizeBigIntLike(txPayload.max_fee_per_gas ?? txPayload.maxFeePerGas),
    maxPriorityFeePerGas: normalizeBigIntLike(txPayload.max_priority_fee_per_gas ?? txPayload.maxPriorityFeePerGas),
  };

  if (!transaction.to) throw new Error("Neo X transaction requires to");
  return transaction;
}

async function relayNeoXTransaction(payload) {
  const context = loadNeoXContext(payload, { required: true, requireRpc: payload.broadcast !== false || !!payload.raw_transaction });
  let rawTransaction = trimString(payload.raw_transaction || payload.raw_tx || payload.signed_tx || payload.tx_hex);
  if (rawTransaction && !rawTransaction.startsWith("0x")) {
    rawTransaction = `0x${strip0x(rawTransaction)}`;
  }

  let transactionRequest;
  if (!rawTransaction) {
    transactionRequest = normalizeEvmTransaction(payload);
    if (!transactionRequest.chainId && context.chainId) {
      transactionRequest.chainId = context.chainId;
    }
    rawTransaction = await context.wallet.signTransaction(transactionRequest);
  }

  if (payload.broadcast === false) {
    return {
      target_chain: "neo_x",
      address: context.wallet.address,
      raw_transaction: rawTransaction,
    };
  }

  if (!context.provider) throw new Error("Neo X RPC provider is required for relay");
  const txHash = await context.provider.send("eth_sendRawTransaction", [rawTransaction]);
  let receipt;
  if (payload.wait) {
    receipt = await context.provider.waitForTransaction(txHash, Number(payload.confirmations) || 1, Number(payload.timeout_ms) || DEFAULT_WAIT_TIMEOUT_MS);
  }

  return {
    target_chain: "neo_x",
    address: context.wallet.address,
    tx_hash: txHash,
    raw_transaction: rawTransaction,
    receipt,
  };
}

async function handleOracleFeed(payload) {
  const quote = await fetchPriceQuote(payload.symbol || "NEO-USD");
  const roundId = String(payload.round_id || Math.floor(Date.now() / 1000));
  const sourceSetId = String(payload.source_set_id || 0);
  const timestamp = Math.floor(Date.now() / 1000);
  let anchoredTx = null;
  let relayStatus = "skipped";

  const priceFeedHash = normalizeNeoHash160(env("CONTRACT_PRICEFEED_HASH"));
  const neoContext = loadNeoN3Context(payload, { required: false, requireRpc: false });
  if (priceFeedHash && isConfiguredHash160(priceFeedHash) && neoContext) {
    const invokeResult = await relayNeoN3Invocation({
      request_id: trimString(payload.request_id) || `pricefeed:${randomUUID()}`,
      contract_hash: priceFeedHash,
      method: "update",
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

  return json(200, {
    mode: "pricefeed",
    target_chain: "neo_n3",
    ...quote,
    relay_status: relayStatus,
    anchored_tx: anchoredTx,
  });
}

async function handleVrf(payload) {
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

async function handleComputeExecute(payload) {
  try {
    const mode = trimString(payload.mode || (payload.function || payload.compute_fn ? "builtin" : "script")) || "script";
    const result = mode === "builtin" ? await executeBuiltinCompute(payload) : await executeStandaloneCompute(payload);
    const signed = buildSignedResultEnvelope(result);
    return json(200, {
      mode,
      target_chain: payload.target_chain ? normalizeTargetChain(payload.target_chain) : "neo_n3",
      target_chain_id: payload.target_chain_id ? String(payload.target_chain_id) : null,
      ...result,
      output_hash: signed.output_hash,
      signature: signed.signature,
      public_key: signed.public_key,
      attestation_hash: signed.attestation_hash,
    });
  } catch (error) {
    return json(400, { error: error instanceof Error ? error.message : String(error) });
  }
}

function handleComputeFunctions() {
  return json(200, { functions: listBuiltinComputeFunctions() });
}

function handleComputeJobs(jobId = null) {
  if (jobId) {
    return json(200, {
      id: jobId,
      status: "completed",
      mode: "morpheus-compute",
      result: null,
      note: "Job detail response served by the Morpheus compute module.",
    });
  }

  return json(200, {
    jobs: [],
    mode: "morpheus-compute",
    note: "Morpheus compute exposes built-in and script-driven off-chain functions from the same trusted worker runtime.",
  });
}

async function handleSignPayload(payload) {
  const targetChain = normalizeTargetChain(payload.target_chain);
  if (targetChain === "neo_n3") {
    const context = loadNeoN3Context(payload, { required: true, requireRpc: false });
    const { bytes, source } = resolveSigningBytes(payload);
    const signature = neoWallet.sign(bytes.toString("hex"), context.account.privateKey);
    return json(200, {
      target_chain: "neo_n3",
      source,
      payload_hash: sha256Hex(bytes),
      signature,
      public_key: context.account.publicKey,
      address: context.account.address,
      script_hash: `0x${context.account.scriptHash}`,
    });
  }

  const context = loadNeoXContext(payload, { required: true, requireRpc: false });
  if (payload.typed_data && typeof payload.typed_data === "object") {
    const typedData = payload.typed_data;
    const signature = await context.wallet.signTypedData(typedData.domain || {}, typedData.types || {}, typedData.value || {});
    return json(200, {
      target_chain: "neo_x",
      signature,
      address: context.wallet.address,
      mode: "typed_data",
      payload_hash: sha256Hex(stableStringify(typedData)),
    });
  }

  if (payload.transaction && typeof payload.transaction === "object") {
    const signedTransaction = await context.wallet.signTransaction(normalizeEvmTransaction(payload));
    return json(200, {
      target_chain: "neo_x",
      address: context.wallet.address,
      mode: "transaction",
      raw_transaction: signedTransaction,
      payload_hash: sha256Hex(signedTransaction),
    });
  }

  const { bytes, source } = resolveSigningBytes(payload);
  const signature = await context.wallet.signMessage(bytes);
  return json(200, {
    target_chain: "neo_x",
    source,
    payload_hash: sha256Hex(bytes),
    signature,
    address: context.wallet.address,
    mode: "message",
  });
}

async function handleRelayTransaction(payload) {
  const targetChain = normalizeTargetChain(payload.target_chain);
  if (targetChain === "neo_x") {
    return json(200, await relayNeoXTransaction(payload));
  }

  if ((payload.tx_base64 || payload.txBase64) && (payload.user_address || payload.userAddress)) {
    return json(200, await sponsorNeoN3Transaction(payload));
  }

  if (payload.raw_transaction || payload.raw_tx || payload.signed_tx || payload.tx_base64 || payload.tx_hex) {
    return json(200, await broadcastNeoN3RawTransaction(payload));
  }

  const invokeResult = await relayNeoN3Invocation(payload);
  return json(invokeResult.status, invokeResult.body);
}

async function handleTxProxyInvoke(payload) {
  const invokeResult = await relayNeoN3Invocation(payload);
  return json(invokeResult.status, invokeResult.body);
}

async function handleHealth() {
  return json(200, {
    status: "ok",
    runtime: "phala-worker",
    oracle: {
      privacy_oracle: true,
      target_chains: ["neo_n3", "neo_x"],
      pricefeed_chain: "neo_n3",
      compute_merged_into_oracle: true,
    },
    features: [
      "oracle/public-key",
      "oracle/query",
      "oracle/smart-fetch",
      "oracle/feed",
      "feeds/price/:symbol",
      "vrf/random",
      "txproxy/invoke",
      "sign/payload",
      "relay/transaction",
      "compute/functions",
      "compute/execute",
    ],
  });
}

async function requireAuth(request) {
  const expected = env("PHALA_API_TOKEN", "PHALA_SHARED_SECRET");
  const auth = trimString(request.headers.get("authorization") || request.headers.get("x-phala-token"));
  if (!expected) return { ok: true };
  if (auth === `Bearer ${expected}` || auth === expected) return { ok: true };
  return { ok: false, response: json(401, { error: "unauthorized" }) };
}

export default async function handler(request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "");
  const payload = request.method === "GET" ? {} : await request.json().catch(() => ({}));

  try {
    if (path.endsWith("/health")) return handleHealth();

    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    if (path.endsWith("/oracle/public-key")) {
      const keyMaterial = await ensureOracleKeyMaterial();
      return json(200, {
        algorithm: keyMaterial.algorithm,
        public_key: keyMaterial.publicKeyDer,
        public_key_pem: keyMaterial.publicKeyPem,
      });
    }

    if (path.endsWith("/oracle/query")) {
      return json(200, await buildOracleResponse(payload, "query"));
    }

    if (path.endsWith("/oracle/smart-fetch")) {
      return json(200, await buildOracleResponse(payload, "smart-fetch"));
    }

    if (/\/feeds\/price\/.+/.test(path)) {
      return handleFeedsPrice(decodeURIComponent(path.split("/").pop() || "NEO-USD"));
    }
    if (path.endsWith("/feeds/price")) {
      return handleFeedsPrice(url.searchParams.get("symbol") || payload.symbol || "NEO-USD");
    }

    if (path.endsWith("/vrf/random")) return handleVrf(payload);
    if (path.endsWith("/oracle/feed") || payload.action === "oracle_feed") return handleOracleFeed(payload);
    if (path.endsWith("/txproxy/invoke")) return handleTxProxyInvoke(payload);
    if (path.endsWith("/sign/payload") || payload.action === "sign_payload") return handleSignPayload(payload);
    if (path.endsWith("/relay/transaction") || payload.action === "relay_transaction") return handleRelayTransaction(payload);
    if (path.endsWith("/compute/functions")) return handleComputeFunctions();
    if (path.endsWith("/compute/execute")) return handleComputeExecute(payload);
    if (/\/compute\/jobs\/.+/.test(path)) return handleComputeJobs(path.split("/").pop() || null);
    if (path.endsWith("/compute/jobs")) return handleComputeJobs();

    return json(404, { error: "not found", path });
  } catch (error) {
    return json(400, { error: error instanceof Error ? error.message : String(error) });
  }
}
