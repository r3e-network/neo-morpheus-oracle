import { JsonRpcProvider, Wallet as EvmWallet } from 'ethers';
import {
  DEFAULT_WAIT_TIMEOUT_MS,
  cappedDurationMs,
  env,
  normalizeBoolean,
  sha256Hex,
  stableStringify,
  trimString,
  validateRpcUrl,
} from '../platform/core.js';
import { resolveSigningBytes } from './signing.js';
import { deriveNeoXPrivateKeyHex, shouldUseDerivedKeys } from '../platform/dstack.js';

async function resolveNeoXPrivateKey(payload = {}, { required = false } = {}) {
  let privateKey = trimString(payload.private_key) || trimString(payload.signing_key);
  if (shouldUseDerivedKeys(payload)) {
    try {
      privateKey = `0x${await deriveNeoXPrivateKeyHex(trimString(payload.dstack_key_role || payload.key_role || 'worker') || 'worker')}`;
    } catch {
      // fall back to configured key material if derivation is unavailable
    }
  }
  if (!privateKey) {
    privateKey = env(
      'PHALA_NEOX_PRIVATE_KEY',
      'NEO_X_PRIVATE_KEY',
      'NEOX_PRIVATE_KEY',
      'EVM_PRIVATE_KEY'
    );
  }
  if (!privateKey) {
    if (required) throw new Error('Neo X signing key is not configured');
    return null;
  }
  return /^[0-9a-fA-F]{64}$/.test(privateKey) ? `0x${privateKey}` : privateKey;
}

export async function loadNeoXContext(payload = {}, { required = false, requireRpc = false } = {}) {
  const privateKey = await resolveNeoXPrivateKey(payload, { required });
  if (!privateKey) return null;

  const rpcUrl = validateRpcUrl(trimString(payload.rpc_url) || env('NEOX_RPC_URL', 'EVM_RPC_URL'));
  if (requireRpc && !rpcUrl) throw new Error('NEOX_RPC_URL is required for Neo X relay');

  const provider = rpcUrl ? new JsonRpcProvider(rpcUrl) : null;
  const wallet = provider ? new EvmWallet(privateKey, provider) : new EvmWallet(privateKey);
  const chainIdRaw =
    payload.chain_id ?? payload.chainId ?? env('NEO_X_CHAIN_ID', 'NEOX_CHAIN_ID', 'EVM_CHAIN_ID');
  const chainId = chainIdRaw !== undefined && chainIdRaw !== '' ? Number(chainIdRaw) : undefined;
  return { wallet, provider, rpcUrl, chainId };
}

export function normalizeBigIntLike(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.trunc(value));
  return BigInt(String(value));
}

export function normalizeEvmTransaction(payload) {
  const txPayload =
    payload.transaction && typeof payload.transaction === 'object' ? payload.transaction : payload;
  const transaction = {
    to: trimString(txPayload.to),
    data: trimString(txPayload.data || txPayload.calldata || txPayload.call_data || '0x') || '0x',
    value: normalizeBigIntLike(txPayload.value),
    nonce: txPayload.nonce !== undefined ? Number(txPayload.nonce) : undefined,
    chainId:
      txPayload.chain_id !== undefined
        ? Number(txPayload.chain_id)
        : txPayload.chainId !== undefined
          ? Number(txPayload.chainId)
          : undefined,
    type: txPayload.type !== undefined ? Number(txPayload.type) : undefined,
    gasLimit: normalizeBigIntLike(txPayload.gas_limit ?? txPayload.gasLimit),
    gasPrice: normalizeBigIntLike(txPayload.gas_price ?? txPayload.gasPrice),
    maxFeePerGas: normalizeBigIntLike(txPayload.max_fee_per_gas ?? txPayload.maxFeePerGas),
    maxPriorityFeePerGas: normalizeBigIntLike(
      txPayload.max_priority_fee_per_gas ?? txPayload.maxPriorityFeePerGas
    ),
  };
  if (!transaction.to) throw new Error('Neo X transaction requires to');
  return transaction;
}

