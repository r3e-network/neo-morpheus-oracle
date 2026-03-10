import { Interface, JsonRpcProvider, Wallet } from "ethers";
import { deriveRelayerNeoXPrivateKeyHex, shouldUseDerivedKeys } from "./dstack.js";

const MORPHEUS_ORACLE_X_ABI = [
  "event OracleRequested(uint256 indexed requestId, string requestType, address indexed requester, address indexed callbackContract, string callbackMethod, bytes payload)",
  "function fulfillRequest(uint256, bool, bytes, string, bytes)",
  "function queueAutomationRequest(address,string,bytes,address,string) returns (uint256)",
];

const DATAFEED_X_ABI = [
  "function getLatest(string pair) view returns (tuple(string pair, uint256 roundId, uint256 price, uint256 timestamp, bytes32 attestationHash, uint256 sourceSetId))",
];

const morpheusOracleXInterface = new Interface(MORPHEUS_ORACLE_X_ABI);
const morpheusDatafeedXInterface = new Interface(DATAFEED_X_ABI);

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function hasNeoXRelayerConfig(config) {
  return Boolean(config.neo_x.rpcUrl && config.neo_x.oracleContract && (config.neo_x.updaterPrivateKey || shouldUseDerivedKeys(config)));
}

export async function getNeoXLatestBlock(config) {
  const provider = new JsonRpcProvider(config.neo_x.rpcUrl);
  return provider.getBlockNumber();
}

export async function scanNeoXOracleRequests(config, fromBlock, toBlock) {
  if (fromBlock > toBlock) return [];
  const provider = new JsonRpcProvider(config.neo_x.rpcUrl);
  const topic = morpheusOracleXInterface.getEvent("OracleRequested").topicHash;
  const logs = await provider.getLogs({
    address: config.neo_x.oracleContract,
    fromBlock,
    toBlock,
    topics: [topic],
  });

  return logs.map((log) => {
    const parsed = morpheusOracleXInterface.parseLog(log);
    const payloadHex = trimString(parsed.args.payload || "0x").replace(/^0x/i, "");
    const payloadText = payloadHex ? Buffer.from(payloadHex, "hex").toString("utf8") : "";
    return {
      chain: "neo_x",
      requestId: parsed.args.requestId.toString(),
      requestType: parsed.args.requestType,
      requester: parsed.args.requester,
      callbackContract: parsed.args.callbackContract,
      callbackMethod: parsed.args.callbackMethod,
      payloadText,
      blockNumber: Number(log.blockNumber),
      txHash: log.transactionHash,
      logIndex: Number(log.index),
    };
  });
}

async function resolveNeoXUpdaterPrivateKey(config) {
  if (config.neo_x.updaterPrivateKey) return config.neo_x.updaterPrivateKey;
  if (shouldUseDerivedKeys(config)) return `0x${await deriveRelayerNeoXPrivateKeyHex()}`;
  throw new Error("Neo X updater signing material is not configured");
}

export async function fulfillNeoXRequest(config, requestId, success, result, error, verificationSignature) {
  const provider = new JsonRpcProvider(config.neo_x.rpcUrl);
  const privateKey = await resolveNeoXUpdaterPrivateKey(config);
  const wallet = new Wallet(privateKey, provider);
  const data = morpheusOracleXInterface.encodeFunctionData("fulfillRequest", [
    BigInt(requestId),
    Boolean(success),
    `0x${Buffer.from(result || "", "utf8").toString("hex")}`,
    error || "",
    verificationSignature.startsWith("0x") ? verificationSignature : `0x${verificationSignature}`,
  ]);
  const tx = await wallet.sendTransaction({
    to: config.neo_x.oracleContract,
    data,
    chainId: config.neo_x.chainId,
  });
  return { tx_hash: tx.hash, target_chain: "neo_x" };
}

export async function queueNeoXAutomationRequest(config, requester, requestType, payloadText, callbackContract, callbackMethod) {
  const provider = new JsonRpcProvider(config.neo_x.rpcUrl);
  const privateKey = await resolveNeoXUpdaterPrivateKey(config);
  const wallet = new Wallet(privateKey, provider);
  const data = morpheusOracleXInterface.encodeFunctionData("queueAutomationRequest", [
    requester,
    requestType,
    `0x${Buffer.from(payloadText || "", "utf8").toString("hex")}`,
    callbackContract,
    callbackMethod,
  ]);
  const tx = await wallet.sendTransaction({
    to: config.neo_x.oracleContract,
    data,
    chainId: config.neo_x.chainId,
  });
  return { tx_hash: tx.hash, target_chain: "neo_x" };
}

export async function fetchNeoXFeedRecord(config, pair) {
  const provider = new JsonRpcProvider(config.neo_x.rpcUrl);
  const data = morpheusDatafeedXInterface.encodeFunctionData("getLatest", [pair]);
  const raw = await provider.call({
    to: config.neo_x.datafeedContract,
    data,
  });
  const decoded = morpheusDatafeedXInterface.decodeFunctionResult("getLatest", raw)[0];
  return {
    pair: decoded.pair,
    roundId: decoded.roundId.toString(),
    price: decoded.price.toString(),
    timestamp: decoded.timestamp.toString(),
    attestationHash: decoded.attestationHash,
    sourceSetId: decoded.sourceSetId.toString(),
  };
}
