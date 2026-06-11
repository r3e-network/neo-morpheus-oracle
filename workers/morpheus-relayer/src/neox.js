// Neo X (EVM) chain adapter for the multi-chain oracle relayer.
//
// Implements the same adapter shape the generic engine (request-processor.js)
// already uses for Neo N3: hasConfig / getLatestRequestId / scan(byRequestId),
// plus the two chain-specific fulfillment primitives the shared fulfillment
// pipeline branches into — signNeoXFulfillment (EVM keccak digest + secp256k1
// EIP-191 signature) and fulfillNeoXRequest (ethers fulfillRequest submission).
//
// Work lanes (VRF / oracle.fetch / compute) are produced chain-agnostically by
// fulfillment.js BEFORE these run; this module only encodes/signs/submits the
// result for the EVM MorpheusOracleEVM kernel.
import { ethers } from 'ethers';
import { trimString } from '@neo-morpheus-oracle/shared/utils';

// Minimal ABI for the MorpheusOracleEVM kernel (request_cursor scan + fulfil).
const ORACLE_ABI = [
  'function totalRequests() view returns (uint256)',
  'function oracleVerifier() view returns (address)',
  // NB: 'error' is a reserved word in ethers' human-readable ABI grammar, so the
  // string fields are named errorText/errorArg (param names do not affect encoding).
  'function getRequest(uint256) view returns (tuple(uint256 id, string appId, string moduleId, string operation, bytes payload, address requester, address callbackContract, uint8 status, uint64 createdAt, uint64 fulfilledAt, bool success, bytes resultBytes, string errorText))',
  'function fulfillRequest(uint256 requestId, bool success, bytes result, string errorArg, bytes signature)',
  // Custom errors — required so ethers decodes the revert reason (name) from a
  // failed staticCall simulation; without these fragments the reason is opaque.
  'error RequestNotPending()',
  'error BadSignature()',
  'error NotUpdater()',
  'error AppNotFound()',
  'error ModuleNotGranted()',
];

const FULFILLMENT_DOMAIN = 'morpheus-evm-fulfillment-v1';
const STATUS_PENDING = 1; // Status enum: None=0, Pending=1, Succeeded=2, Failed=3

const providerCache = new Map();
const signerCache = new Map();
// Per-signer submission queue: serialize tx build+send+wait+reset so concurrent
// engine workers never race on the shared NonceManager (out-of-order nonces) or
// reset() it mid-flight. EVM submission is fast + Neo X volume is low.
const submitQueues = new Map();

function signerKey(config) {
  return `${trimString(config?.neox?.updaterPrivateKey || '')}|${trimString(config?.neox?.rpcUrl || '')}`;
}

function runExclusive(key, fn) {
  const prev = submitQueues.get(key) || Promise.resolve();
  const run = prev.then(fn, fn); // run after the previous settles (success or failure)
  submitQueues.set(
    key,
    run.then(
      () => {},
      () => {}
    )
  );
  return run;
}

function getProvider(config) {
  const rpcUrl = trimString(config?.neox?.rpcUrl || '');
  const chainId = Number(config?.neox?.chainId || 0) || undefined;
  const key = `${rpcUrl}|${chainId || ''}`;
  let provider = providerCache.get(key);
  if (!provider) {
    provider = new ethers.JsonRpcProvider(rpcUrl, chainId);
    providerCache.set(key, provider);
  }
  return provider;
}

function readContract(config) {
  return new ethers.Contract(config.neox.oracleContract, ORACLE_ABI, getProvider(config));
}

// Cached NonceManager-wrapped updater so concurrent fulfilments (the engine
// processes events with config.concurrency) get sequential nonces instead of
// colliding on the same pending nonce.
function updaterSigner(config) {
  const pk = trimString(config?.neox?.updaterPrivateKey || '');
  if (!pk) throw new Error('neox updater private key is not configured');
  const provider = getProvider(config);
  const key = `${pk}|${trimString(config?.neox?.rpcUrl || '')}`;
  let signer = signerCache.get(key);
  if (!signer) {
    signer = new ethers.NonceManager(new ethers.Wallet(pk, provider));
    signerCache.set(key, signer);
  }
  return signer;
}

function verifierWallet(config) {
  const pk =
    trimString(config?.neox?.verifierPrivateKey || '') ||
    trimString(config?.neox?.updaterPrivateKey || '');
  if (!pk) throw new Error('neox verifier private key is not configured');
  return new ethers.Wallet(pk);
}

export function hasNeoXRelayerConfig(config) {
  return Boolean(
    trimString(config?.neox?.rpcUrl || '') &&
    trimString(config?.neox?.oracleContract || '') &&
    trimString(config?.neox?.updaterPrivateKey || '')
  );
}

export async function getNeoXLatestBlock(config) {
  return getProvider(config).getBlockNumber();
}

export async function getNeoXLatestRequestId(config) {
  const total = await readContract(config).totalRequests();
  return Number(total);
}

