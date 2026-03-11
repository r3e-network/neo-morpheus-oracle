import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { experimental, rpc as neoRpc, sc, tx, wallet } from "@cityofzion/neon-js";
import {
  buildEncryptedJsonPatch,
  encodeUtf8Base64,
  jsonPretty,
  loadExampleEnv,
  normalizeHash160,
  readDeploymentRegistry,
  repoRoot,
  sleep,
  trimString,
  tryParseJson,
} from "./common.mjs";

const GAS_HASH = "0xd2a4cff31913016155e38e474a2c06d08be276cf";

function sha256Hex(value) {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

function parseStackItem(item) {
  if (!item || typeof item !== "object") return null;
  const type = trimString(item.type).toLowerCase();
  switch (type) {
    case "array":
    case "struct":
      return Array.isArray(item.value) ? item.value.map((entry) => parseStackItem(entry)) : [];
    case "hash160":
    case "hash256":
    case "string":
      return String(item.value ?? "");
    case "integer":
      return String(item.value ?? "0");
    case "boolean":
      return Boolean(item.value);
    case "bytestring":
    case "bytearray": {
      const raw = trimString(item.value);
      if (!raw) return "";
      const bytes = Buffer.from(raw, "base64");
      if (bytes.length === 20) {
        return `0x${Buffer.from(bytes).reverse().toString("hex")}`;
      }
      const text = bytes.toString("utf8");
      return /^[\x09\x0a\x0d\x20-\x7e]*$/.test(text) ? text : `0x${bytes.toString("hex")}`;
    }
    default:
      return item.value ?? null;
  }
}

function decodeCallbackArray(item) {
  if (!item || item.type !== "Array" || !Array.isArray(item.value) || item.value.length < 4) return null;
  const [requestTypeItem, successItem, resultItem, errorItem] = item.value;
  const requestType = Buffer.from(trimString(requestTypeItem?.value || ""), "base64").toString("utf8");
  const resultText = Buffer.from(trimString(resultItem?.value || ""), "base64").toString("utf8");
  const errorText = Buffer.from(trimString(errorItem?.value || ""), "base64").toString("utf8");
  return {
    request_type: requestType,
    success: Boolean(successItem?.value),
    result_text: resultText,
    result_json: tryParseJson(resultText),
    error_text: errorText,
  };
}

async function invokeRead(rpcClient, contractHash, method, params = []) {
  const response = await rpcClient.invokeFunction(contractHash, method, params);
  if (String(response.state || "").toUpperCase() === "FAULT") {
    throw new Error(`${method} faulted: ${response.exception || "unknown error"}`);
  }
  return parseStackItem(response.stack?.[0]);
}

async function ensureRequestFeeCredit(account, rpcUrl, networkMagic, rpcClient, oracleHash, requiredRequests) {
  const currentCredit = BigInt(await invokeRead(rpcClient, oracleHash, "feeCreditOf", [{ type: "Hash160", value: `0x${account.scriptHash}` }]) || "0");
  const requestFee = BigInt(await invokeRead(rpcClient, oracleHash, "requestFee", []) || "0");
  const requiredCredit = requestFee * BigInt(requiredRequests);
  if (currentCredit >= requiredCredit) {
    return { request_fee: requestFee.toString(), current_credit: currentCredit.toString(), deposit_amount: "0" };
  }

  const gas = new experimental.SmartContract(GAS_HASH, {
    rpcAddress: rpcUrl,
    networkMagic,
    account,
  });
  const deficit = requiredCredit - currentCredit;
  await gas.invoke("transfer", [
    sc.ContractParam.hash160(`0x${account.scriptHash}`),
    sc.ContractParam.hash160(oracleHash),
    sc.ContractParam.integer(deficit.toString()),
    sc.ContractParam.any(null),
  ]);

  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const updatedCredit = BigInt(await invokeRead(rpcClient, oracleHash, "feeCreditOf", [{ type: "Hash160", value: `0x${account.scriptHash}` }]) || "0");
    if (updatedCredit >= requiredCredit) {
      return { request_fee: requestFee.toString(), current_credit: updatedCredit.toString(), deposit_amount: deficit.toString() };
    }
    await sleep(2000);
  }

  throw new Error("timed out waiting for Neo N3 request fee credit");
}

