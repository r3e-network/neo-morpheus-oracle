import fs from "node:fs/promises";
import path from "node:path";
import { experimental, rpc as neoRpc, sc, tx, u, wallet } from "@cityofzion/neon-js";
import {
  jsonPretty,
  loadExampleEnv,
  normalizeHash160,
  readDeploymentRegistry,
  repoRoot,
  resolveNeoN3SignerWif,
  sleep,
  trimString,
  tryParseJson,
  writeValidationArtifacts,
} from "./common.mjs";

const aaRepoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../neo-abstract-account");
const AA_BUILD_DIR = path.resolve(aaRepoRoot, "contracts/bin/v3");
const EXAMPLE_BUILD_DIR = path.resolve(repoRoot, "examples/build/n3");

const GAS_HASH = "0xd2a4cff31913016155e38e474a2c06d08be276cf";

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeHash(value = "") {
  const raw = trimString(value).replace(/^0x/i, "").toLowerCase();
  return raw ? `0x${raw}` : "";
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

async function loadContractArtifacts(baseName, buildDir = AA_BUILD_DIR) {
  const nefPath = path.join(buildDir, `${baseName}.nef`);
  const manifestPath = path.join(buildDir, `${baseName}.manifest.json`);
  const [nefBytes, manifestRaw] = await Promise.all([
    fs.readFile(nefPath),
    fs.readFile(manifestPath, "utf8"),
  ]);
  const manifestJson = JSON.parse(manifestRaw);
  return {
    nef: sc.NEF.fromBuffer(nefBytes),
    manifestJson,
  };
}

function decodeDeployHash(appLog) {
  const notification = appLog?.executions?.flatMap((execution) => execution.notifications || []).find((entry) => entry.eventname === "Deploy");
  const value = notification?.state?.value?.[0]?.value || "";
  const bytes = Buffer.from(value, "base64");
  if (bytes.length !== 20) throw new Error("failed to decode deployed Neo N3 contract hash");
  return `0x${Buffer.from(bytes).reverse().toString("hex")}`;
}

async function waitForApplicationLog(rpcClient, txHash, timeoutMs = 180000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      return await rpcClient.getApplicationLog(txHash);
    } catch {}
    await sleep(2000);
  }
  throw new Error(`timed out waiting for application log ${txHash}`);
}

function assertHalt(appLog, label) {
  const execution = appLog?.executions?.[0];
  const vmState = String(execution?.vmstate || execution?.state || "");
  if (!vmState.includes("HALT")) {
    throw new Error(`${label} did not HALT: ${vmState} ${execution?.exception || ""}`.trim());
  }
  return execution;
}

async function deployContract(rpcClient, account, rpcUrl, networkMagic, baseName, suffix, buildDir = AA_BUILD_DIR) {
  const { nef, manifestJson } = await loadContractArtifacts(baseName, buildDir);
  const uniqueManifest = sc.ContractManifest.fromJson({
    ...manifestJson,
    name: `${manifestJson.name}-${suffix}`,
  });
  const txid = await experimental.deployContract(nef, uniqueManifest, {
    account,
    rpcAddress: rpcUrl,
    networkMagic,
    blocksTillExpiry: 200,
  });
  const appLog = await waitForApplicationLog(rpcClient, txid);
  assertHalt(appLog, `deploy ${baseName}`);
  return {
    txid,
    hash: decodeDeployHash(appLog),
  };
}

async function invokeRead(rpcClient, contractHash, method, params = []) {
  const response = await rpcClient.invokeFunction(contractHash.replace(/^0x/i, ""), method, params);
  if (String(response.state || "").toUpperCase() === "FAULT") {
    throw new Error(`${method} faulted: ${response.exception || "unknown error"}`);
  }
  return parseStackItem(response.stack?.[0]);
}

async function invokeReadRaw(rpcClient, contractHash, method, params = []) {
  const response = await rpcClient.invokeFunction(contractHash.replace(/^0x/i, ""), method, params);
  if (String(response.state || "").toUpperCase() === "FAULT") {
    throw new Error(`${method} faulted: ${response.exception || "unknown error"}`);
  }
  return response.stack?.[0] || null;
}