function decodePayload(payloadHex) {
  try {
    return ethers.toUtf8String(payloadHex);
  } catch {
    return trimString(payloadHex || '');
  }
}

// The confidential decrypt lane receives its envelope wrapped by the miniapp
// callback contract as abi.encode(uint256 messageId, bytes envelope) — the same
// abi.encode(...) payload convention dice uses (abi.encode(face)). Recover the
// raw base64 envelope string so the decrypt fulfilment lane receives it verbatim;
// fall back to the generic utf8 decode if the payload isn't in that shape.
export function decodeConfidentialEnvelope(payloadHex) {
  try {
    const [, envelopeBytes] = ethers.AbiCoder.defaultAbiCoder().decode(
      ['uint256', 'bytes'],
      payloadHex
    );
    const decoded = ethers.toUtf8String(envelopeBytes);
    if (decoded) return decoded;
  } catch {
    // not abi.encode(uint256,bytes) — fall through to the generic decode
  }
  return decodePayload(payloadHex);
}

function isConfidentialDecryptOperation(operation) {
  const normalized = operation.toLowerCase();
  return normalized === 'decrypt' || normalized.includes('decrypt');
}

function buildNeoXEventFromRequest(record) {
  const requestId = record.id.toString();
  const operation = trimString(record.operation || '');
  if (!operation) return null;
  // Only surface still-pending requests; the engine + reconciliation dedupe the rest.
  if (Number(record.status) !== STATUS_PENDING) return null;
  return {
    chain: 'neox',
    requestId,
    // requestType drives resolveKernelIntent (e.g. 'random' -> random.generate).
    requestType: operation,
    appId: trimString(record.appId || ''),
    moduleId: trimString(record.moduleId || ''),
    operation,
    payloadText: isConfidentialDecryptOperation(operation)
      ? decodeConfidentialEnvelope(record.payload)
      : decodePayload(record.payload),
    requester: trimString(record.requester || ''),
    callbackContract:
      record.callbackContract && record.callbackContract !== ethers.ZeroAddress
        ? trimString(record.callbackContract)
        : '',
    callbackMethod: 'onOracleResult',
    blockNumber: Number(record.createdAt || 0),
    createdAtMs: Number(record.createdAt || 0) * 1000,
    txHash: '',
    logIndex: 0,
  };
}

export async function scanNeoXOracleRequestsById(
  config,
  fromRequestId,
  toRequestId,
  contract = null
) {
  const kernel = contract || readContract(config);
  const events = [];
  for (let id = fromRequestId; id <= toRequestId; id += 1) {
    let record;
    try {
      record = await kernel.getRequest(id);
    } catch (err) {
      // The EVM kernel's getRequest never reverts (missing ids return a zeroed
      // struct), so only a genuine CALL_EXCEPTION (decode failure) is safe to
      // skip. Transport/RPC failures must abort the tick so the request cursor
      // does not advance past an unscanned id (matches the Neo N3 adapter).
      if (err?.code === 'CALL_EXCEPTION') continue;
      throw err;
    }
    const event = buildNeoXEventFromRequest(record);
    if (event) events.push(event);
  }
  return events;
}

// Raw result bytes the EVM kernel stores + keccaks: the compact callback bytes
// (e.g. 32-byte VRF randomness) when present, otherwise the utf8 result string.
export function resolveResultBytesHex(result, resultBytesBase64) {
  const compact = trimString(resultBytesBase64 || '');
  if (compact) return `0x${Buffer.from(compact, 'base64').toString('hex')}`;
  const text = String(result || '');
  return `0x${Buffer.from(text, 'utf8').toString('hex')}`;
}

// keccak digest matching MorpheusOracleEVM.fulfillmentDigest (bound to chain+contract).
export function buildNeoXDigest(config, fulfillment, resultBytesHex) {
  const enc = ethers.AbiCoder.defaultAbiCoder().encode(
    [
      'string',
      'uint256',
      'address',
      'uint256',
      'bytes32',
      'bytes32',
      'bytes32',
      'bool',
      'bytes32',
      'bytes32',
    ],
    [
      FULFILLMENT_DOMAIN,
      BigInt(config.neox.chainId),
      ethers.getAddress(config.neox.oracleContract),
      BigInt(fulfillment.requestId),
      ethers.keccak256(ethers.toUtf8Bytes(trimString(fulfillment.appId || ''))),
      ethers.keccak256(ethers.toUtf8Bytes(trimString(fulfillment.moduleId || ''))),
      ethers.keccak256(ethers.toUtf8Bytes(trimString(fulfillment.operation || ''))),
      Boolean(fulfillment.success),
      ethers.keccak256(resultBytesHex),
      ethers.keccak256(ethers.toUtf8Bytes(trimString(fulfillment.error || ''))),
    ]
  );
  return ethers.keccak256(enc);
}