async function waitForRequestId(rpcClient, txid, timeoutMs = 90000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const appLog = await rpcClient.getApplicationLog(txid);
      const notification = appLog.executions?.flatMap((execution) => execution.notifications || []).find((entry) => entry.eventname === "OracleRequested");
      const requestId = notification?.state?.value?.[0]?.value ?? null;
      if (requestId) return requestId;
    } catch {}
    await sleep(2000);
  }
  throw new Error(`timed out waiting for Neo N3 request id from tx ${txid}`);
}

async function waitForCallback(rpcClient, consumerHash, requestId, timeoutMs = 180000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const response = await rpcClient.invokeFunction(consumerHash, "getCallback", [{ type: "Integer", value: String(requestId) }]);
    const decoded = decodeCallbackArray(response.stack?.[0]);
    if (decoded && (decoded.request_type || decoded.result_text || decoded.error_text)) {
      return decoded;
    }
    await sleep(2000);
  }
  throw new Error(`timed out waiting for Neo N3 callback ${requestId}`);
}

async function fetchRequestRecord(rpcClient, oracleHash, requestId) {
  const response = await rpcClient.invokeFunction(oracleHash, "getRequest", [{ type: "Integer", value: String(requestId) }]);
  const decoded = parseStackItem(response.stack?.[0]);
  if (!Array.isArray(decoded) || decoded.length < 12) return null;
  return {
    request_id: String(decoded[0] ?? requestId),
    request_type: String(decoded[1] ?? ""),
    payload_text: String(decoded[2] ?? ""),
    payload_json: tryParseJson(String(decoded[2] ?? "")),
    callback_contract: String(decoded[3] ?? ""),
    callback_method: String(decoded[4] ?? ""),
    requester: String(decoded[5] ?? ""),
    status: String(decoded[6] ?? ""),
    created_at_ms: String(decoded[7] ?? ""),
    fulfilled_at_ms: String(decoded[8] ?? ""),
    success: Boolean(decoded[9]),
    result_text: String(decoded[10] ?? ""),
    error_text: String(decoded[11] ?? ""),
  };
}

function summarizeCiphertext(value) {
  const raw = trimString(value);
  if (!raw) return null;
  return {
    ciphertext_length: raw.length,
    ciphertext_sha256: sha256Hex(raw),
  };
}

function extractActualValue(callback, requestType) {
  const normalized = trimString(requestType).toLowerCase();
  if (normalized.includes("compute")) {
    return callback?.result_json?.result?.result ?? null;
  }
  return callback?.result_json?.result?.result ?? callback?.result_json?.result?.extracted_value ?? null;
}

function compactVerification(callback) {
  return {
    output_hash: callback?.result_json?.verification?.output_hash || null,
    attestation_hash: callback?.result_json?.verification?.attestation_hash || null,
    public_key: callback?.result_json?.verification?.public_key || null,
    tee_app_id: callback?.result_json?.verification?.tee_attestation?.app_id || null,
    tee_compose_hash: callback?.result_json?.verification?.tee_attestation?.compose_hash || null,
  };
}

function markdownJson(value) {
  return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}

await loadExampleEnv();

const network = trimString(process.env.MORPHEUS_NETWORK || "mainnet") || "mainnet";
const registry = await readDeploymentRegistry(network);
const deployment = registry.neo_n3 || {};
const defaultRpcUrl = network === "mainnet" ? "https://mainnet1.neo.coz.io:443" : "https://testnet1.neo.coz.io:443";
const defaultNetworkMagic = network === "mainnet" ? 860833102 : 894710606;
const rpcUrl = trimString(process.env.NEO_RPC_URL || deployment.rpc_url || defaultRpcUrl);
const networkMagic = Number(process.env.NEO_NETWORK_MAGIC || deployment.network_magic || defaultNetworkMagic);
const wif = trimString(process.env.NEO_N3_WIF || process.env.NEO_TESTNET_WIF || process.env.MORPHEUS_RELAYER_NEO_N3_WIF || "");
const consumerHash = normalizeHash160(process.env.EXAMPLE_N3_CONSUMER_HASH || deployment.example_consumer_hash || "");
const oracleHash = normalizeHash160(process.env.CONTRACT_MORPHEUS_ORACLE_HASH || deployment.oracle_hash || "");
const callbackTimeoutMs = Number(process.env.EXAMPLE_CALLBACK_TIMEOUT_MS || 180000);

