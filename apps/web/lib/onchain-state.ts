import { Interface, formatEther } from "ethers";

import { getSelectedNetwork } from "./networks";

type OnchainFeedRecord = {
  pair: string;
  round_id: string;
  price_cents: string;
  price_display: string;
  timestamp: string;
  timestamp_iso: string | null;
  attestation_hash: string;
  source_set_id: string;
};

type OnchainOracleStatus = {
  contract: string;
  request_fee_raw: string;
  request_fee_display: string;
  updater: string | null;
  verifier: string | null;
  encryption_algorithm: string | null;
  encryption_key_version: string;
  accrued_fees_raw: string;
};

type OnchainDatafeedStatus = {
  contract: string;
  pair_count: number;
  records: OnchainFeedRecord[];
};

type ChainState = {
  oracle: OnchainOracleStatus | null;
  datafeed: OnchainDatafeedStatus | null;
  error: string | null;
};

const NEON3_GAS_DECIMALS = 8;
const PRICE_DECIMALS = 2;

const ORACLE_X_INTERFACE = new Interface([
  "function requestFee() view returns (uint256)",
  "function updater() view returns (address)",
  "function oracleVerifier() view returns (address)",
  "function oracleEncryptionAlgorithm() view returns (string)",
  "function oracleEncryptionKeyVersion() view returns (uint256)",
  "function accruedFees() view returns (uint256)",
]);

const DATAFEED_X_INTERFACE = new Interface([
  "function getAllFeedRecords() view returns ((string pair,uint256 roundId,uint256 price,uint256 timestamp,bytes32 attestationHash,uint256 sourceSetId)[])",
]);

function trimString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isPrintableAscii(value: string) {
  return /^[\x09\x0a\x0d\x20-\x7e]*$/.test(value);
}

function formatFixedPoint(rawValue: string | bigint, decimals: number) {
  const raw = String(rawValue ?? "0");
  const negative = raw.startsWith("-");
  const digits = raw.replace(/^[+-]/, "") || "0";
  const padded = digits.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals) || "0";
  const fraction = padded.slice(-decimals);
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

function toIsoTimestamp(value: string | number | bigint) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return new Date(numeric * 1000).toISOString();
}

function normalizeHashText(value: unknown) {
  const raw = trimString(value);
  if (!raw) return "";
  return raw.startsWith("0x") ? raw : `0x${raw}`;
}

function normalizeFeedRecord(record: {
  pair: unknown;
  roundId: unknown;
  price: unknown;
  timestamp: unknown;
  attestationHash: unknown;
  sourceSetId: unknown;
}): OnchainFeedRecord {
  const priceCents = String(record.price ?? "0");
  const timestamp = String(record.timestamp ?? "0");
  return {
    pair: trimString(record.pair) || "UNKNOWN",
    round_id: String(record.roundId ?? "0"),
    price_cents: priceCents,
    price_display: formatFixedPoint(priceCents, PRICE_DECIMALS),
    timestamp,
    timestamp_iso: toIsoTimestamp(timestamp),
    attestation_hash: normalizeHashText(record.attestationHash),
    source_set_id: String(record.sourceSetId ?? "0"),
  };
}

function parseNeoStackItem(item: any): unknown {
  if (!item || typeof item !== "object") return null;
  const type = trimString(item.type).toLowerCase();

  switch (type) {
    case "array":
    case "struct":
      return Array.isArray(item.value) ? item.value.map((entry: unknown) => parseNeoStackItem(entry)) : [];
    case "string":
    case "hash160":
    case "hash256":
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
      return isPrintableAscii(text) ? text : `0x${bytes.toString("hex")}`;
    }
    default:
      return item.value ?? null;
  }
}

async function fetchJsonRpc(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      trimString(payload?.error?.message)
        || trimString(payload?.message)
        || `rpc request failed with status ${response.status}`,
    );
  }
  if (payload?.error?.message) {
    throw new Error(payload.error.message);
  }
  return payload?.result;
}

async function invokeNeoN3Read(rpcUrl: string, contractHash: string, method: string, params: unknown[] = []) {
  const result = await fetchJsonRpc(rpcUrl, {
    jsonrpc: "2.0",
    id: 1,
    method: "invokefunction",
    params: [contractHash, method, params],
  });
  if (String(result?.state || "").toUpperCase() === "FAULT") {
    throw new Error(trimString(result?.exception) || `${method} faulted`);
  }
  return parseNeoStackItem(result?.stack?.[0]);
}

async function invokeNeoXCall(rpcUrl: string, contractAddress: string, callData: string) {
  return fetchJsonRpc(rpcUrl, {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_call",
    params: [{ to: contractAddress, data: callData }, "latest"],
  });
}