async function invokePersisted(rpcClient, contractHash, account, rpcUrl, networkMagic, operation, params = [], signers = undefined) {
  const contract = new experimental.SmartContract(contractHash, {
    rpcAddress: rpcUrl,
    networkMagic,
    account,
  });
  const txid = await contract.invoke(operation, params, signers);
  const appLog = await waitForApplicationLog(rpcClient, txid);
  const execution = assertHalt(appLog, operation);
  return { txid, appLog, execution };
}

async function testInvoke(rpcClient, contractHash, account, rpcUrl, networkMagic, operation, params = [], signers = undefined) {
  const contract = new experimental.SmartContract(contractHash, {
    rpcAddress: rpcUrl,
    networkMagic,
    account,
  });
  return contract.testInvoke(operation, params, signers);
}

function hash160Param(value) {
  return sc.ContractParam.hash160(String(value).replace(/^0x/i, ""));
}

function byteArrayParam(hexValue) {
  return sc.ContractParam.byteArray(u.HexString.fromHex(String(hexValue || "").replace(/^0x/i, ""), true));
}

function integerParam(value) {
  if (typeof value === "bigint") return sc.ContractParam.integer(value.toString());
  return sc.ContractParam.integer(value);
}

function stringParam(value) {
  return sc.ContractParam.string(String(value));
}

function arrayParam(values = []) {
  return sc.ContractParam.array(...values);
}

function emptyByteArrayParam() {
  return sc.ContractParam.byteArray(u.HexString.fromHex("", true));
}

function userOpParam({ targetContract, method, args = [], nonce = 0n, deadline = 0n, signatureHex = "" }) {
  return arrayParam([
    hash160Param(targetContract),
    stringParam(method),
    arrayParam(args),
    integerParam(nonce),
    integerParam(deadline),
    byteArrayParam(signatureHex),
  ]);
}

async function ensureRequestFeeCredit(account, rpcUrl, networkMagic, rpcClient, oracleHash, requiredRequests) {
  const currentCredit = BigInt(await invokeRead(rpcClient, oracleHash, "feeCreditOf", [{ type: "Hash160", value: `0x${account.scriptHash}` }]) || "0");
  const requestFee = BigInt(await invokeRead(rpcClient, oracleHash, "requestFee", []) || "0");
  const requiredCredit = requestFee * BigInt(requiredRequests);
  if (requestFee <= 0n || currentCredit >= requiredCredit) {
    return {
      request_fee: requestFee.toString(),
      current_credit: currentCredit.toString(),
      deposit_amount: "0",
    };
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
      return {
        request_fee: requestFee.toString(),
        current_credit: updatedCredit.toString(),
        deposit_amount: deficit.toString(),
      };
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
  throw new Error(`timed out waiting for request id from tx ${txid}`);
}

async function waitForCallback(rpcClient, consumerHash, requestId, timeoutMs = 180000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const response = await rpcClient.invokeFunction(consumerHash.replace(/^0x/i, ""), "getCallback", [{ type: "Integer", value: String(requestId) }]);
    const decoded = decodeCallbackArray(response.stack?.[0]);
    if (decoded && (decoded.request_type || decoded.result_text || decoded.error_text)) {
      return decoded;
    }
    await sleep(2000);
  }
  throw new Error(`timed out waiting for callback ${requestId}`);
}

function stackItemToText(item) {
  if (!item) return "";
  if (item.type === "Integer") return String(item.value || "0");
  if (item.type === "Boolean") return String(item.value);
  if (item.type === "ByteString") {
    const hex = Buffer.from(item.value || "", "base64").toString("hex");
    if (!hex) return "";
    const utf8 = Buffer.from(hex, "hex").toString("utf8");
    return /^[\x20-\x7E]+$/.test(utf8) ? utf8 : `0x${hex}`;
  }
  return JSON.stringify(item);
}