if (!wif || !consumerHash || !oracleHash) {
  throw new Error("NEO_N3_WIF, EXAMPLE_N3_CONSUMER_HASH, and CONTRACT_MORPHEUS_ORACLE_HASH are required");
}

const account = new wallet.Account(wif);
const rpcClient = new neoRpc.RPCClient(rpcUrl);
const signers = [new tx.Signer({ account: account.scriptHash, scopes: tx.WitnessScope.Global })];
const consumer = new experimental.SmartContract(consumerHash, {
  rpcAddress: rpcUrl,
  networkMagic,
  account,
});

const cases = [
  {
    id: "provider_plain",
    title: "Privacy Oracle builtin provider, public params",
    requestType: "privacy_oracle",
    async prepare() {
      const publicPayload = {
        provider: "twelvedata",
        symbol: "NEO-USD",
        json_path: "price",
        target_chain: "neo_n3",
      };
      return {
        publicPayload,
        payloadText: JSON.stringify(publicPayload),
        confidentialSummary: null,
        expectedDescription: "Extracted value is a non-empty NEO/USD price string.",
        validate(callback) {
          const actual = extractActualValue(callback, "privacy_oracle");
          if (!trimString(actual)) throw new Error("missing extracted value");
        },
      };
    },
  },
  {
    id: "provider_encrypted_params",
    title: "Privacy Oracle builtin provider, encrypted params in user tx",
    requestType: "privacy_oracle",
    async prepare() {
      const confidentialPatch = { json_path: "price" };
      const encryptedParams = await buildEncryptedJsonPatch("neo_n3", confidentialPatch);
      const publicPayload = {
        provider: "twelvedata",
        symbol: "NEO-USD",
        target_chain: "neo_n3",
        encrypted_params: encryptedParams,
      };
      return {
        publicPayload,
        payloadText: JSON.stringify(publicPayload),
        confidentialSummary: {
          plaintext_patch: confidentialPatch,
          ...summarizeCiphertext(encryptedParams),
        },
        expectedDescription: "Encrypted json_path is merged inside TEE and returns a price string.",
        validate(callback) {
          const actual = extractActualValue(callback, "privacy_oracle");
          if (!trimString(actual)) throw new Error("missing extracted value");
        },
      };
    },
  },
  {
    id: "compute_builtin_encrypted",
    title: "Privacy Compute builtin function, encrypted payload",
    requestType: "compute",
    async prepare() {
      const confidentialPayload = {
        mode: "builtin",
        function: "math.modexp",
        input: {
          base: "2",
          exponent: "10",
          modulus: "17",
        },
        target_chain: "neo_n3",
      };
      const encryptedPayload = await buildEncryptedJsonPatch("neo_n3", confidentialPayload);
      const publicPayload = { encrypted_payload: encryptedPayload };
      return {
        publicPayload,
        payloadText: JSON.stringify(publicPayload),
        confidentialSummary: {
          plaintext_payload: confidentialPayload,
          ...summarizeCiphertext(encryptedPayload),
        },
        expectedDescription: "math.modexp returns 4.",
        validate(callback) {
          const actual = extractActualValue(callback, "compute");
          if (actual?.value !== "4") {
            throw new Error(`unexpected builtin compute result: ${JSON.stringify(actual)}`);
          }
        },
      };
    },
  },
  {
    id: "compute_custom_script_encrypted",
    title: "Privacy Compute custom JS function, encrypted payload",
    requestType: "compute",
    async prepare() {
      const confidentialPayload = {
        mode: "script",
        script: "function run(input) { return input.left + input.right; }",
        entry_point: "run",
        input: { left: 20, right: 22 },
        target_chain: "neo_n3",
      };
      const encryptedPayload = await buildEncryptedJsonPatch("neo_n3", confidentialPayload);
      const publicPayload = { encrypted_payload: encryptedPayload };
      return {
        publicPayload,
        payloadText: JSON.stringify(publicPayload),
        confidentialSummary: {
          plaintext_payload: confidentialPayload,
          encryption_mode: "X25519-HKDF-SHA256-AES-256-GCM",
          ...summarizeCiphertext(encryptedPayload),
        },
        expectedDescription: "Encrypted custom compute function returns 42.",
        validate(callback) {
          const actual = extractActualValue(callback, "compute");
          if (Number(actual) !== 42) {
            throw new Error(`unexpected custom compute result: ${JSON.stringify(actual)}`);
          }
        },
      };
    },
  },
  {
    id: "oracle_custom_url_encrypted_params",
    title: "Privacy Oracle custom URL, encrypted params",
    requestType: "oracle",
    async prepare() {
      const confidentialPatch = { json_path: "args.probe" };
      const encryptedParams = await buildEncryptedJsonPatch("neo_n3", confidentialPatch);
      const publicPayload = {
        url: "https://postman-echo.com/get?probe=neo-morpheus",
        target_chain: "neo_n3",
        encrypted_params: encryptedParams,
      };
      return {
        publicPayload,
        payloadText: JSON.stringify(publicPayload),
        confidentialSummary: {
          plaintext_patch: confidentialPatch,
          ...summarizeCiphertext(encryptedParams),
        },
        expectedDescription: "Custom URL flow returns the echoed probe string.",
        validate(callback) {
          const actual = extractActualValue(callback, "oracle");
          if (actual !== "neo-morpheus") {
            throw new Error(`unexpected custom URL result: ${JSON.stringify(actual)}`);
          }
        },
      };
    },
  },
  {
    id: "oracle_custom_url_encrypted_script",
    title: "Privacy Oracle custom URL, encrypted params plus custom JS function",
    requestType: "oracle",
    async prepare() {
      const confidentialPatch = {
        json_path: "args.probe",
        script: "function process(data) { return data.args.probe + '-script'; }",
      };
      const encryptedParams = await buildEncryptedJsonPatch("neo_n3", confidentialPatch);
      const publicPayload = {
        url: "https://postman-echo.com/get?probe=neo-morpheus",
        target_chain: "neo_n3",
        encrypted_params: encryptedParams,
      };
      return {
        publicPayload,
        payloadText: JSON.stringify(publicPayload),
        confidentialSummary: {
          plaintext_patch: confidentialPatch,
          encryption_mode: "X25519-HKDF-SHA256-AES-256-GCM",
          ...summarizeCiphertext(encryptedParams),
        },
        expectedDescription: "Encrypted custom script transforms the echoed probe into neo-morpheus-script.",
        validate(callback) {
          const actual = extractActualValue(callback, "oracle");
          if (actual !== "neo-morpheus-script") {
            throw new Error(`unexpected custom script oracle result: ${JSON.stringify(actual)}`);
          }
        },
      };
    },
  },
  {
    id: "provider_encrypted_script",
    title: "Privacy Oracle builtin provider, encrypted params plus custom JS function",
    requestType: "privacy_oracle",
    async prepare() {
      const confidentialPatch = {
        json_path: "price",
        script: "function process(data) { return Number(data.price) > 0; }",
      };
      const encryptedParams = await buildEncryptedJsonPatch("neo_n3", confidentialPatch);
      const publicPayload = {
        provider: "twelvedata",
        symbol: "NEO-USD",
        target_chain: "neo_n3",
        encrypted_params: encryptedParams,
      };
      return {
        publicPayload,
        payloadText: JSON.stringify(publicPayload),
        confidentialSummary: {
          plaintext_patch: confidentialPatch,
          encryption_mode: "X25519-HKDF-SHA256-AES-256-GCM",
          ...summarizeCiphertext(encryptedParams),
        },
        expectedDescription: "Encrypted custom function over builtin provider result returns true.",
        validate(callback) {
          const actual = extractActualValue(callback, "privacy_oracle");
          if (actual !== true) {
            throw new Error(`unexpected provider script result: ${JSON.stringify(actual)}`);
          }
        },
      };
    },
  },
];

