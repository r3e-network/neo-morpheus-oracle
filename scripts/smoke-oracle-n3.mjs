import { experimental, sc, rpc as neoRpc, wallet } from '@cityofzion/neon-js';

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
const provider = trimString(process.env.MORPHEUS_SMOKE_PROVIDER || 'coinbase-spot') || 'coinbase-spot';
const symbol = trimString(process.env.MORPHEUS_SMOKE_SYMBOL || 'NEO-USD') || 'NEO-USD';
const requestType = trimString(process.env.MORPHEUS_SMOKE_REQUEST_TYPE || 'privacy_oracle') || 'privacy_oracle';
const jsonPath = trimString(process.env.MORPHEUS_SMOKE_JSON_PATH || 'price') || 'price';
const script = trimString(process.env.MORPHEUS_SMOKE_SCRIPT || '');

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

const requestId = await waitForRequestId(rpcClient, txid);
const callback = await waitForCallback(rpcClient, callbackHash, requestId);

console.log(JSON.stringify({
  txid,
  request_id: requestId,
  provider,
  symbol,
  callback,
}, null, 2));
