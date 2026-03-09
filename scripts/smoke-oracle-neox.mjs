import { Contract, JsonRpcProvider, Wallet } from 'ethers';

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function decodeBytes(bytesLike) {
  const raw = trimString(bytesLike || '0x');
  if (!raw || raw === '0x') return '';
  try {
    return Buffer.from(raw.replace(/^0x/i, ''), 'hex').toString('utf8');
  } catch {
    return raw;
  }
}

const ORACLE_ABI = [
  'event OracleRequested(uint256 indexed requestId, string requestType, address indexed requester, address indexed callbackContract, string callbackMethod, bytes payload)',
  'function request(string requestType, bytes payload, address callbackContract, string callbackMethod) external returns (uint256 requestId)',
];

const CALLBACK_ABI = [
  'function getCallback(uint256 requestId) view returns (string requestType, bool success, bytes result, string error)',
];

async function waitForCallback(consumer, requestId, timeoutMs = 120000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const [requestType, success, result, error] = await consumer.getCallback(requestId);
    const decoded = {
      request_type: requestType,
      success,
      result_text: decodeBytes(result),
      result_json: tryParseJson(decodeBytes(result)),
      error_text: error || '',
    };
    if (decoded.request_type || decoded.result_text || decoded.error_text) {
      return decoded;
    }
    await sleep(2000);
  }
  throw new Error(`timed out waiting for Neo X callback ${requestId}`);
}

const rpcUrl = trimString(process.env.NEOX_RPC_URL || process.env.NEO_X_RPC_URL || '');
const chainId = Number(process.env.NEOX_CHAIN_ID || process.env.NEO_X_CHAIN_ID || 12227332);
const privateKey = trimString(
  process.env.NEOX_PRIVATE_KEY
    || process.env.PHALA_NEOX_PRIVATE_KEY
    || process.env.MORPHEUS_RELAYER_NEOX_PRIVATE_KEY
    || '',
);
const oracleAddress = trimString(process.env.CONTRACT_MORPHEUS_ORACLE_X_ADDRESS || '');
const callbackAddress = trimString(process.env.CONTRACT_ORACLE_CALLBACK_CONSUMER_X_ADDRESS || '');
const providerName = trimString(process.env.MORPHEUS_SMOKE_PROVIDER || 'coinbase-spot') || 'coinbase-spot';
const symbol = trimString(process.env.MORPHEUS_SMOKE_SYMBOL || 'NEO-USD') || 'NEO-USD';
const requestType = trimString(process.env.MORPHEUS_SMOKE_REQUEST_TYPE || 'privacy_oracle') || 'privacy_oracle';
const jsonPath = trimString(process.env.MORPHEUS_SMOKE_JSON_PATH || 'price') || 'price';
const script = trimString(process.env.MORPHEUS_SMOKE_SCRIPT || '');

if (!rpcUrl) throw new Error('NEOX_RPC_URL is required');
if (!privateKey) throw new Error('NEOX_PRIVATE_KEY or PHALA_NEOX_PRIVATE_KEY is required');
if (!oracleAddress) throw new Error('CONTRACT_MORPHEUS_ORACLE_X_ADDRESS is required');
if (!callbackAddress) throw new Error('CONTRACT_ORACLE_CALLBACK_CONSUMER_X_ADDRESS is required');

const payload = {
  provider: providerName,
  symbol,
  json_path: jsonPath,
};
if (script) payload.script = script;

const provider = new JsonRpcProvider(rpcUrl);
const wallet = new Wallet(privateKey, provider);
const oracle = new Contract(oracleAddress, ORACLE_ABI, wallet);
const consumer = new Contract(callbackAddress, CALLBACK_ABI, provider);

const tx = await oracle.request(requestType, `0x${Buffer.from(JSON.stringify(payload), 'utf8').toString('hex')}`, callbackAddress, 'onOracleResult', {
  chainId,
});
const receipt = await tx.wait();
const event = receipt.logs
  .map((log) => {
    try {
      return oracle.interface.parseLog(log);
    } catch {
      return null;
    }
  })
  .find((parsed) => parsed && parsed.name === 'OracleRequested');

const requestId = event?.args?.requestId?.toString();
if (!requestId) throw new Error(`failed to resolve Neo X requestId from tx ${tx.hash}`);

const callback = await waitForCallback(consumer, requestId);

console.log(JSON.stringify({
  txid: tx.hash,
  request_id: requestId,
  provider: providerName,
  symbol,
  callback,
}, null, 2));