const feeStatus = await ensureRequestFeeCredit(account, rpcUrl, networkMagic, rpcClient, oracleHash, cases.length);
const results = [];

for (const testCase of cases) {
  console.log(`Running mainnet privacy case ${testCase.id}...`);
  const prepared = await testCase.prepare();
  const txid = await consumer.invoke("requestRaw", [
    testCase.requestType,
    sc.ContractParam.byteArray(encodeUtf8Base64(prepared.payloadText)),
  ], signers);

  const requestId = await waitForRequestId(rpcClient, txid);
  const [callback, requestRecord] = await Promise.all([
    waitForCallback(rpcClient, consumerHash, requestId, callbackTimeoutMs),
    fetchRequestRecord(rpcClient, oracleHash, requestId),
  ]);

  if (!callback.success) {
    throw new Error(`case ${testCase.id} failed: ${callback.error_text || "unknown error"}`);
  }
  prepared.validate(callback);

  results.push({
    id: testCase.id,
    title: testCase.title,
    request_type: testCase.requestType,
    expected: prepared.expectedDescription,
    public_payload: prepared.publicPayload,
    confidential_summary: prepared.confidentialSummary,
    txid,
    request_id: requestId,
    onchain_request: requestRecord ? {
      request_type: requestRecord.request_type,
      requester: requestRecord.requester,
      callback_contract: requestRecord.callback_contract,
      callback_method: requestRecord.callback_method,
      payload_sha256: sha256Hex(requestRecord.payload_text),
      payload_contains_encrypted_params: requestRecord.payload_text.includes("encrypted_params"),
      payload_contains_encrypted_payload: requestRecord.payload_text.includes("encrypted_payload"),
    } : null,
    callback: {
      success: callback.success,
      actual_value: extractActualValue(callback, testCase.requestType),
      result_json: callback.result_json,
      verification: compactVerification(callback),
    },
    pass: true,
  });
}

