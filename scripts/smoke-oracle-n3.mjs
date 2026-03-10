import { experimental, sc, rpc as neoRpc, wallet } from '@cityofzion/neon-js';
import { loadDotEnv } from './lib-env.mjs';

const GAS_HASH = '0xd2a4cff31913016155e38e474a2c06d08be276cf';

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeBase64String(raw) {
  const text = trimString(raw);
  if (!text) return '';
  return Buffer.from(text, 'base64').toString('utf8');
}

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

await loadDotEnv();

const network = trimString(process.env.MORPHEUS_NETWORK || "testnet").toLowerCase();
const defaultRpcUrl = network === "mainnet" ? "https://mainnet1.neo.coz.io:443" : "https://testnet1.neo.coz.io:443";
const defaultNetworkMagic = network === "mainnet" ? 860833102 : 894710606;

function decodeCallbackArray(item) {
  if (!item || item.type !== 'Array' || !Array.isArray(item.value)) return null;
  if (item.value.length < 4) return null;
  const [requestTypeItem, successItem, resultItem, errorItem] = item.value;
  const requestType = decodeBase64String(requestTypeItem?.value || '');
  const success = Boolean(successItem?.value);
  const resultText = decodeBase64String(resultItem?.value || '');
  const errorText = decodeBase64String(errorItem?.value || '');
  return {
    request_type: requestType,
    success,
    result_text: resultText,
    result_json: tryParseJson(resultText),
    error_text: errorText,
  };
}

function parseStackItem(item) {
  if (!item || typeof item !== 'object') return null;
  const type = trimString(item.type).toLowerCase();
  switch (type) {
    case 'integer':
      return String(item.value ?? '0');
    case 'boolean':
      return Boolean(item.value);
    case 'hash160':
    case 'hash256':
    case 'string':
      return String(item.value ?? '');
    case 'bytestring':
    case 'bytearray':
      return decodeBase64String(item.value || '');
    default:
      return item.value ?? null;
  }
}

async function invokeRead(rpcClient, contractHash, method, params = []) {
  const response = await rpcClient.invokeFunction(contractHash, method, params);
  if (String(response.state || '').toUpperCase() === 'FAULT') {
    throw new Error(`${method} faulted: ${response.exception || 'unknown error'}`);
  }
  return parseStackItem(response.stack?.[0]);
}

async function ensureRequestFeeCredit(account, rpcUrl, networkMagic, rpcClient, oracleHash) {
  const currentCredit = BigInt(await invokeRead(rpcClient, oracleHash, 'feeCreditOf', [{ type: 'Hash160', value: `0x${account.scriptHash}` }]) || '0');
  const requestFee = BigInt(await invokeRead(rpcClient, oracleHash, 'requestFee', []) || '0');
  if (requestFee <= 0n || currentCredit >= requestFee) {
    return { request_fee: requestFee.toString(), funded: false, current_credit: currentCredit.toString() };
  }

  const gas = new experimental.SmartContract(GAS_HASH, {
    rpcAddress: rpcUrl,
    networkMagic,
    account,
  });
  const deficit = requestFee - currentCredit;
  await gas.invoke('transfer', [
    sc.ContractParam.hash160(`0x${account.scriptHash}`),
    sc.ContractParam.hash160(oracleHash),
    sc.ContractParam.integer(deficit.toString()),
    sc.ContractParam.any(null),
  ]);

  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const updatedCredit = BigInt(await invokeRead(rpcClient, oracleHash, 'feeCreditOf', [{ type: 'Hash160', value: `0x${account.scriptHash}` }]) || '0');
    if (updatedCredit >= requestFee) {
      return {
        request_fee: requestFee.toString(),
        funded: true,
        deposit_amount: deficit.toString(),
        current_credit: updatedCredit.toString(),
      };
    }
    await sleep(2000);
  }
  throw new Error('timed out waiting for Neo N3 request fee credit');
}

