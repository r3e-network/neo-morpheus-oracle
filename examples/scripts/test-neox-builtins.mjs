import { Contract, JsonRpcProvider, Wallet } from "ethers";
import {
  encodeUtf8Hex,
  jsonPretty,
  loadExampleEnv,
  readDeploymentRegistry,
  sleep,
  trimString,
  tryParseJson,
} from "./common.mjs";
import { buildBuiltinComputeCases, extractBuiltinInnerResult } from "./lib-builtins.mjs";

const ORACLE_ABI = [
  "event OracleRequested(uint256 indexed requestId, string requestType, address indexed requester, address indexed callbackContract, string callbackMethod, bytes payload)",
  "function requestFee() view returns (uint256)",
];

const CONSUMER_ABI = [
  "function requestRaw(string requestType, bytes payload) returns (uint256 requestId)",
  "function callbacks(uint256) view returns (string,bool,bytes,string)",
];

function decodeHexUtf8(bytesLike) {
  const raw = trimString(bytesLike || "0x");
  if (!raw || raw === "0x") return "";
  return Buffer.from(raw.replace(/^0x/i, ""), "hex").toString("utf8");
}

function resolveRequestId(oracle, receipt) {
  const parsed = receipt.logs
    .map((entry) => {
      try {
        return oracle.interface.parseLog(entry);
      } catch {
        return null;
      }
    })
    .find((entry) => entry?.name === "OracleRequested");
  const requestId = parsed?.args?.requestId?.toString();
  if (!requestId) throw new Error(`failed to resolve Neo X request id from tx ${receipt.hash}`);
  return requestId;
}

async function waitForCallback(consumer, requestId, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const [requestType, success, result, error] = await consumer.callbacks(requestId);
    const resultText = decodeHexUtf8(result);
    const decoded = {
      request_type: requestType,
      success,
      result_text: resultText,
      result_json: tryParseJson(resultText),
      error_text: error || "",
    };
    if (decoded.request_type || decoded.result_text || decoded.error_text) {
      return decoded;
    }
    await sleep(2000);
  }
  throw new Error(`timed out waiting for Neo X callback ${requestId}`);
}

await loadExampleEnv();

const network = trimString(process.env.MORPHEUS_NETWORK || "testnet") || "testnet";
const registry = await readDeploymentRegistry(network);
const deployment = registry.neo_x || {};
const rpcUrl = trimString(process.env.NEOX_RPC_URL || process.env.NEO_X_RPC_URL || deployment.rpc_url || "");
const privateKey = trimString(process.env.NEOX_PRIVATE_KEY || process.env.PHALA_NEOX_PRIVATE_KEY || "");
const consumerAddress = trimString(process.env.EXAMPLE_NEOX_CONSUMER_ADDRESS || deployment.example_consumer_address || "");
const oracleAddress = trimString(process.env.CONTRACT_MORPHEUS_ORACLE_X_ADDRESS || deployment.oracle_address || "");
const callbackTimeoutMs = Number(process.env.EXAMPLE_CALLBACK_TIMEOUT_MS || 300000);

if (!rpcUrl || !privateKey || !consumerAddress || !oracleAddress) {
  throw new Error("NEOX_RPC_URL, NEOX_PRIVATE_KEY, EXAMPLE_NEOX_CONSUMER_ADDRESS, and CONTRACT_MORPHEUS_ORACLE_X_ADDRESS are required");
}

const provider = new JsonRpcProvider(rpcUrl);
const signer = new Wallet(privateKey, provider);
const oracle = new Contract(oracleAddress, ORACLE_ABI, provider);
const consumer = new Contract(consumerAddress, CONSUMER_ABI, signer);
const requestFee = await oracle.requestFee();
const cases = await buildBuiltinComputeCases("neo_x");
const results = [];

for (const builtin of cases) {
  console.log(`Testing Neo X builtin ${builtin.name}...`);
  const tx = await consumer.requestRaw("compute", encodeUtf8Hex(JSON.stringify(builtin.payload)), { value: requestFee });
  const receipt = await tx.wait();
  const requestId = resolveRequestId(oracle, receipt);
  const callback = await waitForCallback(consumer, requestId, callbackTimeoutMs);
  if (!callback.success) {
    throw new Error(`Neo X builtin ${builtin.name} failed: ${callback.error_text || "unknown error"}`);
  }
  const inner = extractBuiltinInnerResult(callback.result_json);
  builtin.validate(inner);
  results.push({
    name: builtin.name,
    txid: tx.hash,
    request_id: requestId,
    result: inner,
  });
}

process.stdout.write(jsonPretty({
  network,
  target_chain: "neo_x",
  request_fee: requestFee.toString(),
  builtins: results,
}));