async function fetchNeoN3State(rpcUrl: string, oracleHash: string, datafeedHash: string, limit: number): Promise<ChainState> {
  try {
    const [requestFee, updater, verifier, encryptionAlgorithm, encryptionKeyVersion, accruedFees, rawRecords] = await Promise.all([
      invokeNeoN3Read(rpcUrl, oracleHash, "requestFee"),
      invokeNeoN3Read(rpcUrl, oracleHash, "updater"),
      invokeNeoN3Read(rpcUrl, oracleHash, "oracleVerificationPublicKey"),
      invokeNeoN3Read(rpcUrl, oracleHash, "oracleEncryptionAlgorithm"),
      invokeNeoN3Read(rpcUrl, oracleHash, "oracleEncryptionKeyVersion"),
      invokeNeoN3Read(rpcUrl, oracleHash, "accruedRequestFees"),
      invokeNeoN3Read(rpcUrl, datafeedHash, "getAllFeedRecords"),
    ]);

    const records = Array.isArray(rawRecords)
      ? rawRecords
          .map((entry) => {
            if (!Array.isArray(entry) || entry.length < 6) return null;
            return normalizeFeedRecord({
              pair: entry[0],
              roundId: entry[1],
              price: entry[2],
              timestamp: entry[3],
              attestationHash: entry[4],
              sourceSetId: entry[5],
            });
          })
          .filter(Boolean) as OnchainFeedRecord[]
      : [];

    records.sort((left, right) => {
      const timestampDiff = Number(right.timestamp) - Number(left.timestamp);
      if (timestampDiff !== 0) return timestampDiff;
      return left.pair.localeCompare(right.pair);
    });

    return {
      oracle: {
        contract: oracleHash,
        request_fee_raw: String(requestFee ?? "0"),
        request_fee_display: `${formatFixedPoint(String(requestFee ?? "0"), NEON3_GAS_DECIMALS)} GAS`,
        updater: trimString(updater) || null,
        verifier: trimString(verifier) || null,
        encryption_algorithm: trimString(encryptionAlgorithm) || null,
        encryption_key_version: String(encryptionKeyVersion ?? "0"),
        accrued_fees_raw: String(accruedFees ?? "0"),
      },
      datafeed: {
        contract: datafeedHash,
        pair_count: records.length,
        records: records.slice(0, limit),
      },
      error: null,
    };
  } catch (error) {
    return {
      oracle: null,
      datafeed: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function decodeNeoXResult(contractAddress: string, functionName: string, iface: Interface) {
  return async (rpcUrl: string) => {
    const callData = iface.encodeFunctionData(functionName);
    const result = await invokeNeoXCall(rpcUrl, contractAddress, callData);
    return iface.decodeFunctionResult(functionName, String(result));
  };
}

async function fetchNeoXState(rpcUrl: string, oracleAddress: string, datafeedAddress: string, limit: number): Promise<ChainState> {
  try {
    const [
      requestFeeDecoded,
      updaterDecoded,
      verifierDecoded,
      encryptionAlgorithmDecoded,
      encryptionKeyVersionDecoded,
      accruedFeesDecoded,
      feedRecordsDecoded,
    ] = await Promise.all([
      decodeNeoXResult(oracleAddress, "requestFee", ORACLE_X_INTERFACE)(rpcUrl),
      decodeNeoXResult(oracleAddress, "updater", ORACLE_X_INTERFACE)(rpcUrl),
      decodeNeoXResult(oracleAddress, "oracleVerifier", ORACLE_X_INTERFACE)(rpcUrl),
      decodeNeoXResult(oracleAddress, "oracleEncryptionAlgorithm", ORACLE_X_INTERFACE)(rpcUrl),
      decodeNeoXResult(oracleAddress, "oracleEncryptionKeyVersion", ORACLE_X_INTERFACE)(rpcUrl),
      decodeNeoXResult(oracleAddress, "accruedFees", ORACLE_X_INTERFACE)(rpcUrl),
      decodeNeoXResult(datafeedAddress, "getAllFeedRecords", DATAFEED_X_INTERFACE)(rpcUrl),
    ]);

    const feedRecordsRaw = Array.isArray(feedRecordsDecoded?.[0]) ? feedRecordsDecoded[0] : [];
    const records = feedRecordsRaw
      .map((entry: any) => normalizeFeedRecord({
        pair: entry?.pair ?? entry?.[0],
        roundId: entry?.roundId ?? entry?.[1],
        price: entry?.price ?? entry?.[2],
        timestamp: entry?.timestamp ?? entry?.[3],
        attestationHash: entry?.attestationHash ?? entry?.[4],
        sourceSetId: entry?.sourceSetId ?? entry?.[5],
      }))
      .sort((left: OnchainFeedRecord, right: OnchainFeedRecord) => {
        const timestampDiff = Number(right.timestamp) - Number(left.timestamp);
        if (timestampDiff !== 0) return timestampDiff;
        return left.pair.localeCompare(right.pair);
      });

    return {
      oracle: {
        contract: oracleAddress,
        request_fee_raw: String(requestFeeDecoded?.[0] ?? "0"),
        request_fee_display: `${formatEther(requestFeeDecoded?.[0] ?? 0n)} GAS`,
        updater: trimString(String(updaterDecoded?.[0] ?? "")) || null,
        verifier: trimString(String(verifierDecoded?.[0] ?? "")) || null,
        encryption_algorithm: trimString(String(encryptionAlgorithmDecoded?.[0] ?? "")) || null,
        encryption_key_version: String(encryptionKeyVersionDecoded?.[0] ?? "0"),
        accrued_fees_raw: String(accruedFeesDecoded?.[0] ?? "0"),
      },
      datafeed: {
        contract: datafeedAddress,
        pair_count: records.length,
        records: records.slice(0, limit),
      },
      error: null,
    };
  } catch (error) {
    return {
      oracle: null,
      datafeed: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function fetchOnchainState(limit = 12) {
  const selected = getSelectedNetwork();
  const boundedLimit = Number.isFinite(limit) ? Math.max(Math.floor(limit), 1) : 12;

  const [neoN3, neoX] = await Promise.all([
    fetchNeoN3State(
      trimString(selected.neo_n3.rpc_url),
      trimString(selected.neo_n3.contracts.morpheus_oracle),
      trimString(selected.neo_n3.contracts.morpheus_datafeed),
      boundedLimit,
    ),
    fetchNeoXState(
      trimString(selected.neo_x.rpc_url),
      trimString(selected.neo_x.contracts.morpheus_oracle_x),
      trimString(selected.neo_x.contracts.morpheus_datafeed_x),
      boundedLimit,
    ),
  ]);

  return {
    network: trimString(selected.network) || "testnet",
    generated_at: new Date().toISOString(),
    neo_n3: neoN3,
    neo_x: neoX,
  };
}
