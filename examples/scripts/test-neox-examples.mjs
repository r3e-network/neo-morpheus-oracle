import { Contract, JsonRpcProvider, Wallet } from 'ethers';
import {
  buildEncryptedBuiltinComputePayload,
  buildEncryptedJsonPatch,
  decodeHexUtf8,
  encodeUtf8Hex,
  jsonPretty,
  loadExampleEnv,
  readDeploymentRegistry,
  sleep,
  trimString,
  tryParseJson,
} from './common.mjs';

const ORACLE_ABI = [
  'event OracleRequested(uint256 indexed requestId, string requestType, address indexed requester, address indexed callbackContract, string callbackMethod, bytes payload)',
  'function requestFee() view returns (uint256)',
];

const CONSUMER_ABI = [
  'function requestRaw(string requestType, bytes payload) returns (uint256 requestId)',
  'function requestRawSponsored(string requestType, bytes payload) returns (uint256 requestId)',
  'function requestBuiltinProviderPrice() returns (uint256 requestId)',
  'function requestBuiltinProviderPriceSponsored() returns (uint256 requestId)',
  'function requestBuiltinCompute(string encryptedPayload) returns (uint256 requestId)',
  'function requestBuiltinComputeSponsored(string encryptedPayload) returns (uint256 requestId)',
  'function contractFeeBalance() view returns (uint256)',
  'function callbacks(uint256) view returns (string,bool,bytes,string)',
];

const FEED_READER_ABI = [
  'function getNeoUsdFromTwelveData() view returns (uint256,uint256,bytes32)',
  'function getAllPairs() view returns (string[])',
];

const DATAFEED_ABI = [
  'function getLatest(string pair) view returns (tuple(string pair, uint256 roundId, uint256 price, uint256 timestamp, bytes32 attestationHash, uint256 sourceSetId))',
];

function toCallbackSummary(requestType, success, result, error) {
  const resultText = decodeHexUtf8(result);
  return {
    request_type: requestType,
    success,
    result_text: resultText,
    result_json: tryParseJson(resultText),
    error_text: error || '',
  };
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
    .find((entry) => entry?.name === 'OracleRequested');
  const requestId = parsed?.args?.requestId?.toString();
  if (!requestId) throw new Error(`failed to resolve Neo X request id from tx ${receipt.hash}`);
  return requestId;
}

async function waitForCallback(consumer, requestId, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const [requestType, success, result, error] = await consumer.callbacks(requestId);
    const decoded = toCallbackSummary(requestType, success, result, error);
    if (decoded.request_type || decoded.result_text || decoded.error_text) {
      return decoded;
    }
    await sleep(2000);
  }
  throw new Error(`timed out waiting for Neo X callback ${requestId}`);
}

function normalizeFeedRecord(record) {
  return {
    pair: record.pair,
    round_id: record.roundId.toString(),
    price: record.price.toString(),
    timestamp: record.timestamp.toString(),
    attestation_hash: record.attestationHash,
    source_set_id: record.sourceSetId.toString(),
  };
}

async function waitForFeedAdvance(datafeed, pair, previous, timeoutMs) {
  const previousRound = BigInt(previous.roundId);
  const previousTimestamp = BigInt(previous.timestamp);
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const current = await datafeed.getLatest(pair);
    if (BigInt(current.roundId) > previousRound || BigInt(current.timestamp) > previousTimestamp) {
      return current;
    }
    await sleep(4000);
  }
  throw new Error(`timed out waiting for Neo X datafeed update for ${pair}`);
}

await loadExampleEnv();

