import { randomUUID } from 'node:crypto';
import { relayNeoN3Invocation } from '../../nitro-worker/src/chain/index.js';
import { experimental, sc, tx, u, wallet as neonWallet } from '@cityofzion/neon-js';
import { deriveUpdaterNeoN3PrivateKeyHex, shouldUseDerivedKeys } from './nitro-signer.js';
import { callNitro } from './nitro.js';

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function strip0x(value) {
  return trimString(value).replace(/^0x/i, '').toLowerCase();
}

function tryDecodeUtf8(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function isPrintableText(text) {
  return typeof text === 'string' && /^[\x09\x0a\x0d\x20-\x7e]*$/.test(text);
}

const RPC_TIMEOUT_MS = 30_000;
const GAS_CONTRACT_HASH = '0xd2a4cff31913016155e38e474a2c06d08be276cf';
const DEFAULT_FEE_TOP_UP_MIN_BALANCE = 50_000_000n; // 0.5 GAS
const DEFAULT_FEE_TOP_UP_AMOUNT = 100_000_000n; // 1 GAS
const DEFAULT_FEE_TOP_UP_MAX_AMOUNT = 500_000_000n; // 5 GAS

function uniqueOrdered(values) {
  return [...new Set(values.map((entry) => trimString(entry)).filter(Boolean))];
}

function getNeoN3RpcUrls(configOrRpcUrl) {
  if (typeof configOrRpcUrl === 'string') return uniqueOrdered([configOrRpcUrl]);
  return uniqueOrdered([
    trimString(configOrRpcUrl?.neo_n3?.rpcUrl || ''),
    ...(Array.isArray(configOrRpcUrl?.neo_n3?.rpcUrls) ? configOrRpcUrl.neo_n3.rpcUrls : []),
  ]);
}

function promoteNeoN3RpcUrl(config, rpcUrl) {
  const nextUrl = trimString(rpcUrl);
  if (!nextUrl || !config?.neo_n3) return;
  config.neo_n3.rpcUrl = nextUrl;
  config.neo_n3.rpcUrls = uniqueOrdered([nextUrl, ...(config.neo_n3.rpcUrls || [])]);
}

function createNeoRpcError(rpcUrl, method, status, detail) {
  const suffix = trimString(detail);
  return new Error(
    `Neo RPC ${method} failed via ${rpcUrl} (${status})${suffix ? `: ${suffix}` : ''}`
  );
}

async function neoRpcCall(configOrRpcUrl, method, params = []) {
  const rpcUrls = getNeoN3RpcUrls(configOrRpcUrl);
  if (rpcUrls.length === 0) {
    throw new Error(`Neo RPC ${method} failed: no RPC endpoint configured`);
  }

  let lastError = null;
  for (const rpcUrl of rpcUrls) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: controller.signal,
      });
      const rawBody = await response.text();
      let body;
      try {
        body = JSON.parse(rawBody);
      } catch {
        throw createNeoRpcError(rpcUrl, method, response.status, 'non-JSON response');
      }
      if (!response.ok) {
        throw createNeoRpcError(
          rpcUrl,
          method,
          response.status,
          body?.error?.message || body?.message || response.statusText
        );
      }
      if (body?.error) {
        throw createNeoRpcError(rpcUrl, method, 200, body.error.message || `${method} failed`);
      }
      if (typeof configOrRpcUrl === 'object') {
        promoteNeoN3RpcUrl(configOrRpcUrl, rpcUrl);
      }
      return body.result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error(`Neo RPC ${method} failed`);
}

async function ensureHealthyNeoN3Rpc(config) {
  await neoRpcCall(config, 'getblockcount');
  return trimString(config?.neo_n3?.rpcUrl || '');
}

// Decode a Neo VM stack/notification item. `encoding` pins how ByteString /
// ByteArray values are encoded by the source: Neo JSON-RPC and n3index both
// emit base64, so all in-repo call sites pass 'base64'. The 'auto' default
// keeps the legacy hex-vs-base64 sniffing only as a last resort for sources
// whose encoding is unknown — a base64 payload made entirely of hex characters
// (e.g. 'abcd') would otherwise be mis-decoded as hex.
export function decodeNeoItem(item, encoding = 'auto') {
  if (!item || typeof item !== 'object') return null;
  const type = trimString(item.type).toLowerCase();
  switch (type) {
    case 'integer':
      return String(item.value ?? '0');
    case 'string':
      return String(item.value ?? '');
    case 'boolean':
      return Boolean(item.value);
    case 'hash160':
    case 'hash256':
      return String(item.value ?? '');
    case 'bytestring':
    case 'bytearray': {
      const raw = trimString(item.value);
      if (!raw) return '';
      const looksHex = /^[0-9a-fA-F]+$/.test(raw) && raw.length % 2 === 0;
      if (encoding === 'hex' || (encoding !== 'base64' && looksHex)) {
        if (!looksHex) return raw;
        const bytes = Buffer.from(raw, 'hex');
        const text = tryDecodeUtf8(bytes);
        if (isPrintableText(text)) return text;
        if (raw.length === 40) return `0x${bytes.reverse().toString('hex')}`;
        try {
          return bytes.toString('utf8');
        } catch {
          return raw;
        }
      }
      try {
        const bytes = Buffer.from(raw, 'base64');
        const text = tryDecodeUtf8(bytes);
        if (isPrintableText(text)) return text;
        if (bytes.length === 20) {
          return `0x${Buffer.from(bytes).reverse().toString('hex')}`;
        }
        return bytes.toString('utf8');
      } catch {
        return raw;
      }
    }
    case 'array':
    case 'struct':
      return Array.isArray(item.value)
        ? item.value.map((entry) => decodeNeoItem(entry, encoding))
        : [];
    default:
      return item.value ?? null;
  }
}

