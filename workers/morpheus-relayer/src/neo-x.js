import { Interface, JsonRpcProvider, Wallet } from "ethers";

const MORPHEUS_ORACLE_X_ABI = [
  "event OracleRequested(uint256 indexed requestId, string requestType, address indexed requester, address indexed callbackContract, string callbackMethod, bytes payload)",
  "function fulfillRequest(uint256, bool, bytes, string)",
];

const morpheusOracleXInterface = new Interface(MORPHEUS_ORACLE_X_ABI);

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function hasNeoXRelayerConfig(config) {
  return Boolean(config.neo_x.rpcUrl && config.neo_x.oracleContract && config.neo_x.updaterPrivateKey);
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
      callbackContract: parsed.args.callbackContract,
      callbackMethod: parsed.args.callbackMethod,
      payloadText,
      blockNumber: Number(log.blockNumber),
      txHash: log.transactionHash,
      logIndex: Number(log.index),
    };
  });
}

export async function fulfillNeoXRequest(config, requestId, success, result, error) {
  const provider = new JsonRpcProvider(config.neo_x.rpcUrl);
  const wallet = new Wallet(config.neo_x.updaterPrivateKey, provider);
  const contract = new Wallet(config.neo_x.updaterPrivateKey, provider);
  const data = morpheusOracleXInterface.encodeFunctionData("fulfillRequest", [
    BigInt(requestId),
    Boolean(success),
    `0x${Buffer.from(result || "", "utf8").toString("hex")}`,
    error || "",
  ]);
  const tx = await wallet.sendTransaction({
    to: config.neo_x.oracleContract,
    data,
    chainId: config.neo_x.chainId,
  });
  return { tx_hash: tx.hash, target_chain: "neo_x" };
}