const generatedAt = new Date().toISOString();
const reportJson = {
  generated_at: generatedAt,
  network,
  chain: "neo_n3",
  oracle_hash: oracleHash,
  consumer_hash: consumerHash,
  request_fee: feeStatus.request_fee,
  request_credit: feeStatus.current_credit,
  cases: results,
};

const reportDate = generatedAt.slice(0, 10);
const jsonOutputPath = path.resolve(repoRoot, "examples/deployments", `mainnet-privacy-validation.${reportDate}.json`);
const jsonLatestPath = path.resolve(repoRoot, "examples/deployments", "mainnet-privacy-validation.latest.json");
const markdownOutputPath = path.resolve(repoRoot, "docs", `MAINNET_PRIVACY_VALIDATION_${reportDate}.md`);

const markdown = [
  "# Mainnet Privacy Validation",
  "",
  `Generated: ${generatedAt}`,
  "",
  "## Environment",
  "",
  `- Network: \`${network}\``,
  `- Chain: \`neo_n3\``,
  `- Oracle: \`${oracleHash}\``,
  `- Example consumer (custom contract): \`${consumerHash}\``,
  `- Request fee: \`${feeStatus.request_fee}\``,
  "",
  "## Case Matrix",
  "",
  "| Case | Request Type | Tx | Request ID | Result | Pass |",
  "| --- | --- | --- | --- | --- | --- |",
  ...results.map((item) => `| ${item.id} | ${item.request_type} | \`${item.txid}\` | \`${item.request_id}\` | \`${JSON.stringify(item.callback.actual_value)}\` | yes |`),
  "",
  "## Detailed Results",
  "",
  ...results.flatMap((item) => [
    `### ${item.id}`,
    "",
    `- Title: ${item.title}`,
    `- Request type: \`${item.request_type}\``,
    `- Txid: \`${item.txid}\``,
    `- Request ID: \`${item.request_id}\``,
    `- Expected: ${item.expected}`,
    `- Actual: \`${JSON.stringify(item.callback.actual_value)}\``,
    "",
    "Public payload:",
    markdownJson(item.public_payload),
    "",
    "Confidential payload summary:",
    markdownJson(item.confidential_summary),
    "",
    "On-chain request summary:",
    markdownJson(item.onchain_request),
    "",
    "Callback result:",
    markdownJson(item.callback.result_json),
    "",
    "Verification summary:",
    markdownJson(item.callback.verification),
    "",
  ]),
].join("\n");

await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true });
await fs.mkdir(path.dirname(markdownOutputPath), { recursive: true });
await fs.writeFile(jsonOutputPath, jsonPretty(reportJson), "utf8");
await fs.writeFile(jsonLatestPath, jsonPretty(reportJson), "utf8");
await fs.writeFile(markdownOutputPath, `${markdown}\n`, "utf8");

process.stdout.write(jsonPretty({
  ...reportJson,
  json_report: path.relative(repoRoot, jsonOutputPath),
  markdown_report: path.relative(repoRoot, markdownOutputPath),
}));