export function hasNeoN3RelayerConfig(config) {
  return Boolean(
    getNeoN3RpcUrls(config).length > 0 &&
    config.neo_n3.oracleContract &&
    (config.neo_n3.updaterWif || config.neo_n3.updaterPrivateKey || shouldUseDerivedKeys(config))
  );
}

export async function getNeoN3LatestBlock(config) {
  const blockCount = await neoRpcCall(config, 'getblockcount');
  return Number(blockCount) - 1;
}

export async function getNeoN3IndexedBlock(config) {
  const network = trimString(config.network) === 'mainnet' ? 'mainnet' : 'testnet';
  const baseUrl = trimString(config.neo_n3.indexerUrl || 'https://api.n3index.dev/rest/v1').replace(
    /\/$/,
    ''
  );
  const url = new URL(`${baseUrl}/indexer_state`);
  url.searchParams.set('network', `eq.${network}`);
  url.searchParams.set('select', 'last_indexed_block');
  url.searchParams.set('limit', '1');

  const response = await fetch(url.toString(), {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`n3index indexer_state failed: ${response.status} ${text}`.trim());
  }

  const rows = await response.json().catch(() => []);
  const latest = Array.isArray(rows) ? Number(rows[0]?.last_indexed_block || 0) : 0;
  if (!Number.isFinite(latest) || latest <= 0) {
    throw new Error('n3index last_indexed_block unavailable');
  }
  return latest;
}

export async function getNeoN3LatestRequestId(config) {
  const result = await neoRpcCall(config, 'invokefunction', [
    config.neo_n3.oracleContract,
    'getTotalRequests',
    [],
  ]);
  if (String(result?.state || '').toUpperCase() === 'FAULT') {
    throw new Error(result?.exception || 'Neo N3 getTotalRequests faulted');
  }
  return Number(decodeNeoItem(result?.stack?.[0], 'base64') || '0');
}

export function buildNeoN3RelayRequestId(scope, requestId) {
  const normalizedScope = trimString(scope) || 'invoke';
  return `relayer:n3:${normalizedScope}:${requestId}:${randomUUID()}`;
}

export function buildNeoN3EventFromRequestRecord(decoded, requestId) {
  if (!Array.isArray(decoded)) return null;

  if (decoded.length >= 14) {
    const [
      requestIdValue,
      appId,
      moduleId,
      operation,
      payloadText,
      requester,
      ,
      callbackContract,
      ,
      createdAtMs,
      fulfilledAtMs,
      ,
      resultText,
      errorText,
    ] = decoded;

    if (!trimString(operation)) return null;

    const alreadySettled = trimString(fulfilledAtMs) !== '' && trimString(fulfilledAtMs) !== '0';
    const hasOutcome = trimString(resultText) !== '' || trimString(errorText) !== '';
    if (alreadySettled || hasOutcome) return null;

    return {
      chain: 'neo_n3',
      requestId: String(requestIdValue || requestId),
      requestType: String(operation || ''),
      appId: String(appId || ''),
      moduleId: String(moduleId || ''),
      operation: String(operation || ''),
      requester: String(requester || ''),
      callbackContract: String(callbackContract || ''),
      callbackMethod: 'onOracleResult',
      payloadText: String(payloadText || ''),
      createdAtMs: Number(createdAtMs || 0),
      fulfilledAtMs: Number(fulfilledAtMs || 0),
      blockNumber: Number(createdAtMs || 0),
      txHash: '',
      logIndex: 0,
    };
  }

  if (decoded.length >= 12) {
    const [
      requestIdValue,
      requestType,
      payloadText,
      callbackContract,
      callbackMethod,
      requester,
      ,
      createdAtMs,
      fulfilledAtMs,
      ,
      resultText,
      errorText,
    ] = decoded;

    if (!trimString(requestType)) return null;

    const alreadySettled = trimString(fulfilledAtMs) !== '' && trimString(fulfilledAtMs) !== '0';
    const hasOutcome = trimString(resultText) !== '' || trimString(errorText) !== '';
    if (alreadySettled || hasOutcome) return null;

    return {
      chain: 'neo_n3',
      requestId: String(requestIdValue || requestId),
      requestType: String(requestType || ''),
      requester: String(requester || ''),
      callbackContract: String(callbackContract || ''),
      callbackMethod: String(callbackMethod || ''),
      payloadText: String(payloadText || ''),
      createdAtMs: Number(createdAtMs || 0),
      fulfilledAtMs: Number(fulfilledAtMs || 0),
      blockNumber: Number(createdAtMs || 0),
      txHash: '',
      logIndex: 0,
    };
  }

  return null;
}

// Event names emitted by the oracle request entry points. The current kernel
// contract (MorpheusOracle) emits `MiniAppRequestQueued`; legacy oracle
// contracts emit `OracleRequested`. The relayer accepts both so a single
// notification/block-cursor scan works against either deployment.
const NEO_N3_REQUEST_EVENT_NAMES = new Set(['MiniAppRequestQueued', 'OracleRequested']);

/**
 * Normalize a Neo N3 request notification into the internal event shape used by
 * the fulfillment pipeline. The two supported events have different state
 * layouts:
 *   - MiniAppRequestQueued: [requestId, appId, moduleId, operation, requester,
 *       sponsor, payload] (kernel contract). `requestType` is the operation so
 *       it matches the working `request_cursor` path which derives the kernel
 *       intent from `operation`.
 *   - OracleRequested: [requestId, requestType, requester, callbackContract,
 *       callbackMethod, payload] (legacy contract).
 * Returns null when the event name is unknown or the decoded state is empty.
 */