async function waitForRequestId(rpcClient, txid, timeoutMs = 60000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const appLog = await rpcClient.getApplicationLog(txid);
      const notify = appLog.executions?.flatMap((execution) => execution.notifications || []).find((entry) => entry.eventname === 'OracleRequested');
      const requestId = notify?.state?.value?.[0]?.value ?? null;
      if (requestId) return requestId;
    } catch {}
    await sleep(2000);
  }
  throw new Error(`timed out waiting for OracleRequested for tx ${txid}`);
}

async function waitForCallback(rpcClient, callbackHash, requestId, timeoutMs = 120000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const response = await rpcClient.invokeFunction(callbackHash, 'getCallback', [{ type: 'Integer', value: String(requestId) }]);
    const decoded = decodeCallbackArray(response.stack?.[0]);
    if (decoded) return decoded;
    await sleep(2000);
  }
  throw new Error(`timed out waiting for callback ${requestId}`);
}

const rpcUrl = trimString(process.env.NEO_RPC_URL || defaultRpcUrl);
const networkMagic = Number(process.env.NEO_NETWORK_MAGIC || defaultNetworkMagic);
const wif = trimString(process.env.NEO_N3_WIF || process.env.NEO_TESTNET_WIF || process.env.MORPHEUS_RELAYER_NEO_N3_WIF || '');
const oracleHash = trimString(process.env.CONTRACT_MORPHEUS_ORACLE_HASH || '');
const callbackHash = trimString(process.env.CONTRACT_ORACLE_CALLBACK_CONSUMER_HASH || '');
const provider = trimString(process.env.MORPHEUS_SMOKE_PROVIDER || 'twelvedata') || 'twelvedata';
const symbol = trimString(process.env.MORPHEUS_SMOKE_SYMBOL || 'NEO-USD') || 'NEO-USD';
const requestType = trimString(process.env.MORPHEUS_SMOKE_REQUEST_TYPE || 'privacy_oracle') || 'privacy_oracle';
const jsonPath = trimString(process.env.MORPHEUS_SMOKE_JSON_PATH || 'price') || 'price';
const script = trimString(process.env.MORPHEUS_SMOKE_SCRIPT || '');
const requestTimeoutMs = Number(process.env.MORPHEUS_SMOKE_REQUEST_TIMEOUT_MS || 90000);
const callbackTimeoutMs = Number(process.env.MORPHEUS_SMOKE_CALLBACK_TIMEOUT_MS || 180000);

if (!wif) throw new Error('NEO_N3_WIF or MORPHEUS_RELAYER_NEO_N3_WIF is required');
if (!oracleHash) throw new Error('CONTRACT_MORPHEUS_ORACLE_HASH is required');
if (!callbackHash) throw new Error('CONTRACT_ORACLE_CALLBACK_CONSUMER_HASH is required');

const payload = {
  provider,
  symbol,
  json_path: jsonPath,
};
if (script) payload.script = script;

const account = new wallet.Account(wif);
const oracle = new experimental.SmartContract(oracleHash, {
  rpcAddress: rpcUrl,
  networkMagic,
  account,
});
const rpcClient = new neoRpc.RPCClient(rpcUrl);
const feeStatus = await ensureRequestFeeCredit(account, rpcUrl, networkMagic, rpcClient, oracleHash);
console.error(`Neo N3 smoke fee credit ready: request_fee=${feeStatus.request_fee} current_credit=${feeStatus.current_credit}`);

const txid = await oracle.invoke('request', [
  requestType,
  sc.ContractParam.byteArray(Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')),
  sc.ContractParam.hash160(callbackHash),
  'onOracleResult',
]);
console.error(`Neo N3 smoke request txid: ${txid}`);

const requestId = await waitForRequestId(rpcClient, txid, requestTimeoutMs);
const callback = await waitForCallback(rpcClient, callbackHash, requestId, callbackTimeoutMs);
const summary = {
  txid,
  request_id: requestId,
  request_fee: feeStatus.request_fee,
  request_credit: feeStatus.current_credit,
  provider,
  symbol,
  callback,
};

console.log(JSON.stringify(summary, null, 2));
if (!callback.success) {
  console.error(`Neo N3 smoke callback failed for request ${requestId}: ${callback.error_text || 'unknown error'}`);
  process.exitCode = 1;
}