async function main() {
  await loadExampleEnv();
  const deployment = (await readDeploymentRegistry("testnet")).neo_n3 || {};
  const rpcUrl = trimString(deployment.rpc_url || process.env.NEO_RPC_URL || "https://testnet1.neo.coz.io:443");
  const networkMagic = Number(deployment.network_magic || process.env.NEO_NETWORK_MAGIC || 894710606);
  const signerWif = resolveNeoN3SignerWif("testnet");
  const oracleHash = normalizeHash160(deployment.oracle_hash || process.env.CONTRACT_MORPHEUS_ORACLE_HASH || "");
  const consumerHash = normalizeHash160(deployment.example_consumer_hash || process.env.EXAMPLE_N3_CONSUMER_HASH || "");

  assertCondition(signerWif, "testnet signer WIF is required");
  assertCondition(oracleHash, "testnet oracle hash is required");
  assertCondition(consumerHash, "testnet example consumer hash is required");

  const account = new wallet.Account(signerWif);
  const rpcClient = new neoRpc.RPCClient(rpcUrl);
  const suffix = `session-oracle-${Date.now()}`;
  const globalSigners = [new tx.Signer({ account: account.scriptHash, scopes: tx.WitnessScope.Global })];

  const core = await deployContract(rpcClient, account, rpcUrl, networkMagic, "UnifiedSmartWalletV3", suffix, AA_BUILD_DIR);
  const sessionVerifier = await deployContract(rpcClient, account, rpcUrl, networkMagic, "SessionKeyVerifier", suffix, AA_BUILD_DIR);
  const consumer = await deployContract(rpcClient, account, rpcUrl, networkMagic, "UserConsumerN3OracleExample", suffix, EXAMPLE_BUILD_DIR);
  await invokePersisted(rpcClient, oracleHash, account, rpcUrl, networkMagic, "addAllowedCallback", [
    hash160Param(consumer.hash),
  ]);
  await invokePersisted(rpcClient, consumer.hash, account, rpcUrl, networkMagic, "setOracle", [
    hash160Param(oracleHash),
  ]);
  const feeStatus = await ensureRequestFeeCredit(account, rpcUrl, networkMagic, rpcClient, oracleHash, 1);

  const accountId = Buffer.from(wallet.generatePrivateKey()).subarray(0, 20).toString("hex");
  await invokePersisted(rpcClient, core.hash, account, rpcUrl, networkMagic, "registerAccount", [
    hash160Param(accountId),
    hash160Param("0".repeat(40)),
    emptyByteArrayParam(),
    hash160Param("0".repeat(40)),
    hash160Param(`0x${account.scriptHash}`),
    integerParam(1),
  ]);
  await invokePersisted(rpcClient, core.hash, account, rpcUrl, networkMagic, "updateVerifier", [
    hash160Param(accountId),
    hash160Param(sessionVerifier.hash),
    emptyByteArrayParam(),
  ]);

  const validUntil = 2_000_000_000_000n;
  await invokePersisted(rpcClient, core.hash, account, rpcUrl, networkMagic, "callVerifier", [
    hash160Param(accountId),
    stringParam("setSessionKey"),
    arrayParam([
      hash160Param(accountId),
      byteArrayParam(account.publicKey),
      hash160Param(consumer.hash),
      stringParam("requestBuiltinProviderPriceSponsored"),
      integerParam(validUntil),
    ]),
  ]);

  const nonce = BigInt(await invokeRead(rpcClient, core.hash, "getNonce", [hash160Param(accountId), integerParam(0)]) || "0");
  const deadline = BigInt(Date.now() + (60 * 60 * 1000));
  const payloadStack = await invokeReadRaw(rpcClient, sessionVerifier.hash, "getPayload", [
    hash160Param(accountId),
    hash160Param(consumer.hash),
    stringParam("requestBuiltinProviderPriceSponsored"),
    arrayParam([]),
    integerParam(nonce),
    integerParam(deadline),
  ]);
  const payload = Buffer.from(payloadStack?.value || "", "base64");
  const signature = wallet.sign(payload.toString("hex"), account.privateKey);

  const success = await invokePersisted(rpcClient, core.hash, account, rpcUrl, networkMagic, "executeUserOp", [
    hash160Param(accountId),
    userOpParam({
      targetContract: consumer.hash,
      method: "requestBuiltinProviderPriceSponsored",
      args: [],
      nonce,
      deadline,
      signatureHex: signature,
    }),
  ], globalSigners);
  const requestId = await waitForRequestId(rpcClient, success.txid);
  const callback = await waitForCallback(rpcClient, consumer.hash, requestId, 180000);
  assertCondition(callback?.success === true, "session-key downstream Oracle request should succeed");

  const wrongTarget = await testInvoke(rpcClient, core.hash, account, rpcUrl, networkMagic, "executeUserOp", [
    hash160Param(accountId),
    userOpParam({
      targetContract: oracleHash,
      method: "request",
      args: [
        stringParam("privacy_oracle"),
        byteArrayParam(Buffer.from(JSON.stringify({
          provider: "twelvedata",
          symbol: "TWELVEDATA:NEO-USD",
          json_path: "price",
          target_chain: "neo_n3",
        }), "utf8").toString("hex")),
        hash160Param(consumer.hash),
        stringParam("onOracleResult"),
      ],
      nonce: nonce + 1n,
      deadline,
      signatureHex: signature,
    }),
  ], globalSigners);
  assertCondition(String(wrongTarget.state || "").includes("FAULT"), "wrong target should fault");
  assertCondition(/Target contract not permitted|Method not permitted/i.test(String(wrongTarget.exception || "")), "wrong target should fail session-key restriction");

  const wrongMethod = await testInvoke(rpcClient, core.hash, account, rpcUrl, networkMagic, "executeUserOp", [
    hash160Param(accountId),
    userOpParam({
      targetContract: consumer.hash,
      method: "setOracle",
      args: [],
      nonce: nonce + 1n,
      deadline,
      signatureHex: signature,
    }),
  ], globalSigners);
  assertCondition(String(wrongMethod.state || "").includes("FAULT"), "wrong method should fault");
  assertCondition(/Method not permitted/i.test(String(wrongMethod.exception || "")), "wrong method should fail session-key restriction");

  const generatedAt = new Date().toISOString();
  const jsonReport = {
    generated_at: generatedAt,
    network: "testnet",
    rpc_url: rpcUrl,
    network_magic: networkMagic,
    oracle_hash: oracleHash,
    callback_consumer_hash: consumerHash,
    aa_core_hash: core.hash,
    session_verifier_hash: sessionVerifier.hash,
    oracle_consumer_hash: consumer.hash,
    account_id: normalizeHash(accountId),
    request_fee_status: feeStatus,
    success_path: {
      execute_txid: success.txid,
      request_id: String(requestId),
      callback,
      result: stackItemToText(success.execution.stack?.[0]),
    },
    wrong_target: {
      state: wrongTarget.state || "",
      exception: wrongTarget.exception || "",
    },
    wrong_method: {
      state: wrongMethod.state || "",
      exception: wrongMethod.exception || "",
    },
  };

  const markdownReport = [
    "# N3 AA Session-Key Oracle Boundary Validation",
    "",
    `Date: ${generatedAt}`,
    "",
    "## Scope",
    "",
    "This probe validates that a V3 AA session key can successfully call a Morpheus-enabled downstream consumer through the allowed target/method pair, but cannot escalate to a different target contract or a different method.",
    "",
    "## Result",
    "",
    `- AA core: \`${core.hash}\``,
    `- Session verifier: \`${sessionVerifier.hash}\``,
    `- Execute tx: \`${success.txid}\``,
    `- Oracle request id: \`${requestId}\``,
    `- Callback success: \`${callback.success}\``,
    `- Wrong target exception: \`${wrongTarget.exception || ""}\``,
    `- Wrong method exception: \`${wrongMethod.exception || ""}\``,
    "",
    "## Conclusion",
    "",
    "A session key scoped to the temporary consumer's `requestBuiltinProviderPriceSponsored` method can execute the intended downstream Morpheus Oracle call, but cannot be reused for a different target contract or a different method. This closes the core AA-session-key-to-Morpheus-Oracle boundary gap on testnet.",
    "",
  ].join("\n");

  const artifacts = await writeValidationArtifacts({
    baseName: "n3-aa-session-oracle-boundary",
    network: "testnet",
    generatedAt,
    jsonReport,
    markdownReport,
  });

  console.log(JSON.stringify({
    ...artifacts,
    execute_txid: success.txid,
    request_id: String(requestId),
    aa_core_hash: core.hash,
    session_verifier_hash: sessionVerifier.hash,
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