export async function signNeoXFulfillment(config, fulfillment) {
  const resultBytesHex = resolveResultBytesHex(fulfillment.result, fulfillment.result_bytes_base64);
  const digest = buildNeoXDigest(config, fulfillment, resultBytesHex);
  const wallet = verifierWallet(config);
  // EIP-191 personal-sign over the 32-byte digest (matches the kernel's
  // "\x19Ethereum Signed Message:\n32" + ecrecover == oracleVerifier check).
  const signature = await wallet.signMessage(ethers.getBytes(digest));
  return {
    signature,
    public_key: wallet.signingKey.publicKey,
    address: wallet.address,
    source: 'relayer_local_evm',
  };
}

// Map a Neo X kernel revert onto the relayer's error-classifier vocabulary
// (fulfillment.js classifyError / isAlreadyFulfilledError / isTerminalConfigurationError).
// ethers surfaces a decoded custom error as error.revert.name (when the error
// fragments are in the ABI); fall back to scanning the message text.
export function normalizeNeoXRevert(error) {
  const name = trimString(error?.revert?.name || error?.errorName || '');
  const reason = trimString(
    error?.shortMessage || error?.reason || error?.message || String(error)
  );
  const probe = `${name} ${reason}`.toLowerCase();
  if (probe.includes('requestnotpending')) return new Error('request already fulfilled');
  if (probe.includes('badsignature')) {
    return new Error('invalid signature: verifier rejected signature');
  }
  if (probe.includes('notupdater')) return new Error('unauthorized: updater not set');
  return error instanceof Error ? error : new Error(reason);
}

const DEFAULT_NEOX_CONFIRM_TIMEOUT_MS = 45_000;

export function getNeoXConfirmTimeoutMs(config) {
  const explicit = Number(config?.neox?.confirmTimeoutMs);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return DEFAULT_NEOX_CONFIRM_TIMEOUT_MS;
}

// Bound the receipt wait. ethers' tx.wait(1, timeout) rejects on its own once
// the timeout elapses, but the Promise.race deadline also covers a provider
// whose wait() never settles at all (dropped tx + dead subscription) — without
// it a single stuck submission would wedge the per-signer queue and, because
// the relayer awaits each tick, the whole relayer loop. The timeout message
// contains "timed out" so classifyError treats it as transient and the
// fulfillment is retried after signer.reset().
export async function waitForNeoXReceipt(tx, timeoutMs) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(`neox fulfillRequest confirmation timed out after ${timeoutMs}ms (${tx.hash})`)
        ),
      timeoutMs
    );
    timer.unref?.();
  });
  try {
    return await Promise.race([tx.wait(1, timeoutMs), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

export async function fulfillNeoXRequest(
  config,
  requestId,
  success,
  result,
  error,
  verificationSignature,
  resultBytesBase64 = ''
) {
  const resultBytesHex = resolveResultBytesHex(result, resultBytesBase64);
  const args = [
    BigInt(requestId),
    Boolean(success),
    resultBytesHex,
    String(error || ''),
    verificationSignature,
  ];
  // Serialize per signer: only one simulate→send→wait runs at a time so the
  // shared NonceManager produces sequential nonces and reset() is never racy.
  return runExclusive(signerKey(config), async () => {
    const signer = updaterSigner(config);
    const kernel = new ethers.Contract(config.neox.oracleContract, ORACLE_ABI, signer);
    // Estimate gas first: this also simulates (decodes custom errors like
    // RequestNotPending / BadSignature so they classify correctly, and avoids
    // burning gas on a tx that would revert). Then send with a generous buffer
    // so the kernel's nested onOracleResult callback (best-effort `.call`) is
    // never starved by the EVM 63/64 gas-forwarding rule — without the buffer a
    // cold-storage callback can run out of gas while the outer tx still succeeds,
    // leaving the consumer's state unsettled.
    let gasLimit;
    try {
      const estimate = await kernel.fulfillRequest.estimateGas(...args);
      gasLimit = estimate * 2n;
    } catch (simErr) {
      throw normalizeNeoXRevert(simErr);
    }
    try {
      const tx = await kernel.fulfillRequest(...args, { gasLimit });
      const receipt = await waitForNeoXReceipt(tx, getNeoXConfirmTimeoutMs(config));
      if (!receipt || receipt.status !== 1) {
        throw new Error(`neox fulfillRequest reverted on-chain (status ${receipt?.status})`);
      }
      return {
        request_id: `neox:fulfill:${requestId}`,
        tx_hash: tx.hash,
        vm_state: 'HALT',
        exception: null,
        target_chain: 'neox',
      };
    } catch (err) {
      // Re-sync the local nonce from chain so a failed/replaced tx doesn't wedge
      // subsequent fulfilments (safe here: submission is serialized per signer).
      try {
        signer.reset();
      } catch {
        /* ignore */
      }
      throw normalizeNeoXRevert(err);
    }
  });
}