const network = trimString(process.env.MORPHEUS_NETWORK || 'testnet') || 'testnet';
const registry = await readDeploymentRegistry(network);
const deployment = registry.neo_x || {};
const rpcUrl = trimString(
  process.env.NEOX_RPC_URL || deployment.rpc_url || ''
);
const privateKey = trimString(
  process.env.NEOX_PRIVATE_KEY || process.env.PHALA_NEOX_PRIVATE_KEY || ''
);
const consumerAddress = trimString(
  process.env.EXAMPLE_NEOX_CONSUMER_ADDRESS || deployment.example_consumer_address || ''
);
const readerAddress = trimString(
  process.env.EXAMPLE_NEOX_FEED_READER_ADDRESS || deployment.example_feed_reader_address || ''
);
const oracleAddress = trimString(
  process.env.CONTRACT_MORPHEUS_ORACLE_X_ADDRESS || deployment.oracle_address || ''
);
const datafeedAddress = trimString(
  process.env.CONTRACT_MORPHEUS_DATAFEED_X_ADDRESS || deployment.datafeed_address || ''
);
const callbackTimeoutMs = Number(process.env.EXAMPLE_CALLBACK_TIMEOUT_MS || 300000);
const feedTimeoutMs = Number(process.env.EXAMPLE_FEED_TIMEOUT_MS || 300000);
const feedPair = 'TWELVEDATA:NEO-USD';

if (!rpcUrl) throw new Error('NEOX_RPC_URL is required');
if (!privateKey) throw new Error('NEOX_PRIVATE_KEY or PHALA_NEOX_PRIVATE_KEY is required');
if (!consumerAddress) throw new Error('Neo X example consumer address is required');
if (!readerAddress) throw new Error('Neo X example feed reader address is required');
if (!oracleAddress) throw new Error('CONTRACT_MORPHEUS_ORACLE_X_ADDRESS is required');
if (!datafeedAddress) throw new Error('CONTRACT_MORPHEUS_DATAFEED_X_ADDRESS is required');

const provider = new JsonRpcProvider(rpcUrl);
const signer = new Wallet(privateKey, provider);
const oracle = new Contract(oracleAddress, ORACLE_ABI, provider);
const consumer = new Contract(consumerAddress, CONSUMER_ABI, signer);
const reader = new Contract(readerAddress, FEED_READER_ABI, provider);
const datafeed = new Contract(datafeedAddress, DATAFEED_ABI, provider);
const requestFee = await oracle.requestFee();

console.log('Testing Neo X provider callback flow...');
const providerTx = await consumer.requestBuiltinProviderPrice({ value: requestFee });
const providerReceipt = await providerTx.wait();
const providerRequestId = resolveRequestId(oracle, providerReceipt);
const providerCallback = await waitForCallback(consumer, providerRequestId, callbackTimeoutMs);
if (!providerCallback.success) {
  throw new Error(
    `Neo X provider callback failed: ${providerCallback.error_text || 'unknown error'}`
  );
}

console.log('Testing Neo X encrypted compute flow...');
const encryptedPayload = await buildEncryptedBuiltinComputePayload('neo_x');
const computeTx = await consumer.requestBuiltinCompute(encryptedPayload, { value: requestFee });
const computeReceipt = await computeTx.wait();
const computeRequestId = resolveRequestId(oracle, computeReceipt);
const computeCallback = await waitForCallback(consumer, computeRequestId, callbackTimeoutMs);
if (!computeCallback.success) {
  throw new Error(
    `Neo X compute callback failed: ${computeCallback.error_text || 'unknown error'}`
  );
}

console.log('Testing Neo X sponsored provider callback flow...');
await (await signer.sendTransaction({ to: consumerAddress, value: requestFee })).wait();
if ((await consumer.contractFeeBalance()) < requestFee) {
  throw new Error('Neo X consumer contract fee balance was not funded');
}
const sponsoredProviderTx = await consumer.requestBuiltinProviderPriceSponsored();
const sponsoredProviderReceipt = await sponsoredProviderTx.wait();
const sponsoredProviderRequestId = resolveRequestId(oracle, sponsoredProviderReceipt);
const sponsoredProviderCallback = await waitForCallback(
  consumer,
  sponsoredProviderRequestId,
  callbackTimeoutMs
);
if (!sponsoredProviderCallback.success) {
  throw new Error(
    `Neo X sponsored provider callback failed: ${sponsoredProviderCallback.error_text || 'unknown error'}`
  );
}