function buildNeoN3EventFromNotificationState(eventName, decodedState, meta = {}) {
  const state = Array.isArray(decodedState) ? decodedState : [];
  if (eventName === 'MiniAppRequestQueued') {
    const [requestId, appId, moduleId, operation, requester, , payload] = state;
    if (!trimString(operation)) return null;
    return {
      chain: 'neo_n3',
      requestId: String(requestId || '0'),
      requestType: String(operation || ''),
      appId: String(appId || ''),
      moduleId: String(moduleId || ''),
      operation: String(operation || ''),
      requester: String(requester || ''),
      callbackContract: '',
      callbackMethod: 'onOracleResult',
      payloadText: String(payload || ''),
      blockNumber: Number(meta.blockNumber ?? 0),
      txHash: String(meta.txHash || ''),
      ...(meta.logIndex !== undefined ? { logIndex: Number(meta.logIndex) } : {}),
    };
  }
  if (eventName === 'OracleRequested') {
    const [requestId, requestType, requester, callbackContract, callbackMethod, payload] = state;
    if (!trimString(requestType)) return null;
    return {
      chain: 'neo_n3',
      requestId: String(requestId || '0'),
      requestType: String(requestType || ''),
      requester: String(requester || ''),
      callbackContract: String(callbackContract || ''),
      callbackMethod: String(callbackMethod || ''),
      payloadText: String(payload || ''),
      blockNumber: Number(meta.blockNumber ?? 0),
      txHash: String(meta.txHash || ''),
      ...(meta.logIndex !== undefined ? { logIndex: Number(meta.logIndex) } : {}),
    };
  }
  return null;
}

export async function scanNeoN3OracleRequests(config, fromBlock, toBlock) {
  if (fromBlock > toBlock) return [];
  const out = [];
  const targetContract = strip0x(config.neo_n3.oracleContract);

  for (let height = fromBlock; height <= toBlock; height += 1) {
    const block = await neoRpcCall(config, 'getblock', [height, 1]);
    const transactions = Array.isArray(block?.tx) ? block.tx : [];
    for (const transaction of transactions) {
      const txHash = transaction.txid || transaction.hash;
      if (!txHash) continue;
      const appLog = await neoRpcCall(config, 'getapplicationlog', [txHash]);
      const executions = Array.isArray(appLog?.executions) ? appLog.executions : [];
      for (const execution of executions) {
        const notifications = Array.isArray(execution?.notifications)
          ? execution.notifications
          : [];
        let logIndex = 0;
        for (const notification of notifications) {
          const notificationIndex = logIndex;
          logIndex += 1;
          if (strip0x(notification.contract) !== targetContract) continue;
          const eventName = trimString(notification.eventname);
          if (!NEO_N3_REQUEST_EVENT_NAMES.has(eventName)) continue;
          const state = Array.isArray(notification.state?.value) ? notification.state.value : [];
          const decodedState = state.map((entry) => decodeNeoItem(entry, 'base64'));
          const event = buildNeoN3EventFromNotificationState(eventName, decodedState, {
            blockNumber: height,
            txHash,
            logIndex: notificationIndex,
          });
          if (event) out.push(event);
        }
      }
    }
  }

  return out;
}

export async function scanNeoN3OracleRequestsViaN3Index(config, fromBlock, toBlock) {
  if (fromBlock > toBlock) return [];
  const network = trimString(config.network) === 'mainnet' ? 'mainnet' : 'testnet';
  const baseUrl = trimString(config.neo_n3.indexerUrl || 'https://api.n3index.dev/rest/v1').replace(
    /\/$/,
    ''
  );
  const url = new URL(`${baseUrl}/contract_notifications`);
  url.searchParams.set('network', `eq.${network}`);
  url.searchParams.set('contract_hash', `eq.${config.neo_n3.oracleContract}`);
  // Accept both the current kernel event and the legacy oracle event.
  url.searchParams.set('event_name', `in.(${[...NEO_N3_REQUEST_EVENT_NAMES].join(',')})`);
  url.searchParams.set('order', 'block_index.desc');
  url.searchParams.set('limit', String(Math.max(config.maxBlocksPerTick * 4, 500)));

  const response = await fetch(url.toString(), {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`n3index oracle request scan failed: ${response.status} ${text}`.trim());
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
      // n3index serves state_json/raw_json values base64-encoded, mirroring the
      // node's JSON-RPC notification format.
      const decodedState = state.map((entry) => decodeNeoItem(entry, 'base64'));
      return buildNeoN3EventFromNotificationState(trimString(row?.event_name), decodedState, {
        blockNumber: Number(row?.block_index || 0),
        txHash: String(row?.txid || ''),
        logIndex: Number(row?.notification_index || 0),
      });
    })
    .filter((event) => event && trimString(event.requestType));
}

export async function scanNeoN3OracleRequestsById(config, fromRequestId, toRequestId) {
  if (fromRequestId > toRequestId) return [];
  const out = [];

  for (let requestId = fromRequestId; requestId <= toRequestId; requestId += 1) {
    const result = await neoRpcCall(config, 'invokefunction', [
      config.neo_n3.oracleContract,
      'getRequest',
      [{ type: 'Integer', value: String(requestId) }],
    ]);
    if (String(result?.state || '').toUpperCase() === 'FAULT') {
      throw new Error(result?.exception || `Neo N3 getRequest faulted for request ${requestId}`);
    }

    const event = buildNeoN3EventFromRequestRecord(
      decodeNeoItem(result?.stack?.[0], 'base64'),
      requestId
    );
    if (event) out.push(event);
  }

  return out;
}

