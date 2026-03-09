import { experimental, sc, rpc as neoRpc, wallet } from '@cityofzion/neon-js';
import { loadDotEnv } from './lib-env.mjs';

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

const rpcUrl = trimString(process.env.NEO_RPC_URL || 'https://testnet1.neo.coz.io:443');
const networkMagic = Number(process.env.NEO_NETWORK_MAGIC || 894710606);
const wif = trimString(process.env.NEO_TESTNET_WIF || '');
const oracleHash = trimString(process.env.CONTRACT_MORPHEUS_ORACLE_HASH || '');
const callbackHash = trimString(process.env.CONTRACT_ORACLE_CALLBACK_CONSUMER_HASH || '');
const provider = trimString(process.env.MORPHEUS_SMOKE_PROVIDER || 'twelvedata') || 'twelvedata';
const symbol = trimString(process.env.MORPHEUS_SMOKE_SYMBOL || 'NEO-USD') || 'NEO-USD';
const requestType = trimString(process.env.MORPHEUS_SMOKE_REQUEST_TYPE || 'privacy_oracle') || 'privacy_oracle';
const jsonPath = trimString(process.env.MORPHEUS_SMOKE_JSON_PATH || 'price') || 'price';
const script = trimString(process.env.MORPHEUS_SMOKE_SCRIPT || '');
const requestTimeoutMs = Number(process.env.MORPHEUS_SMOKE_REQUEST_TIMEOUT_MS || 90000);
const callbackTimeoutMs = Number(process.env.MORPHEUS_SMOKE_CALLBACK_TIMEOUT_MS || 180000);

if (!wif) throw new Error('NEO_TESTNET_WIF is required');
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

const txid = await oracle.invoke('request', [
  requestType,
  sc.ContractParam.byteArray(Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')),
  sc.ContractParam.hash160(callbackHash),
  'onOracleResult',
]);

const requestId = await waitForRequestId(rpcClient, txid, requestTimeoutMs);
const callback = await waitForCallback(rpcClient, callbackHash, requestId, callbackTimeoutMs);
const summary = {
  txid,
  request_id: requestId,
  provider,
  symbol,
  callback,
};

console.log(JSON.stringify(summary, null, 2));
if (!callback.success) {
  console.error(`Neo N3 smoke callback failed for request ${requestId}: ${callback.error_text || 'unknown error'}`);
  process.exitCode = 1;
}