export async function relayNeoXTransaction(payload) {
  // C-04: Restrict relay targets unless explicitly unrestricted
  const unrestricted = normalizeBoolean(env('NEOX_RELAY_UNRESTRICTED'), false);
  if (
    !unrestricted &&
    !payload.raw_transaction &&
    !payload.raw_tx &&
    !payload.signed_tx &&
    !payload.tx_hex
  ) {
    // Only restrict when we're constructing the tx (not raw relay)
    const txReq =
      payload.transaction && typeof payload.transaction === 'object'
        ? payload.transaction
        : payload;
    const toAddr = trimString(txReq.to).toLowerCase();
    const value = normalizeBigIntLike(txReq.value);

    // Value cap — default 0 (no value transfer)
    const maxValue = BigInt(env('NEOX_MAX_RELAY_VALUE') || '0');
    if (value && value > maxValue) {
      throw new Error(
        `Neo X relay: value (${value}) exceeds cap (${maxValue}); set NEOX_MAX_RELAY_VALUE to increase`
      );
    }

    // Receiver allowlist
    const allowedReceivers = env('NEOX_RELAY_ALLOWED_RECEIVERS');
    if (allowedReceivers) {
      const allowSet = new Set(
        allowedReceivers
          .split(',')
          .map((s) => trimString(s).toLowerCase())
          .filter(Boolean)
      );
      if (allowSet.size > 0 && !allowSet.has(toAddr)) {
        throw new Error(`Neo X relay: to address not in NEOX_RELAY_ALLOWED_RECEIVERS`);
      }
    }
  }

  const context = await loadNeoXContext(payload, {
    required: true,
    requireRpc: payload.broadcast !== false || !!payload.raw_transaction,
  });
  let rawTransaction = trimString(
    payload.raw_transaction || payload.raw_tx || payload.signed_tx || payload.tx_hex
  );
  if (rawTransaction && !rawTransaction.startsWith('0x'))
    rawTransaction = `0x${rawTransaction.replace(/^0x/i, '')}`;

  let transactionRequest;
  if (!rawTransaction) {
    transactionRequest = normalizeEvmTransaction(payload);
    if (!transactionRequest.chainId && context.chainId)
      transactionRequest.chainId = context.chainId;
    const prepared = context.provider
      ? await context.wallet.populateTransaction(transactionRequest)
      : transactionRequest;
    rawTransaction = await context.wallet.signTransaction(prepared);
  }

  if (payload.broadcast === false) {
    return {
      target_chain: 'neo_x',
      address: context.wallet.address,
      raw_transaction: rawTransaction,
    };
  }

  if (!context.provider) throw new Error('Neo X RPC provider is required for relay');
  const txHash = await context.provider.send('eth_sendRawTransaction', [rawTransaction]);
  let receipt;
  if (payload.wait) {
    receipt = await context.provider.waitForTransaction(
      txHash,
      Number(payload.confirmations) || 1,
      cappedDurationMs(payload.timeout_ms, DEFAULT_WAIT_TIMEOUT_MS, 120_000)
    );
  }
  return {
    target_chain: 'neo_x',
    address: context.wallet.address,
    tx_hash: txHash,
    raw_transaction: rawTransaction,
    receipt,
  };
}

export async function handleSignPayloadNeoX(payload) {
  const context = await loadNeoXContext(payload, { required: true, requireRpc: false });
  if (payload.typed_data && typeof payload.typed_data === 'object') {
    const typedData = payload.typed_data;
    const signature = await context.wallet.signTypedData(
      typedData.domain || {},
      typedData.types || {},
      typedData.value || {}
    );
    return {
      target_chain: 'neo_x',
      signature,
      address: context.wallet.address,
      mode: 'typed_data',
      payload_hash: sha256Hex(stableStringify(typedData)),
    };
  }

  if (payload.transaction && typeof payload.transaction === 'object') {
    const signedTransaction = await context.wallet.signTransaction(
      normalizeEvmTransaction(payload)
    );
    return {
      target_chain: 'neo_x',
      address: context.wallet.address,
      mode: 'transaction',
      raw_transaction: signedTransaction,
      payload_hash: sha256Hex(signedTransaction),
    };
  }

  const { bytes, source } = resolveSigningBytes(payload);
  const signature = await context.wallet.signMessage(bytes);
  return {
    target_chain: 'neo_x',
    source,
    payload_hash: sha256Hex(bytes),
    signature,
    address: context.wallet.address,
    mode: 'message',
  };
}