export function encodeUtf8ByteArrayParamValue(value) {
  const raw = trimString(value);
  if (!raw) return '';
  return Buffer.from(raw, 'utf8').toString('base64');
}

function base64ToHex(value) {
  const raw = trimString(value);
  if (!raw) return '';
  return Buffer.from(raw, 'base64').toString('hex');
}

function normalizePublicKey(value) {
  const publicKey = strip0x(value);
  if (!/^[0-9a-f]{66}$/i.test(publicKey) && !/^[0-9a-f]{130}$/i.test(publicKey)) {
    throw new Error('runtime derived updater returned an invalid public key');
  }
  return publicKey;
}

function normalizeSignature(value) {
  const signature = strip0x(value);
  if (!/^[0-9a-f]{128}$/i.test(signature)) {
    throw new Error('runtime derived updater returned an invalid signature');
  }
  return signature;
}

function normalizeHash160(value) {
  const raw = trimString(value);
  if (/^0x[0-9a-f]{40}$/i.test(raw)) return raw.toLowerCase();
  if (/^[0-9a-f]{40}$/i.test(raw)) return `0x${raw.toLowerCase()}`;
  try {
    return `0x${neonWallet.getScriptHashFromAddress(raw)}`.toLowerCase();
  } catch {
    return '';
  }
}

function parseNonNegativeBigInt(value, fallback) {
  const raw = trimString(value);
  if (!/^[0-9]+$/.test(raw)) return fallback;
  return BigInt(raw);
}

function getNeoN3FeeTopUpSettings(config) {
  const raw = config?.neo_n3?.feeTopUp || {};
  if (!raw.enabled) return { enabled: false };
  return {
    enabled: true,
    minBalance: parseNonNegativeBigInt(raw.minBalance, DEFAULT_FEE_TOP_UP_MIN_BALANCE),
    topUpAmount: parseNonNegativeBigInt(raw.topUpAmount, DEFAULT_FEE_TOP_UP_AMOUNT),
    maxTopUpAmount: parseNonNegativeBigInt(raw.maxTopUpAmount, DEFAULT_FEE_TOP_UP_MAX_AMOUNT),
    funderWif: trimString(raw.funderWif || ''),
    funderPrivateKey: trimString(raw.funderPrivateKey || ''),
  };
}

function buildLocalNeoN3AccountFromSecret(wif, privateKey) {
  const secret = trimString(wif) || trimString(privateKey);
  if (!secret) return null;
  return new neonWallet.Account(secret);
}

async function readNeoN3GasBalance(config, scriptHash) {
  const normalized = normalizeHash160(scriptHash);
  if (!normalized) throw new Error('Neo N3 GAS balance read failed: invalid account');
  const result = await neoRpcCall(config, 'invokefunction', [
    GAS_CONTRACT_HASH,
    'balanceOf',
    [{ type: 'Hash160', value: normalized }],
  ]);
  if (String(result?.state || '').toUpperCase() === 'FAULT') {
    throw new Error(result?.exception || 'Neo N3 GAS balance read faulted');
  }
  return BigInt(decodeNeoItem(result?.stack?.[0], 'base64') || '0');
}

