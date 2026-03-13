import { relayNeoN3Invocation } from "../../phala-worker/src/chain/index.js";
import { deriveRelayerNeoN3PrivateKeyHex, shouldUseDerivedKeys } from "./dstack.js";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function strip0x(value) {
  return trimString(value).replace(/^0x/i, "").toLowerCase();
}

function tryDecodeUtf8(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function isPrintableText(text) {
  return typeof text === "string" && /^[\x09\x0a\x0d\x20-\x7e]*$/.test(text);
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

export function decodeNeoItem(item) {
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
      if (/^[0-9a-fA-F]+$/.test(raw) && raw.length % 2 === 0) {
        const bytes = Buffer.from(raw, "hex");
        const text = tryDecodeUtf8(bytes);
        if (isPrintableText(text)) return text;
        if (raw.length === 40) return `0x${bytes.reverse().toString("hex")}`;
        try {
          return bytes.toString("utf8");
        } catch {
          return raw;
        }
      }
      try {
        const bytes = Buffer.from(raw, "base64");
        const text = tryDecodeUtf8(bytes);
        if (isPrintableText(text)) return text;
        if (bytes.length === 20) {
          return `0x${Buffer.from(bytes).reverse().toString("hex")}`;
        }
        return bytes.toString("utf8");
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
  return Boolean(
    config.neo_n3.rpcUrl
      && config.neo_n3.oracleContract
      && (config.neo_n3.updaterWif || config.neo_n3.updaterPrivateKey || shouldUseDerivedKeys(config)),
  );
}

export async function getNeoN3LatestBlock(config) {
  const blockCount = await neoRpcCall(config.neo_n3.rpcUrl, "getblockcount");
  return Number(blockCount) - 1;
}

export async function getNeoN3IndexedBlock(config) {
  const network = trimString(config.network) === "mainnet" ? "mainnet" : "testnet";
  const baseUrl = trimString(config.neo_n3.indexerUrl || "https://api.n3index.dev/rest/v1").replace(/\/$/, "");
  const url = new URL(`${baseUrl}/indexer_state`);
  url.searchParams.set("network", `eq.${network}`);
  url.searchParams.set("select", "last_indexed_block");
  url.searchParams.set("limit", "1");

  const response = await fetch(url.toString(), {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`n3index indexer_state failed: ${response.status} ${text}`.trim());
  }

  const rows = await response.json().catch(() => []);
  const latest = Array.isArray(rows) ? Number(rows[0]?.last_indexed_block || 0) : 0;
  if (!Number.isFinite(latest) || latest <= 0) {
    throw new Error("n3index last_indexed_block unavailable");
  }
  return latest;
}

export async function getNeoN3LatestRequestId(config) {
  const result = await neoRpcCall(config.neo_n3.rpcUrl, "invokefunction", [
    config.neo_n3.oracleContract,
    "getTotalRequests",
    [],
  ]);
  if (String(result?.state || "").toUpperCase() === "FAULT") {
    throw new Error(result?.exception || "Neo N3 getTotalRequests faulted");
  }
  return Number(decodeNeoItem(result?.stack?.[0]) || "0");
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

export async function scanNeoN3OracleRequestsViaN3Index(config, fromBlock, toBlock) {
  if (fromBlock > toBlock) return [];
  const network = trimString(config.network) === "mainnet" ? "mainnet" : "testnet";
  const baseUrl = trimString(config.neo_n3.indexerUrl || "https://api.n3index.dev/rest/v1").replace(/\/$/, "");
  const url = new URL(`${baseUrl}/contract_notifications`);
  url.searchParams.set("network", `eq.${network}`);
  url.searchParams.set("contract_hash", `eq.${config.neo_n3.oracleContract}`);
  url.searchParams.set("event_name", "eq.OracleRequested");
  url.searchParams.set("order", "block_index.desc");
  url.searchParams.set("limit", String(Math.max(config.maxBlocksPerTick * 4, 500)));

  const response = await fetch(url.toString(), {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`n3index OracleRequested scan failed: ${response.status} ${text}`.trim());
  }

  const rows = await response.json().catch(() => []);
  if (!Array.isArray(rows)) return [];

  return rows
    .filter((row) => {
      const blockIndex = Number(row?.block_index || 0);
      return blockIndex >= fromBlock && blockIndex <= toBlock;
    })
    .sort((left, right) => {
      const leftBlock = Number(left?.block_index || 0);
      const rightBlock = Number(right?.block_index || 0);
      if (leftBlock !== rightBlock) return leftBlock - rightBlock;
      return Number(left?.notification_index || 0) - Number(right?.notification_index || 0);
    })
    .map((row) => {
    const state = Array.isArray(row?.state_json?.value)
      ? row.state_json.value
      : Array.isArray(row?.raw_json?.state?.value)
        ? row.raw_json.state.value
        : [];
    const [requestId, requestType, requester, callbackContract, callbackMethod, payload] = state.map((entry) => decodeNeoItem(entry));
    return {
      chain: "neo_n3",
      requestId: String(requestId || "0"),
      requestType: String(requestType || ""),
      requester: String(requester || ""),
      callbackContract: String(callbackContract || ""),
      callbackMethod: String(callbackMethod || ""),
      payloadText: String(payload || ""),
      blockNumber: Number(row?.block_index || 0),
      txHash: String(row?.txid || ""),
      logIndex: Number(row?.notification_index || 0),
    };
  }).filter((event) => trimString(event.requestType));
}

export async function scanNeoN3OracleRequestsById(config, fromRequestId, toRequestId) {
  if (fromRequestId > toRequestId) return [];
  const out = [];

  for (let requestId = fromRequestId; requestId <= toRequestId; requestId += 1) {
    const result = await neoRpcCall(config.neo_n3.rpcUrl, "invokefunction", [
      config.neo_n3.oracleContract,
      "getRequest",
      [{ type: "Integer", value: String(requestId) }],
    ]);
    if (String(result?.state || "").toUpperCase() === "FAULT") {
      throw new Error(result?.exception || `Neo N3 getRequest faulted for request ${requestId}`);
    }

    const decoded = decodeNeoItem(result?.stack?.[0]);
    if (!Array.isArray(decoded) || decoded.length < 12) continue;

    const [
      requestIdValue,
      requestType,
      payloadText,
      callbackContract,
      callbackMethod,
      requester,
      _statusCode,
      createdAtMs,
      fulfilledAtMs,
      _success,
      resultText,
      errorText,
    ] = decoded;

    if (!trimString(requestType)) continue;

    const alreadySettled = trimString(fulfilledAtMs) !== "" && trimString(fulfilledAtMs) !== "0";
    const hasOutcome = trimString(resultText) !== "" || trimString(errorText) !== "";
    if (alreadySettled || hasOutcome) continue;

    out.push({
      chain: "neo_n3",
      requestId: String(requestIdValue || requestId),
      requestType: String(requestType || ""),
      requester: String(requester || ""),
      callbackContract: String(callbackContract || ""),
      callbackMethod: String(callbackMethod || ""),
      payloadText: String(payloadText || ""),
      blockNumber: Number(createdAtMs || 0),
      txHash: "",
      logIndex: 0,
    });
  }

  return out;
}

export function encodeUtf8ByteArrayParamValue(value) {
  const raw = trimString(value);
  if (!raw) return "";
  return Buffer.from(raw, "utf8").toString("base64");
}

function encodeHexByteArrayParamValue(value) {
  const raw = trimString(value).replace(/^0x/i, "");
  if (!raw) return "";
  return Buffer.from(raw, "hex").toString("base64");
}

async function resolveNeoN3UpdaterPayload(config) {
  if (config.neo_n3.updaterWif) {
    return { wif: config.neo_n3.updaterWif };
  }
  if (config.neo_n3.updaterPrivateKey) {
    return { private_key: config.neo_n3.updaterPrivateKey };
  }
  if (shouldUseDerivedKeys(config)) {
    return { private_key: await deriveRelayerNeoN3PrivateKeyHex() };
  }
  throw new Error("Neo N3 updater signing material is not configured");
}

export async function fulfillNeoN3Request(config, requestId, success, result, error, verificationSignature, resultBytesBase64 = "") {
  const signerPayload = await resolveNeoN3UpdaterPayload(config);
  const byteArrayValue = trimString(resultBytesBase64) || encodeUtf8ByteArrayParamValue(result || "");
  const invoke = await relayNeoN3Invocation({
    request_id: `relayer:n3:${requestId}`,
    contract_hash: config.neo_n3.oracleContract,
    method: "fulfillRequest",
    params: [
      { type: "Integer", value: String(requestId) },
      { type: "Boolean", value: Boolean(success) },
      { type: "ByteArray", value: byteArrayValue },
      { type: "String", value: error || "" },
      { type: "ByteArray", value: encodeHexByteArrayParamValue(verificationSignature || "") },
    ],
    wait: false,
    rpc_url: config.neo_n3.rpcUrl,
    network_magic: config.neo_n3.networkMagic,
    ...signerPayload,
  });

  if (invoke.status >= 400) {
    throw new Error(invoke.body?.error || `Neo N3 fulfill failed for request ${requestId}`);
  }
  return { ...invoke.body, target_chain: "neo_n3" };
}

export async function queueNeoN3AutomationRequest(config, requester, requestType, payloadText, callbackContract, callbackMethod) {
  const signerPayload = await resolveNeoN3UpdaterPayload(config);
  const invoke = await relayNeoN3Invocation({
    request_id: `automation:n3:${Date.now()}`,
    contract_hash: config.neo_n3.oracleContract,
    method: "queueAutomationRequest",
    params: [
      { type: "Hash160", value: requester },
      { type: "String", value: requestType },
      { type: "ByteArray", value: encodeUtf8ByteArrayParamValue(payloadText || "") },
      { type: "Hash160", value: callbackContract },
      { type: "String", value: callbackMethod },
    ],
    wait: false,
    rpc_url: config.neo_n3.rpcUrl,
    network_magic: config.neo_n3.networkMagic,
    ...signerPayload,
  });

  if (invoke.status >= 400) {
    throw new Error(invoke.body?.error || `Neo N3 automation queue failed for ${requester}`);
  }
  return { ...invoke.body, target_chain: "neo_n3" };
}

export async function fetchNeoN3FeedRecord(config, pair) {
  const result = await neoRpcCall(config.neo_n3.rpcUrl, "invokefunction", [
    config.neo_n3.datafeedContract,
    "getLatest",
    [{ type: "String", value: pair }],
  ]);
  if (String(result?.state || "").toUpperCase() === "FAULT") {
    throw new Error(result?.exception || `Neo N3 getLatest faulted for ${pair}`);
  }
  const decoded = decodeNeoItem(result?.stack?.[0]);
  if (!Array.isArray(decoded) || decoded.length < 6) {
    throw new Error(`Neo N3 feed response malformed for ${pair}`);
  }
  return {
    pair: String(decoded[0] || pair),
    roundId: String(decoded[1] || "0"),
    price: String(decoded[2] || "0"),
    timestamp: String(decoded[3] || "0"),
    attestationHash: String(decoded[4] || ""),
    sourceSetId: String(decoded[5] || "0"),
  };
}
