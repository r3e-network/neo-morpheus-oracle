import { experimental, rpc as neoRpc, sc, tx, wallet } from "@cityofzion/neon-js";
import {
  encodeUtf8Base64,
  jsonPretty,
  loadExampleEnv,
  normalizeHash160,
  readDeploymentRegistry,
  sleep,
  trimString,
  tryParseJson,
} from "./common.mjs";

const GAS_HASH = "0xd2a4cff31913016155e38e474a2c06d08be276cf";

function isTransientRpcError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /ECONNRESET|ETIMEDOUT|socket hang up|fetch failed|network error/i.test(message);
}

async function withRetries(label, task, attempts = 5) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (!isTransientRpcError(error) || attempt === attempts) break;
      await sleep(1000 * attempt);
    }
  }
  throw new Error(`${label} failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
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
  const response = await withRetries(
    `invokeRead:${method}`,
    () => rpcClient.invokeFunction(contractHash, method, params),
  );
  if (String(response.state || "").toUpperCase() === "FAULT") {
    throw new Error(`${method} faulted: ${response.exception || "unknown error"}`);
  }
  return parseStackItem(response.stack?.[0]);
}

async function waitForRequestId(rpcClient, txid, timeoutMs = 90000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const appLog = await withRetries(
        `getApplicationLog:${txid}`,
        () => rpcClient.getApplicationLog(txid),
      );
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
    const response = await withRetries(
      `getCallback:${requestId}`,
      () => rpcClient.invokeFunction(consumerHash, "getCallback", [{ type: "Integer", value: String(requestId) }]),
    );
    const decoded = decodeCallbackArray(response.stack?.[0]);
    if (decoded && (decoded.request_type || decoded.result_text || decoded.error_text)) {
      return decoded;
    }
    await sleep(2000);
  }
  throw new Error(`timed out waiting for Neo N3 callback ${requestId}`);
}

async function ensureFeeCredit(account, rpcUrl, networkMagic, rpcClient, oracleHash, payerHash, requiredRequests) {
  const currentCredit = BigInt(await invokeRead(rpcClient, oracleHash, "feeCreditOf", [{ type: "Hash160", value: payerHash }]) || "0");
  const requestFee = BigInt(await invokeRead(rpcClient, oracleHash, "requestFee", []) || "0");
  const requiredCredit = requestFee * BigInt(requiredRequests);
  if (requestFee <= 0n || currentCredit >= requiredCredit) {
    return { request_fee: requestFee.toString(), current_credit: currentCredit.toString(), deposit_amount: "0" };
  }

  const gas = new experimental.SmartContract(GAS_HASH, {
    rpcAddress: rpcUrl,
    networkMagic,
    account,
  });
  const deficit = requiredCredit - currentCredit;
  await withRetries(
    "gas.transfer",
    () => gas.invoke("transfer", [
      sc.ContractParam.hash160(`0x${account.scriptHash}`),
      sc.ContractParam.hash160(payerHash),
      sc.ContractParam.integer(deficit.toString()),
      sc.ContractParam.any(null),
    ]),
  );

  const deadlineBalance = Date.now() + 60000;
  while (Date.now() < deadlineBalance) {
    const contractBalanceRaw = await invokeRead(rpcClient, GAS_HASH, "balanceOf", [{ type: "Hash160", value: payerHash }]);
    if (BigInt(contractBalanceRaw || "0") >= deficit) break;
    await sleep(2000);
  }

  const consumer = new experimental.SmartContract(payerHash, {
    rpcAddress: rpcUrl,
    networkMagic,
    account,
  });
  const signers = [new tx.Signer({ account: account.scriptHash, scopes: tx.WitnessScope.Global })];
  await withRetries(
    "depositOracleCredits",
    () => consumer.invoke("depositOracleCredits", [sc.ContractParam.integer(deficit.toString())], signers),
  );

  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const updatedCredit = BigInt(await invokeRead(rpcClient, oracleHash, "feeCreditOf", [{ type: "Hash160", value: payerHash }]) || "0");
    if (updatedCredit >= requiredCredit) {
      return {
        request_fee: requestFee.toString(),
        current_credit: updatedCredit.toString(),
        deposit_amount: deficit.toString(),
      };
    }
    await sleep(2000);
  }

  throw new Error("timed out waiting for Neo N3 automation fee credit");
}

async function waitForQueuedExecution(rpcClient, oracleHash, startRequestIdExclusive, requesterHash, consumerHash, timeoutMs = 180000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const totalRequests = BigInt(await invokeRead(rpcClient, oracleHash, "getTotalRequests", []) || "0");
    for (let requestId = BigInt(startRequestIdExclusive) + 1n; requestId <= totalRequests; requestId += 1n) {
      const request = await invokeRead(rpcClient, oracleHash, "getRequest", [{ type: "Integer", value: requestId.toString() }]);
      if (!Array.isArray(request) || request.length < 12) continue;
      const requester = normalizeHash160(request[5] || "");
      const callbackContract = normalizeHash160(request[3] || "");
      if (requester !== requesterHash || callbackContract !== consumerHash) continue;

      const callback = await waitForCallback(rpcClient, consumerHash, requestId.toString(), 120000);
      if (callback?.request_type === "privacy_oracle" && callback.success) {
        return {
          request_id: requestId.toString(),
          onchain_request: {
            id: String(request[0] || requestId.toString()),
            request_type: String(request[1] || ""),
            callback_contract: String(request[3] || ""),
            requester: String(request[5] || ""),
            status: String(request[6] || ""),
            created_at: String(request[7] || ""),
          },
          callback,
        };
      }
    }
    await sleep(4000);
  }
  throw new Error("timed out waiting for queued automation execution");
}

async function fetchAutomationRecord(automationId) {
  const baseUrl = trimString(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.morpheus_SUPABASE_URL || "");
  const apiKey = trimString(
    process.env.SUPABASE_SERVICE_ROLE_KEY
      || process.env.morpheus_SUPABASE_SERVICE_ROLE_KEY
      || process.env.SUPABASE_SECRET_KEY
      || process.env.morpheus_SUPABASE_SECRET_KEY
      || "",
  );
  if (!baseUrl || !apiKey) return null;

  const headers = {
    apikey: apiKey,
    authorization: `Bearer ${apiKey}`,
    accept: "application/json",
  };

  const jobUrl = new URL(`${baseUrl.replace(/\/$/, "")}/rest/v1/morpheus_automation_jobs`);
  jobUrl.searchParams.set("select", "*");
  jobUrl.searchParams.set("automation_id", `eq.${automationId}`);
  jobUrl.searchParams.set("limit", "1");
  const jobResponse = await withRetries(
    `supabase:automation_job:${automationId}`,
    () => fetch(jobUrl, { headers }),
  );
  const jobRows = jobResponse.ok ? await jobResponse.json() : [];
  const job = Array.isArray(jobRows) ? (jobRows[0] || null) : null;

  const runsUrl = new URL(`${baseUrl.replace(/\/$/, "")}/rest/v1/morpheus_automation_runs`);
  runsUrl.searchParams.set("select", "*");
  runsUrl.searchParams.set("automation_id", `eq.${automationId}`);
  runsUrl.searchParams.set("order", "created_at.asc");
  const runsResponse = await withRetries(
    `supabase:automation_runs:${automationId}`,
    () => fetch(runsUrl, { headers }),
  );
  const runs = runsResponse.ok ? await runsResponse.json() : [];

  return {
    job,
    runs: Array.isArray(runs) ? runs : [],
  };
}

await loadExampleEnv();

const network = trimString(process.env.MORPHEUS_NETWORK || "testnet") || "testnet";
const registry = await readDeploymentRegistry(network);
const deployment = registry.neo_n3 || {};
const defaultRpcUrl = network === "mainnet" ? "https://mainnet1.neo.coz.io:443" : "https://testnet1.neo.coz.io:443";
const defaultNetworkMagic = network === "mainnet" ? 860833102 : 894710606;
const rpcUrl = trimString(process.env.NEO_RPC_URL || deployment.rpc_url || defaultRpcUrl);
const networkMagic = Number(process.env.NEO_NETWORK_MAGIC || deployment.network_magic || defaultNetworkMagic);
const wif = trimString(process.env.NEO_N3_WIF || process.env.NEO_TESTNET_WIF || process.env.MORPHEUS_RELAYER_NEO_N3_WIF || "");
const consumerHash = normalizeHash160(process.env.EXAMPLE_N3_CONSUMER_HASH || deployment.example_consumer_hash || "");
const oracleHash = normalizeHash160(process.env.CONTRACT_MORPHEUS_ORACLE_HASH || deployment.oracle_hash || "");
const callbackTimeoutMs = Number(process.env.EXAMPLE_CALLBACK_TIMEOUT_MS || 240000);

if (!wif) throw new Error("NEO_N3_WIF or MORPHEUS_RELAYER_NEO_N3_WIF is required");
if (!consumerHash) throw new Error("Neo N3 example consumer hash is required");
if (!oracleHash) throw new Error("CONTRACT_MORPHEUS_ORACLE_HASH is required");

const account = new wallet.Account(wif);
const requesterHash = `0x${account.scriptHash}`;
const rpcClient = new neoRpc.RPCClient(rpcUrl);
const signers = [new tx.Signer({ account: account.scriptHash, scopes: tx.WitnessScope.Global })];
const consumer = new experimental.SmartContract(consumerHash, {
  rpcAddress: rpcUrl,
  networkMagic,
  account,
});

const feeStatus = await ensureFeeCredit(account, rpcUrl, networkMagic, rpcClient, oracleHash, consumerHash, 4);
const totalRequestsBefore = await invokeRead(rpcClient, oracleHash, "getTotalRequests", []);

const executeAt = new Date(Date.now() + 20_000).toISOString();
const registerPayload = JSON.stringify({
  trigger: {
    type: "one_shot",
    execute_at: executeAt,
  },
  execution: {
    request_type: "privacy_oracle",
    payload: {
      provider: "twelvedata",
      symbol: "NEO-USD",
      json_path: "price",
      target_chain: "neo_n3",
    },
  },
  max_executions: 1,
});

console.log("Registering Neo N3 one-shot automation...");
const registerTx = await withRetries(
  "automation_register",
  () => consumer.invoke("requestRaw", [
    "automation_register",
    sc.ContractParam.byteArray(encodeUtf8Base64(registerPayload)),
  ], signers),
);
const registerRequestId = await waitForRequestId(rpcClient, registerTx);
const registerCallback = await waitForCallback(rpcClient, consumerHash, registerRequestId, callbackTimeoutMs);
if (!registerCallback.success) {
  throw new Error(`Neo N3 automation register callback failed: ${registerCallback.error_text || "unknown error"}`);
}
const automationId = trimString(registerCallback.result_json?.result?.automation_id || registerCallback.result_json?.automation_id || "");
if (!automationId) {
  throw new Error("Neo N3 automation register callback did not return automation_id");
}

console.log("Waiting for queued one-shot automation execution...");
const execution = await waitForQueuedExecution(
  rpcClient,
  oracleHash,
  totalRequestsBefore,
  requesterHash,
  consumerHash,
  callbackTimeoutMs,
);

const intervalPayload = JSON.stringify({
  trigger: {
    type: "interval",
    interval_ms: 600000,
    start_at: new Date(Date.now() + 30 * 60_000).toISOString(),
  },
  execution: {
    request_type: "privacy_oracle",
    payload: {
      provider: "twelvedata",
      symbol: "NEO-USD",
      json_path: "price",
      target_chain: "neo_n3",
    },
  },
});

console.log("Registering Neo N3 interval automation for cancellation...");
const intervalRegisterTx = await withRetries(
  "automation_register:interval",
  () => consumer.invoke("requestRaw", [
    "automation_register",
    sc.ContractParam.byteArray(encodeUtf8Base64(intervalPayload)),
  ], signers),
);
const intervalRegisterRequestId = await waitForRequestId(rpcClient, intervalRegisterTx);
const intervalRegisterCallback = await waitForCallback(rpcClient, consumerHash, intervalRegisterRequestId, callbackTimeoutMs);
if (!intervalRegisterCallback.success) {
  throw new Error(`Neo N3 interval automation register callback failed: ${intervalRegisterCallback.error_text || "unknown error"}`);
}
const cancelAutomationId = trimString(intervalRegisterCallback.result_json?.result?.automation_id || intervalRegisterCallback.result_json?.automation_id || "");
if (!cancelAutomationId) {
  throw new Error("Neo N3 interval automation register callback did not return automation_id");
}

const cancelPayload = JSON.stringify({ automation_id: cancelAutomationId });
console.log("Cancelling Neo N3 automation...");
const cancelTx = await withRetries(
  "automation_cancel",
  () => consumer.invoke("requestRaw", [
    "automation_cancel",
    sc.ContractParam.byteArray(encodeUtf8Base64(cancelPayload)),
  ], signers),
);
const cancelRequestId = await waitForRequestId(rpcClient, cancelTx);
const cancelCallback = await waitForCallback(rpcClient, consumerHash, cancelRequestId, callbackTimeoutMs);
if (!cancelCallback.success) {
  throw new Error(`Neo N3 automation cancel callback failed: ${cancelCallback.error_text || "unknown error"}`);
}

const supabase = await fetchAutomationRecord(automationId);
const cancelledSupabase = await fetchAutomationRecord(cancelAutomationId);

process.stdout.write(jsonPretty({
  network,
  target_chain: "neo_n3",
  consumer_hash: consumerHash,
  oracle_hash: oracleHash,
  request_fee: feeStatus.request_fee,
  request_credit: feeStatus.current_credit,
  request_credit_deposit: feeStatus.deposit_amount,
  register: {
    txid: registerTx,
    request_id: registerRequestId,
    callback: registerCallback,
    execute_at: executeAt,
    automation_id: automationId,
  },
  queued_execution: execution,
  cancel_registration: {
    txid: intervalRegisterTx,
    request_id: intervalRegisterRequestId,
    callback: intervalRegisterCallback,
    automation_id: cancelAutomationId,
  },
  cancel: {
    txid: cancelTx,
    request_id: cancelRequestId,
    callback: cancelCallback,
  },
  supabase,
  cancelled_supabase: cancelledSupabase,
}));