async function waitForNeoN3TransactionHalt(config, txHash, label) {
  const deadline = Date.now() + Number(config?.neo_n3?.feeTopUp?.waitTimeoutMs || 45_000);
  let lastError = null;
  let fatalError = null;
  while (Date.now() < deadline) {
    try {
      const appLog = await neoRpcCall(config, 'getapplicationlog', [txHash]);
      const execution = appLog?.executions?.[0];
      const vmState = trimString(execution?.vmstate || '').toUpperCase();
      if (vmState === 'HALT') return;
      if (vmState) {
        fatalError = new Error(
          `${label} faulted (${txHash}): ${execution?.exception || vmState || 'unknown error'}`
        );
        break;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (fatalError) throw fatalError;
  throw new Error(
    `${label} was not confirmed before timeout (${txHash})${
      lastError?.message ? `: ${lastError.message}` : ''
    }`
  );
}

async function sendNeoN3GasTransfer(config, funder, toScriptHash, amount) {
  const to = normalizeHash160(toScriptHash);
  const script = sc.createScript({
    scriptHash: strip0x(GAS_CONTRACT_HASH),
    operation: 'transfer',
    args: [
      sc.ContractParam.hash160(`0x${funder.scriptHash}`),
      sc.ContractParam.hash160(to),
      sc.ContractParam.integer(String(amount)),
      sc.ContractParam.any(null),
    ],
  });
  const blockCount = Number(await neoRpcCall(config, 'getblockcount'));
  const signers = [{ account: strip0x(funder.scriptHash), scopes: tx.WitnessScope.CalledByEntry }];
  const transfer = new tx.Transaction({
    version: 0,
    nonce: Math.floor(Math.random() * 2 ** 32),
    script: u.HexString.fromHex(script),
    validUntilBlock: blockCount + 120,
    signers,
    attributes: [],
    witnesses: [],
  });
  const testInvoke = await neoRpcCall(config, 'invokescript', [
    transfer.script.toBase64(),
    [{ account: strip0x(funder.scriptHash), scopes: 'CalledByEntry' }],
  ]);
  if (String(testInvoke?.state || '').toUpperCase() === 'FAULT') {
    throw new Error(
      `Neo N3 updater fee top-up test invoke faulted: ${testInvoke?.exception || 'unknown error'}`
    );
  }
  const gasConsumed = BigInt(testInvoke?.gasconsumed || testInvoke?.gas_consumed || '0');
  transfer.systemFee = u.BigInteger.fromDecimal(String(gasConsumed + 100000n), 0);
  transfer.sign(funder, config.neo_n3.networkMagic);
  const networkFeeResponse = await neoRpcCall(config, 'calculatenetworkfee', [
    Buffer.from(transfer.serialize(true), 'hex').toString('base64'),
  ]);
  const networkFeeRaw =
    typeof networkFeeResponse === 'string'
      ? networkFeeResponse
      : networkFeeResponse?.networkfee || networkFeeResponse?.network_fee || '0';
  transfer.networkFee = u.BigInteger.fromDecimal(String(BigInt(networkFeeRaw || '0') + 100000n), 0);
  transfer.sign(funder, config.neo_n3.networkMagic);
  const txHash = `0x${transfer.hash()}`;
  await neoRpcCall(config, 'sendrawtransaction', [
    Buffer.from(transfer.serialize(true), 'hex').toString('base64'),
  ]);
  await waitForNeoN3TransactionHalt(config, txHash, 'Neo N3 updater fee top-up');
  return txHash;
}

async function ensureNeoN3FeeBalance(config, target, requiredFee = 0n) {
  const settings = getNeoN3FeeTopUpSettings(config);
  if (!settings.enabled) return { skipped: true, reason: 'disabled' };
  const targetHash = normalizeHash160(target?.scriptHash || target?.address || '');
  if (!targetHash) return { skipped: true, reason: 'invalid-target' };
  const requiredBalance = requiredFee + settings.minBalance;
  const currentBalance = await readNeoN3GasBalance(config, targetHash);
  if (currentBalance >= requiredBalance) {
    return { skipped: true, reason: 'sufficient', balance: currentBalance.toString() };
  }
  const funder = buildLocalNeoN3AccountFromSecret(settings.funderWif, settings.funderPrivateKey);
  if (!funder) {
    throw new Error(
      `Neo N3 updater fee balance is below reserve; configure MORPHEUS_RELAYER_NEO_N3_FEE_FUNDER_WIF for auto top-up`
    );
  }
  const funderHash = normalizeHash160(`0x${funder.scriptHash}`);
  if (funderHash === targetHash) {
    throw new Error('Neo N3 updater fee top-up funder cannot be the same account as the updater');
  }
  const deficit = requiredBalance - currentBalance;
  const amount = deficit > settings.topUpAmount ? deficit : settings.topUpAmount;
  if (settings.maxTopUpAmount > 0n && amount > settings.maxTopUpAmount) {
    throw new Error(
      `Neo N3 updater fee top-up amount ${amount} exceeds configured max ${settings.maxTopUpAmount}`
    );
  }
  const funderBalance = await readNeoN3GasBalance(config, funderHash);
  if (funderBalance < amount + settings.minBalance) {
    throw new Error('Neo N3 updater fee top-up funder has insufficient GAS reserve');
  }
  const txHash = await sendNeoN3GasTransfer(config, funder, targetHash, amount);
  return {
    skipped: false,
    tx_hash: txHash,
    amount: amount.toString(),
    previous_balance: currentBalance.toString(),
    required_balance: requiredBalance.toString(),
  };
}

function buildSignatureWitness(signature, publicKey) {
  return new tx.Witness({
    invocationScript: u.HexString.fromHex(`0c40${normalizeSignature(signature)}`),
    verificationScript: u.HexString.fromHex(
      neonWallet.getVerificationScriptFromPublicKey(normalizePublicKey(publicKey))
    ),
  });
}

function buildFulfillRequestParams(requestId, success, resultHex, error, verificationSignature) {
  return [
    sc.ContractParam.integer(String(requestId)),
    sc.ContractParam.boolean(Boolean(success)),
    sc.ContractParam.byteArray(u.HexString.fromHex(resultHex, true)),
    sc.ContractParam.string(error || ''),
    sc.ContractParam.byteArray(
      u.HexString.fromHex(trimString(verificationSignature || '').replace(/^0x/i, ''), true)
    ),
  ];
}

async function resolveRuntimeDerivedUpdater(config) {
  const response = await callNitro(
    config,
    '/keys/derived',
    {
      role: 'updater',
      key_role: 'updater',
      dstack_key_role: 'updater',
      target_chain: 'neo_n3',
      use_derived_keys: true,
    },
    { baseUrl: config.nitro.signerUrl }
  );
  if (!response.ok) {
    throw new Error(`runtime derived updater lookup failed with status ${response.status}`);
  }
  const neo = response.body?.derived?.neo_n3 || response.body?.neo_n3 || {};
  const publicKey = normalizePublicKey(neo.public_key || neo.publicKey || '');
  const scriptHash =
    normalizeHash160(neo.script_hash || '') ||
    normalizeHash160(neo.address || '') ||
    `0x${neonWallet.getScriptHashFromPublicKey(publicKey)}`.toLowerCase();
  return {
    publicKey,
    scriptHash,
    address: trimString(neo.address || ''),
  };
}

async function signNeoN3TransactionWithRuntimeUpdater(config, messageHex, expectedPublicKey) {
  const response = await callNitro(
    config,
    '/sign/payload',
    {
      target_chain: 'neo_n3',
      key_role: 'updater',
      dstack_key_role: 'updater',
      data_hex: trimString(messageHex).replace(/^0x/i, ''),
      use_derived_keys: true,
    },
    { baseUrl: config.nitro.signerUrl }
  );
  if (!response.ok) {
    throw new Error(`runtime derived updater signing failed with status ${response.status}`);
  }
  const signature = normalizeSignature(
    response.body?.signature || response.body?.signature_hex || ''
  );
  const publicKey = normalizePublicKey(response.body?.public_key || response.body?.publicKey || '');
  if (publicKey.toLowerCase() !== normalizePublicKey(expectedPublicKey).toLowerCase()) {
    throw new Error('runtime derived updater signing key changed between lookup and signing');
  }
  return { signature, publicKey };
}

async function fulfillNeoN3RequestWithRuntimeDerivedUpdater(
  config,
  requestId,
  success,
  resultHex,
  error,
  verificationSignature
) {
  const updater = await resolveRuntimeDerivedUpdater(config);
  const script = sc.createScript({
    scriptHash: strip0x(config.neo_n3.oracleContract),
    operation: 'fulfillRequest',
    args: buildFulfillRequestParams(requestId, success, resultHex, error, verificationSignature),
  });
  const blockCount = Number(await neoRpcCall(config, 'getblockcount'));
  const transaction = new tx.Transaction({
    version: 0,
    nonce: Math.floor(Math.random() * 2 ** 32),
    script: u.HexString.fromHex(script),
    validUntilBlock: blockCount + 120,
    signers: [{ account: strip0x(updater.scriptHash), scopes: tx.WitnessScope.CalledByEntry }],
    attributes: [],
    witnesses: [],
  });

  const testInvoke = await neoRpcCall(config, 'invokescript', [
    transaction.script.toBase64(),
    [{ account: strip0x(updater.scriptHash), scopes: 'CalledByEntry' }],
  ]);
  if (String(testInvoke?.state || '').toUpperCase() === 'FAULT') {
    throw new Error(
      `Neo N3 fulfillRequest test invoke faulted for request ${requestId}: ${
        testInvoke?.exception || 'unknown error'
      }`
    );
  }
  const gasConsumed = BigInt(testInvoke?.gasconsumed || testInvoke?.gas_consumed || '0');
  transaction.systemFee = u.BigInteger.fromDecimal(
    String(gasConsumed + gasConsumed / 5n + 100000n),
    0
  );

  const feeSignature = await signNeoN3TransactionWithRuntimeUpdater(
    config,
    transaction.getMessageForSigning(config.neo_n3.networkMagic),
    updater.publicKey
  );
  transaction.witnesses = [buildSignatureWitness(feeSignature.signature, feeSignature.publicKey)];
  const networkFeeResponse = await neoRpcCall(config, 'calculatenetworkfee', [
    Buffer.from(transaction.serialize(true), 'hex').toString('base64'),
  ]);
  const networkFeeRaw =
    typeof networkFeeResponse === 'string'
      ? networkFeeResponse
      : networkFeeResponse?.networkfee || networkFeeResponse?.network_fee || '0';
  transaction.networkFee = u.BigInteger.fromDecimal(
    String(BigInt(networkFeeRaw || '0') + 100000n),
    0
  );
  await ensureNeoN3FeeBalance(
    config,
    updater,
    gasConsumed + gasConsumed / 5n + 100000n + BigInt(networkFeeRaw || '0') + 100000n
  );

  const finalSignature = await signNeoN3TransactionWithRuntimeUpdater(
    config,
    transaction.getMessageForSigning(config.neo_n3.networkMagic),
    updater.publicKey
  );
  transaction.witnesses = [
    buildSignatureWitness(finalSignature.signature, finalSignature.publicKey),
  ];
  const witnessHash = normalizeHash160(`0x${transaction.witnesses[0].scriptHash}`);
  if (witnessHash !== updater.scriptHash) {
    throw new Error(
      `runtime derived updater witness mismatch: expected ${updater.scriptHash}, got ${witnessHash}`
    );
  }

  const txHash = `0x${transaction.hash()}`;
  const signedBase64 = Buffer.from(transaction.serialize(true), 'hex').toString('base64');
  await neoRpcCall(config, 'sendrawtransaction', [signedBase64]);
  return txHash;
}

export function assertNeoN3HaltExecution(requestId, txHash, execution) {
  const vmState = trimString(execution?.vmstate || 'HALT').toUpperCase() || 'HALT';
  const exception = trimString(execution?.exception || '');
  if (vmState !== 'HALT') {
    const detail = exception || `VM state ${vmState}`;
    throw new Error(
      `Neo N3 fulfillRequest faulted for request ${requestId} (${txHash}): ${detail}`
    );
  }
  return { vm_state: vmState, exception: exception || undefined };
}

const DEFAULT_FULFILL_CONFIRM_TIMEOUT_MS = 45_000;

function getNeoN3FulfillConfirmTimeoutMs(config) {
  const explicit = Number(config?.neo_n3?.fulfillConfirmTimeoutMs);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const fromFeeTopUp = Number(config?.neo_n3?.feeTopUp?.waitTimeoutMs);
  if (Number.isFinite(fromFeeTopUp) && fromFeeTopUp > 0) return fromFeeTopUp;
  return DEFAULT_FULFILL_CONFIRM_TIMEOUT_MS;
}

/**
 * Confirm a broadcast fulfillRequest transaction by polling its application log
 * until the VM result is available. `contract.invoke` and `sendrawtransaction`
 * return immediately after broadcast, so a single getapplicationlog call races
 * the chain: the log may not exist yet (RPC throws / no executions), which would
 * otherwise let a FAULT be recorded as a successful HALT. We poll until a
 * concrete vmstate is observed:
 *   - HALT  -> resolve with vm_state HALT
 *   - FAULT -> throw (never record a faulted tx as fulfilled)
 * If the log never becomes available before the timeout we degrade to UNKNOWN
 * (best-effort) rather than throwing, preserving prior behavior for genuinely
 * un-indexable broadcasts while never masking a confirmed FAULT.
 */
async function confirmNeoN3FulfillExecution(config, requestId, txHash) {
  const deadline = Date.now() + getNeoN3FulfillConfirmTimeoutMs(config);
  let lastError = null;
  for (;;) {
    try {
      const appLog = await neoRpcCall(config, 'getapplicationlog', [txHash]);
      const execution = appLog?.executions?.[0];
      const vmState = trimString(execution?.vmstate || '').toUpperCase();
      if (vmState) {
        // A concrete VM state is present: validate it (throws on FAULT).
        return assertNeoN3HaltExecution(requestId, txHash, execution);
      }
      // Log exists but has no execution result yet; keep polling.
    } catch (error) {
      if (error instanceof Error && error.message.includes('Neo N3 fulfillRequest faulted')) {
        throw error;
      }
      lastError = error instanceof Error ? error : new Error(String(error));
    }
    if (Date.now() >= deadline) {
      return {
        vm_state: 'UNKNOWN',
        exception:
          lastError?.message || 'fulfillRequest application log unavailable before timeout',
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

async function resolveNeoN3UpdaterPayload(config) {
  if (config.neo_n3.updaterWif) {
    return { wif: config.neo_n3.updaterWif };
  }
  if (config.neo_n3.updaterPrivateKey) {
    return { private_key: config.neo_n3.updaterPrivateKey };
  }
  if (shouldUseDerivedKeys(config)) {
    return { private_key: await deriveUpdaterNeoN3PrivateKeyHex() };
  }
  throw new Error('Neo N3 updater signing material is not configured');
}

export async function fulfillNeoN3Request(
  config,
  requestId,
  success,
  result,
  error,
  verificationSignature,
  resultBytesBase64 = ''
) {
  await ensureHealthyNeoN3Rpc(config);
  const resultHex = trimString(resultBytesBase64)
    ? base64ToHex(resultBytesBase64)
    : Buffer.from(String(result || ''), 'utf8').toString('hex');
  let txHash;
  try {
    const signerPayload = await resolveNeoN3UpdaterPayload(config);
    const signerAccount = signerPayload.wif
      ? new neonWallet.Account(signerPayload.wif)
      : new neonWallet.Account(signerPayload.private_key);
    const contract = new experimental.SmartContract(config.neo_n3.oracleContract, {
      rpcAddress: config.neo_n3.rpcUrl,
      networkMagic: config.neo_n3.networkMagic,
      account: signerAccount,
    });
    const txHashRaw = await contract.invoke(
      'fulfillRequest',
      buildFulfillRequestParams(requestId, success, resultHex, error, verificationSignature)
    );
    txHash = trimString(txHashRaw).startsWith('0x')
      ? trimString(txHashRaw)
      : `0x${trimString(txHashRaw)}`;
  } catch (localError) {
    if (!shouldUseDerivedKeys(config)) throw localError;
    txHash = await fulfillNeoN3RequestWithRuntimeDerivedUpdater(
      config,
      requestId,
      success,
      resultHex,
      error,
      verificationSignature
    );
  }
  // Wait for the broadcast to be applied and confirm the VM result. A confirmed
  // FAULT throws here so it is never recorded as a successful fulfillment.
  const outcome = await confirmNeoN3FulfillExecution(config, requestId, txHash);
  return {
    request_id: buildNeoN3RelayRequestId('fulfill', requestId),
    tx_hash: txHash,
    vm_state: outcome.vm_state,
    exception: outcome.exception,
    target_chain: 'neo_n3',
  };
}

async function queueNeoN3AutomationRequestWithRuntimeDerivedUpdater(
  config,
  requester,
  requestType,
  payloadText,
  callbackContract,
  callbackMethod,
  requestId
) {
  const updater = await resolveRuntimeDerivedUpdater(config);
  const script = sc.createScript({
    scriptHash: strip0x(config.neo_n3.oracleContract),
    operation: 'queueAutomationRequest',
    args: [
      sc.ContractParam.hash160(requester),
      sc.ContractParam.string(requestType),
      sc.ContractParam.byteArray(Buffer.from(payloadText || '', 'utf8').toString('base64')),
      sc.ContractParam.hash160(callbackContract),
      sc.ContractParam.string(callbackMethod),
    ],
  });
  const blockCount = Number(await neoRpcCall(config, 'getblockcount'));
  const transaction = new tx.Transaction({
    version: 0,
    nonce: Math.floor(Math.random() * 2 ** 32),
    script: u.HexString.fromHex(script),
    validUntilBlock: blockCount + 120,
    signers: [{ account: strip0x(updater.scriptHash), scopes: tx.WitnessScope.CalledByEntry }],
    attributes: [],
    witnesses: [],
  });

  const testInvoke = await neoRpcCall(config, 'invokescript', [
    transaction.script.toBase64(),
    [{ account: strip0x(updater.scriptHash), scopes: 'CalledByEntry' }],
  ]);
  if (String(testInvoke?.state || '').toUpperCase() === 'FAULT') {
    throw new Error(
      testInvoke?.exception || `Neo N3 automation queue test invoke faulted for ${requester}`
    );
  }
  const gasConsumed = BigInt(testInvoke?.gasconsumed || testInvoke?.gas_consumed || '0');
  transaction.systemFee = u.BigInteger.fromDecimal(
    String(gasConsumed + gasConsumed / 5n + 100000n),
    0
  );

  const feeSignature = await signNeoN3TransactionWithRuntimeUpdater(
    config,
    transaction.getMessageForSigning(config.neo_n3.networkMagic),
    updater.publicKey
  );
  transaction.witnesses = [buildSignatureWitness(feeSignature.signature, feeSignature.publicKey)];
  const networkFeeResponse = await neoRpcCall(config, 'calculatenetworkfee', [
    Buffer.from(transaction.serialize(true), 'hex').toString('base64'),
  ]);
  const networkFeeRaw =
    typeof networkFeeResponse === 'string'
      ? networkFeeResponse
      : networkFeeResponse?.networkfee || networkFeeResponse?.network_fee || '0';
  transaction.networkFee = u.BigInteger.fromDecimal(
    String(BigInt(networkFeeRaw || '0') + 100000n),
    0
  );
  await ensureNeoN3FeeBalance(
    config,
    updater,
    gasConsumed + gasConsumed / 5n + 100000n + BigInt(networkFeeRaw || '0') + 100000n
  );

  const finalSignature = await signNeoN3TransactionWithRuntimeUpdater(
    config,
    transaction.getMessageForSigning(config.neo_n3.networkMagic),
    updater.publicKey
  );
  transaction.witnesses = [
    buildSignatureWitness(finalSignature.signature, finalSignature.publicKey),
  ];
  const witnessHash = normalizeHash160(`0x${transaction.witnesses[0].scriptHash}`);
  if (witnessHash !== updater.scriptHash) {
    throw new Error(
      `runtime derived updater witness mismatch: expected ${updater.scriptHash}, got ${witnessHash}`
    );
  }

  const txHash = `0x${transaction.hash()}`;
  const signedBase64 = Buffer.from(transaction.serialize(true), 'hex').toString('base64');
  await neoRpcCall(config, 'sendrawtransaction', [signedBase64]);
  return {
    tx_hash: txHash,
    request_id: requestId,
    vm_state: 'UNKNOWN',
    target_chain: 'neo_n3',
    signer_source: 'runtime_derived_updater',
  };
}

export async function queueNeoN3AutomationRequest(
  config,
  requester,
  requestType,
  payloadText,
  callbackContract,
  callbackMethod,
  requestIdOverride = ''
) {
  await ensureHealthyNeoN3Rpc(config);
  const requestId = trimString(requestIdOverride) || `automation:n3:${Date.now()}`;
  let invoke;
  try {
    const signerPayload = await resolveNeoN3UpdaterPayload(config);
    invoke = await relayNeoN3Invocation({
      request_id: requestId,
      contract_hash: config.neo_n3.oracleContract,
      method: 'queueAutomationRequest',
      params: [
        { type: 'Hash160', value: requester },
        { type: 'String', value: requestType },
        { type: 'ByteArray', value: encodeUtf8ByteArrayParamValue(payloadText || '') },
        { type: 'Hash160', value: callbackContract },
        { type: 'String', value: callbackMethod },
      ],
      wait: true,
      rpc_url: config.neo_n3.rpcUrl,
      network_magic: config.neo_n3.networkMagic,
      ...signerPayload,
    });
  } catch (localError) {
    if (!shouldUseDerivedKeys(config)) throw localError;
    try {
      const runtimeInvoke = await queueNeoN3AutomationRequestWithRuntimeDerivedUpdater(
        config,
        requester,
        requestType,
        payloadText,
        callbackContract,
        callbackMethod,
        requestId
      );
      return runtimeInvoke;
    } catch (runtimeError) {
      if (/request_id already used/i.test(String(runtimeError?.message || ''))) {
        return { duplicate: true, request_id: requestId, target_chain: 'neo_n3' };
      }
      throw runtimeError;
    }
  }

  if (invoke.status >= 400) {
    if (/request_id already used/i.test(String(invoke.body?.error || ''))) {
      return { duplicate: true, request_id: requestId, target_chain: 'neo_n3' };
    }
    throw new Error(invoke.body?.error || `Neo N3 automation queue failed for ${requester}`);
  }
  if (String(invoke.body?.vm_state || '').toUpperCase() === 'FAULT') {
    throw new Error(
      invoke.body?.exception ||
        invoke.body?.error ||
        `Neo N3 automation queue faulted for ${requester}`
    );
  }
  return {
    ...invoke.body,
    request_id: invoke.body?.request_id || requestId,
    target_chain: 'neo_n3',
  };
}

export async function fetchNeoN3FeedRecord(config, pair) {
  const result = await neoRpcCall(config, 'invokefunction', [
    config.neo_n3.datafeedContract,
    'getLatest',
    [{ type: 'String', value: pair }],
  ]);
  if (String(result?.state || '').toUpperCase() === 'FAULT') {
    throw new Error(result?.exception || `Neo N3 getLatest faulted for ${pair}`);
  }
  const decoded = decodeNeoItem(result?.stack?.[0], 'base64');
  if (!Array.isArray(decoded) || decoded.length < 6) {
    throw new Error(`Neo N3 feed response malformed for ${pair}`);
  }
  return {
    pair: String(decoded[0] || pair),
    roundId: String(decoded[1] || '0'),
    price: String(decoded[2] || '0'),
    timestamp: String(decoded[3] || '0'),
    attestationHash: String(decoded[4] || ''),
    sourceSetId: String(decoded[5] || '0'),
  };
}