console.log('Testing Neo X custom URL oracle flow...');
const encryptedOracleParams = await buildEncryptedJsonPatch('neo_x', { json_path: 'args.probe' });
const customOraclePayload = JSON.stringify({
  url: 'https://postman-echo.com/get?probe=neo-morpheus',
  target_chain: 'neo_x',
  encrypted_params: encryptedOracleParams,
});
const customOracleTx = await consumer.requestRaw('oracle', encodeUtf8Hex(customOraclePayload), {
  value: requestFee,
});
const customOracleReceipt = await customOracleTx.wait();
const customOracleRequestId = resolveRequestId(oracle, customOracleReceipt);
const customOracleCallback = await waitForCallback(
  consumer,
  customOracleRequestId,
  callbackTimeoutMs
);
if (!customOracleCallback.success) {
  throw new Error(
    `Neo X custom URL callback failed: ${customOracleCallback.error_text || 'unknown error'}`
  );
}
if (!JSON.stringify(customOracleCallback.result_json || {}).includes('neo-morpheus')) {
  throw new Error('Neo X custom URL callback did not return the expected echoed value');
}

console.log('Testing Neo X operator-only datafeed rejection...');
const feedPayload = JSON.stringify({
  symbol: 'NEO-USD',
  target_chain: 'neo_x',
  broadcast: true,
});
const feedTx = await consumer.requestRaw('datafeed', encodeUtf8Hex(feedPayload), {
  value: requestFee,
});
const feedReceipt = await feedTx.wait();
const feedRequestId = resolveRequestId(oracle, feedReceipt);
const feedCallback = await waitForCallback(consumer, feedRequestId, callbackTimeoutMs);
if (feedCallback.success) {
  throw new Error('Neo X user datafeed request should fail with operator-only error');
}
if (!feedCallback.error_text.includes('operator-only')) {
  throw new Error(
    `Neo X datafeed rejection returned unexpected error: ${feedCallback.error_text || 'missing error'}`
  );
}

console.log('Reading Neo X synchronized on-chain datafeed...');
const latestFeed = await datafeed.getLatest(feedPair);
const [readerPrice, readerTimestamp, readerAttestationHash] =
  await reader.getNeoUsdFromTwelveData();
const pairs = await reader.getAllPairs();
if (BigInt(latestFeed.roundId) <= 0n || BigInt(readerPrice) <= 0n) {
  throw new Error(`Neo X datafeed ${feedPair} is not populated on-chain`);
}

process.stdout.write(
  jsonPretty({
    network,
    neo_x: {
      consumer_address: consumerAddress,
      feed_reader_address: readerAddress,
      oracle_address: oracleAddress,
      datafeed_address: datafeedAddress,
      request_fee: requestFee.toString(),
      provider_request: {
        txid: providerTx.hash,
        request_id: providerRequestId,
        callback: providerCallback,
      },
      compute_request: {
        txid: computeTx.hash,
        request_id: computeRequestId,
        callback: computeCallback,
      },
      sponsored_provider_request: {
        txid: sponsoredProviderTx.hash,
        request_id: sponsoredProviderRequestId,
        callback: sponsoredProviderCallback,
      },
      custom_oracle_request: {
        txid: customOracleTx.hash,
        request_id: customOracleRequestId,
        callback: customOracleCallback,
      },
      datafeed_request: {
        txid: feedTx.hash,
        request_id: feedRequestId,
        callback: feedCallback,
      },
      onchain_feed_snapshot: {
        pair: feedPair,
        latest: normalizeFeedRecord(latestFeed),
        reader_latest: {
          price: readerPrice.toString(),
          timestamp: readerTimestamp.toString(),
          attestation_hash: readerAttestationHash,
        },
        reader_pairs: pairs,
      },
    },
  })
);
