import { relayNeoN3Invocation } from "../../phala-worker/src/chain/index.js";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function strip0x(value) {
  return trimString(value).replace(/^0x/i, "").toLowerCase();
}

async function neoRpcCall(rpcUrl, method, params = []) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await response.json();
  if (body.error) throw new Error(body.error.message || `${method} failed`);
  return body.result;
}

function decodeNeoItem(item) {
  if (!item || typeof item !== "object") return null;
  const type = trimString(item.type).toLowerCase();
  switch (type) {
    case "integer":
      return String(item.value ?? "0");
    case "string":
      return String(item.value ?? "");
    case "boolean":
      return Boolean(item.value);
    case "hash160":
    case "hash256":
      return String(item.value ?? "");
    case "bytestring":
    case "bytearray": {
      const raw = trimString(item.value);
      if (!raw) return "";
      try {
        return Buffer.from(raw, "base64").toString("utf8");
      } catch {
        return raw;
      }
    }
    case "array":
      return Array.isArray(item.value) ? item.value.map((entry) => decodeNeoItem(entry)) : [];
    default:
      return item.value ?? null;
  }
}

export function hasNeoN3RelayerConfig(config) {
  return Boolean(config.neo_n3.rpcUrl && config.neo_n3.oracleContract && (config.neo_n3.updaterWif || config.neo_n3.updaterPrivateKey));
}

export async function getNeoN3LatestBlock(config) {
  const blockCount = await neoRpcCall(config.neo_n3.rpcUrl, "getblockcount");
  return Number(blockCount) - 1;
}

export async function scanNeoN3OracleRequests(config, fromBlock, toBlock) {
  if (fromBlock > toBlock) return [];
  const out = [];
  const targetContract = strip0x(config.neo_n3.oracleContract);

  for (let height = fromBlock; height <= toBlock; height += 1) {
    const block = await neoRpcCall(config.neo_n3.rpcUrl, "getblock", [height, 1]);
    const transactions = Array.isArray(block?.tx) ? block.tx : [];
    for (const transaction of transactions) {
      const txHash = transaction.txid || transaction.hash;
      if (!txHash) continue;
      const appLog = await neoRpcCall(config.neo_n3.rpcUrl, "getapplicationlog", [txHash]);
      const executions = Array.isArray(appLog?.executions) ? appLog.executions : [];
      for (const execution of executions) {
        const notifications = Array.isArray(execution?.notifications) ? execution.notifications : [];
        for (const notification of notifications) {
          if (strip0x(notification.contract) !== targetContract) continue;
          if (trimString(notification.eventname) !== "OracleRequested") continue;
          const state = Array.isArray(notification.state?.value) ? notification.state.value : [];
          const [requestId, requestType, requester, callbackContract, callbackMethod, payload] = state.map((entry) => decodeNeoItem(entry));
          out.push({
            chain: "neo_n3",
            requestId: String(requestId || "0"),
            requestType: String(requestType || ""),
            requester: String(requester || ""),
            callbackContract: String(callbackContract || ""),
            callbackMethod: String(callbackMethod || ""),
            payloadText: String(payload || ""),
            blockNumber: height,
            txHash,
          });
        }
      }
    }
  }

  return out;
}

export async function fulfillNeoN3Request(config, requestId, success, result, error) {
  const invoke = await relayNeoN3Invocation({
    request_id: `relayer:n3:${requestId}`,
    contract_hash: config.neo_n3.oracleContract,
    method: "fulfillRequest",
    params: [
      { type: "Integer", value: String(requestId) },
      { type: "Boolean", value: Boolean(success) },
      { type: "ByteArray", value: result || "" },
      { type: "String", value: error || "" },
    ],
    wait: false,
    rpc_url: config.neo_n3.rpcUrl,
    network_magic: config.neo_n3.networkMagic,
    wif: config.neo_n3.updaterWif || undefined,
    private_key: config.neo_n3.updaterPrivateKey || undefined,
  });

  if (invoke.status >= 400) {
    throw new Error(invoke.body?.error || `Neo N3 fulfill failed for request ${requestId}`);
  }
  return { ...invoke.body, target_chain: "neo_n3" };
}
