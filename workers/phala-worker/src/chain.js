import { randomUUID } from "crypto";
import { experimental, rpc as neoRpc, sc, tx, u, wallet as neoWallet } from "@cityofzion/neon-js";
import { JsonRpcProvider, Wallet as EvmWallet } from "ethers";
import {
  DEFAULT_NEO_NETWORK_MAGIC,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_WAIT_TIMEOUT_MS,
  REPLAY_WINDOW_MS,
  env,
  isHexString,
  json,
  normalizeTargetChain,
  sha256Hex,
  sleep,
  stableStringify,
  strip0x,
  trimString,
} from "./core.js";

const seenRequestIds = new Map();

export function pruneSeenRequestIds() {
  const cutoff = Date.now() - REPLAY_WINDOW_MS;
  for (const [requestId, createdAt] of seenRequestIds.entries()) {
    if (createdAt < cutoff) seenRequestIds.delete(requestId);
  }
}

export function rememberRequestId(requestId) {
  pruneSeenRequestIds();
  if (seenRequestIds.has(requestId)) return false;
  seenRequestIds.set(requestId, Date.now());
  return true;
}

export function forgetRequestId(requestId) {
  if (requestId) seenRequestIds.delete(requestId);
}

export function resolveSigningBytes(payload) {
  if (trimString(payload.data_hex)) {
    return { bytes: Buffer.from(strip0x(payload.data_hex), "hex"), source: "data_hex" };
  }
  if (trimString(payload.data_base64)) {
    return { bytes: Buffer.from(payload.data_base64, "base64"), source: "data_base64" };
  }
  if (typeof payload.message === "string") {
    return { bytes: Buffer.from(payload.message, "utf8"), source: "message" };
  }
  if (typeof payload.data === "string") {
    return { bytes: Buffer.from(payload.data, "utf8"), source: "data:string" };
  }
  if (payload.data !== undefined) {
    return { bytes: Buffer.from(stableStringify(payload.data), "utf8"), source: "data:json" };
  }
  throw new Error("one of data, message, data_hex, or data_base64 is required");
}

export function normalizeNeoHash160(value) {
  const raw = trimString(value);
  if (!raw) return "";
  if (neoWallet.isAddress(raw)) {
    return `0x${neoWallet.getScriptHashFromAddress(raw).toLowerCase()}`;
  }
  const hex = strip0x(raw).toLowerCase();
  if (/^[0-9a-f]{40}$/.test(hex)) return `0x${hex}`;
  return "";
}

export function isConfiguredHash160(value) {
  return /^0x[0-9a-f]{40}$/.test(value) && !/^0x0{40}$/.test(value);
}

export function normalizeContractHash(value) {
  const normalized = normalizeNeoHash160(value);
  if (!normalized) throw new Error(`invalid contract hash: ${value}`);
  return normalized;
}

export function canonicalizeMethodName(method) {
  const trimmed = trimString(method);
  if (!trimmed) return "";
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

export function createByteArrayParam(value) {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array || value instanceof ArrayBuffer) {
    return sc.ContractParam.byteArray(u.HexString.fromHex(Buffer.from(value).toString("hex")));
  }
  const raw = trimString(value);
  if (!raw) return sc.ContractParam.byteArray(u.HexString.fromHex(""));
  if (isHexString(raw)) {
    return sc.ContractParam.byteArray(u.HexString.fromHex(strip0x(raw)));
  }
  return sc.ContractParam.byteArray(raw);
}

export function toNeoContractParam(param) {
  if (!param || typeof param !== "object") throw new Error("invalid Neo contract param");
  const type = trimString(param.type).toLowerCase();
  switch (type) {
    case "string":
      return sc.ContractParam.string(String(param.value ?? ""));
    case "integer":
      return sc.ContractParam.integer(String(param.value ?? "0"));
    case "boolean":
      return sc.ContractParam.boolean(Boolean(param.value));
    case "bytearray":
      return createByteArrayParam(param.value);
    case "hash160":
      return sc.ContractParam.hash160(String(param.value ?? ""));
    case "hash256":
      return sc.ContractParam.hash256(String(param.value ?? ""));
    case "publickey":
      return sc.ContractParam.publicKey(String(param.value ?? ""));
    case "any":
      return sc.ContractParam.any(param.value ?? null);
    case "array": {
      if (!Array.isArray(param.value)) throw new Error("Array param requires array value");
      return sc.ContractParam.array(...param.value.map((item) => toNeoContractParam(item).toJson()));
    }
    default:
      throw new Error(`unsupported Neo contract param type: ${param.type}`);
  }
}

export function parseTxProxyAllowlist(raw) {
  const out = new Map();
  const text = trimString(raw);
  if (!text) return out;
  const parsed = JSON.parse(text);
  const contracts = parsed && typeof parsed === "object" ? parsed.contracts : null;
  if (!contracts || typeof contracts !== "object") return out;

  for (const [contract, methods] of Object.entries(contracts)) {
    const normalized = normalizeNeoHash160(contract);
    if (!normalized) continue;
    const entry = { allowAll: false, methods: new Set() };
    if (Array.isArray(methods)) {
      for (const method of methods) {
        const canonical = trimString(method);
        if (!canonical) continue;
        if (canonical === "*") {
          entry.allowAll = true;
          continue;
        }
        entry.methods.add(canonicalizeMethodName(canonical));
      }
    }
    out.set(normalized, entry);
  }
  return out;
}

export function addAllow(allowlist, contractHash, ...methods) {
  const normalized = normalizeNeoHash160(contractHash);
  if (!normalized || !isConfiguredHash160(normalized)) return;
  const current = allowlist.get(normalized) || { allowAll: false, methods: new Set() };
  for (const method of methods) {
    const canonical = trimString(method);
    if (!canonical) continue;
    if (canonical === "*") {
      current.allowAll = true;
      continue;
    }
    current.methods.add(canonicalizeMethodName(canonical));
  }
  allowlist.set(normalized, current);
}

export function buildTxProxyAllowlist() {
  const allowlist = parseTxProxyAllowlist(env("TXPROXY_ALLOWLIST"));
  addAllow(allowlist, env("CONTRACT_MORPHEUS_DATAFEED_HASH", "CONTRACT_PRICEFEED_HASH"), "updateFeed", "update");
  addAllow(allowlist, env("CONTRACT_RANDOMNESSLOG_HASH"), "record");
  addAllow(allowlist, env("CONTRACT_AUTOMATIONANCHOR_HASH"), "markExecuted");
  addAllow(allowlist, env("CONTRACT_MORPHEUS_ORACLE_HASH"), "fulfillRequest");
  addAllow(allowlist, env("CONTRACT_PAYMENTHUB_HASH"), "pay");
  addAllow(allowlist, env("CONTRACT_GOVERNANCE_HASH"), "stake", "unstake", "vote");
  addAllow(allowlist, env("CONTRACT_GAS_HASH") || "0xd2a4cff31913016155e38e474a2c06d08be276cf", "transfer");
  return allowlist;
}

export function allowlistAllows(contractHash, method) {
  const allowlist = buildTxProxyAllowlist();
  const entry = allowlist.get(normalizeContractHash(contractHash));
  if (!entry) return false;
  if (entry.allowAll) return true;
  return entry.methods.has(canonicalizeMethodName(method));
}

export function transferTargetsPaymentHub(params, paymentHubHash) {
  if (!Array.isArray(params) || params.length < 2) return false;
  const target = params[1];
  if (!target || trimString(target.type).toLowerCase() !== "hash160") return false;
  return normalizeNeoHash160(target.value) === normalizeNeoHash160(paymentHubHash);
}

export function checkNeoIntentPolicy(payload) {
  const intent = trimString(payload.intent).toLowerCase();
  if (!intent) return null;

  const contractHash = normalizeContractHash(payload.contract_hash);
  const method = canonicalizeMethodName(payload.method);
  const gasHash = normalizeNeoHash160(env("CONTRACT_GAS_HASH") || "0xd2a4cff31913016155e38e474a2c06d08be276cf");
  const paymentHubHash = normalizeNeoHash160(env("CONTRACT_PAYMENTHUB_HASH"));
  const governanceHash = normalizeNeoHash160(env("CONTRACT_GOVERNANCE_HASH"));

  switch (intent) {
    case "gas-sponsor":
    case "gas_sponsor":
      if (contractHash !== gasHash || method !== "transfer") {
        return { status: 403, error: "gas-sponsor intent only allows GAS transfer" };
      }
      return null;
    case "payments":
    case "payment":
      if (contractHash !== gasHash || method !== "transfer") {
        return { status: 403, error: "payments intent only allows GAS transfer" };
      }
      if (!paymentHubHash) {
        return { status: 503, error: "payments intent requires CONTRACT_PAYMENTHUB_HASH" };
      }
      if (!transferTargetsPaymentHub(payload.params, paymentHubHash)) {
        return { status: 403, error: "payments intent only allows GAS transfer to PaymentHub" };
      }
      return null;
    case "governance":
      if (!governanceHash) {
        return { status: 503, error: "governance intent requires CONTRACT_GOVERNANCE_HASH" };
      }
      if (contractHash !== governanceHash) {
        return { status: 403, error: "governance intent requires Governance contract" };
      }
      if (!["stake", "unstake", "vote"].includes(method)) {
        return { status: 403, error: "governance intent only allows stake/unstake/vote" };
      }
      return null;
    default:
      return { status: 400, error: `unknown intent: ${payload.intent}` };
  }
}

export function getNeoSigners(account, scope = "CalledByEntry") {
  return [{ account: account.scriptHash, scopes: trimString(scope) || "CalledByEntry" }];
}

export function normalizeNeoRawTransaction(rawTransaction) {
  const raw = trimString(rawTransaction);
  if (!raw) throw new Error("raw transaction required");
  if (isHexString(raw)) {
    return u.HexString.fromHex(strip0x(raw)).toBase64();
  }
  return raw;
}

export async function waitForNeoApplicationLog(rpcClient, txHash, timeoutMs = DEFAULT_WAIT_TIMEOUT_MS, pollIntervalMs = DEFAULT_POLL_INTERVAL_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      return await rpcClient.getApplicationLog(txHash);
    } catch {
      await sleep(pollIntervalMs);
    }
  }
  throw new Error(`timed out waiting for Neo application log: ${txHash}`);
}

export function getNeoExecutionSummary(appLog) {
  const execution = appLog?.executions?.[0];
  return {
    vmState: execution?.vmstate || execution?.VMState || null,
    exception: execution?.exception || execution?.Exception || null,
  };
}

export function loadNeoN3Context(payload = {}, { required = false, requireRpc = false } = {}) {
  const key =
    trimString(payload.private_key) ||
    trimString(payload.signing_key) ||
    trimString(payload.wif) ||
    env("PHALA_NEO_N3_PRIVATE_KEY", "PHALA_NEO_N3_WIF", "NEO_PLATFORM_KEY", "TEE_PRIVATE_KEY", "NEO_TESTNET_WIF");

  if (!key) {
    if (required) throw new Error("Neo N3 signing key is not configured");
    return null;
  }

  const rpcUrl = trimString(payload.rpc_url) || env("NEO_RPC_URL");
  if (requireRpc && !rpcUrl) throw new Error("NEO_RPC_URL is required for Neo N3 relay");

  const networkMagic = Number(payload.network_magic || env("NEO_NETWORK_MAGIC") || DEFAULT_NEO_NETWORK_MAGIC);
  return {
    account: new neoWallet.Account(key),
    rpcUrl,
    networkMagic: Number.isFinite(networkMagic) ? networkMagic : DEFAULT_NEO_NETWORK_MAGIC,
  };
}

export function loadNeoXContext(payload = {}, { required = false, requireRpc = false } = {}) {
  let privateKey =
    trimString(payload.private_key) ||
    trimString(payload.signing_key) ||
    env("PHALA_NEOX_PRIVATE_KEY", "NEO_X_PRIVATE_KEY", "NEOX_PRIVATE_KEY", "EVM_PRIVATE_KEY");

  if (!privateKey) {
    if (required) throw new Error("Neo X signing key is not configured");
    return null;
  }

  const rpcUrl = trimString(payload.rpc_url) || env("NEO_X_RPC_URL", "NEOX_RPC_URL", "EVM_RPC_URL");
  if (requireRpc && !rpcUrl) throw new Error("NEO_X_RPC_URL is required for Neo X relay");

  if (/^[0-9a-fA-F]{64}$/.test(privateKey)) {
    privateKey = `0x${privateKey}`;
  }

  const provider = rpcUrl ? new JsonRpcProvider(rpcUrl) : null;
  const wallet = provider ? new EvmWallet(privateKey, provider) : new EvmWallet(privateKey);
  const chainIdRaw = payload.chain_id ?? payload.chainId ?? env("NEO_X_CHAIN_ID", "NEOX_CHAIN_ID", "EVM_CHAIN_ID");
  const chainId = chainIdRaw !== undefined && chainIdRaw !== "" ? Number(chainIdRaw) : undefined;

  return { wallet, provider, rpcUrl, chainId };
}

export function maybeSignNeoN3Bytes(bytes) {
  const context = loadNeoN3Context({}, { required: false, requireRpc: false });
  if (!context) return null;

  const payloadBuffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return {
    signature: neoWallet.sign(payloadBuffer.toString("hex"), context.account.privateKey),
    public_key: context.account.publicKey,
    address: context.account.address,
    script_hash: `0x${context.account.scriptHash}`,
  };
}

export function buildSignedResultEnvelope(result) {
  const payloadBytes = Buffer.from(stableStringify(result), "utf8");
  const outputHash = sha256Hex(payloadBytes);
  const signature = maybeSignNeoN3Bytes(payloadBytes);
  return {
    output_hash: outputHash,
    attestation_hash: outputHash,
    signature: signature?.signature || null,
    public_key: signature?.public_key || null,
    signer_address: signature?.address || null,
    signer_script_hash: signature?.script_hash || null,
  };
}

export async function relayNeoN3Invocation(payload) {
  const requestId = trimString(payload.request_id || payload.requestId) || `txproxy:${randomUUID()}`;
  const contractHash = normalizeContractHash(payload.contract_hash);
  const method = canonicalizeMethodName(payload.method);
  if (!method) throw new Error("method required");
  if (!allowlistAllows(contractHash, method)) {
    return { status: 403, body: { error: "contract/method not allowed" } };
  }

  const intentError = checkNeoIntentPolicy({ ...payload, contract_hash: contractHash, method });
  if (intentError) {
    return { status: intentError.status, body: { error: intentError.error } };
  }

  if (!rememberRequestId(requestId)) {
    return { status: 409, body: { error: "request_id already used", request_id: requestId } };
  }

  try {
    const context = loadNeoN3Context(payload, { required: true, requireRpc: true });
    const params = Array.isArray(payload.params) ? payload.params.map((param) => toNeoContractParam(param)) : [];
    const rpcClient = new neoRpc.RPCClient(context.rpcUrl);
    const contract = new experimental.SmartContract(contractHash, {
      rpcAddress: context.rpcUrl,
      networkMagic: context.networkMagic,
      account: context.account,
    });
    const signers = getNeoSigners(context.account, payload.signer_scope || payload.scope || "CalledByEntry");
    const simulation = await contract.testInvoke(method, params, signers);
    if (String(simulation?.state || "") === "FAULT") {
      forgetRequestId(requestId);
      return {
        status: 400,
        body: {
          request_id: requestId,
          error: simulation?.exception || "Neo invocation simulation failed",
          vm_state: simulation?.state || "FAULT",
        },
      };
    }

    const txHashRaw = await contract.invoke(method, params, signers);
    const txHash = trimString(txHashRaw).startsWith("0x") ? trimString(txHashRaw) : `0x${trimString(txHashRaw)}`;

    let vmState = simulation?.state || "HALT";
    let exception = simulation?.exception || undefined;
    let appLog;
    if (payload.wait) {
      appLog = await waitForNeoApplicationLog(
        rpcClient,
        txHash,
        Number(payload.timeout_ms) || DEFAULT_WAIT_TIMEOUT_MS,
        Number(payload.poll_interval_ms) || DEFAULT_POLL_INTERVAL_MS,
      );
      const summary = getNeoExecutionSummary(appLog);
      vmState = summary.vmState || vmState;
      exception = summary.exception || exception;
    }

    return {
      status: 200,
      body: {
        request_id: requestId,
        tx_hash: txHash,
        vm_state: vmState,
        exception,
        app_log: appLog,
      },
    };
  } catch (error) {
    forgetRequestId(requestId);
    return {
      status: 400,
      body: { request_id: requestId, error: error instanceof Error ? error.message : String(error) },
    };
  }
}

export async function sponsorNeoN3Transaction(payload) {
  const context = loadNeoN3Context(payload, { required: true, requireRpc: false });
  const txBase64 = trimString(payload.tx_base64 || payload.txBase64);
  const userAddress = trimString(payload.user_address || payload.userAddress);
  if (!txBase64 || !userAddress) {
    throw new Error("tx_base64 and user_address are required for Neo N3 sponsorship relay");
  }

  const sponsorAccount = context.account;
  const transaction = tx.Transaction.deserialize(txBase64);
  const hasUserSigner = transaction.signers.some((signer) => neoWallet.getAddressFromScriptHash(String(signer.account)) === userAddress);
  if (!hasUserSigner) {
    throw new Error("transaction does not belong to the supplied user_address");
  }

  const sponsorScriptHash = sponsorAccount.scriptHash;
  const hasSponsorSigner = transaction.signers.some((signer) => String(signer.account) === sponsorScriptHash);
  if (!hasSponsorSigner) {
    transaction.signers.push(new tx.Signer({ account: sponsorAccount.scriptHash, scopes: tx.WitnessScope.None }));
  }

  const feePerByte = Number(payload.fee_per_byte || payload.feePerByte || 1000);
  const priorityFee = Number(payload.priority_fee || payload.priorityFee || 100000);
  const dummySignatures = transaction.signers.map((signer) => {
    if (String(signer.account) === sponsorAccount.scriptHash) {
      return new tx.Witness({
        invocationScript: "0c40" + "00".repeat(64),
        verificationScript: "21" + sponsorAccount.publicKey + "ac",
      });
    }
    return new tx.Witness({ invocationScript: "", verificationScript: "" });
  });

  const size = transaction.serialize().length / 2 + dummySignatures.reduce((sum, witness) => sum + witness.serialize().length / 2, 0);
  const calculatedFee = (size * feePerByte) + priorityFee;
  transaction.networkFee = u.BigInteger.fromNumber(Math.floor(calculatedFee));
  transaction.sign(sponsorAccount, context.networkMagic);

  const sponsoredTx = transaction.serialize(true);
  const result = {
    target_chain: "neo_n3",
    sponsor_address: sponsorAccount.address,
    sponsor_public_key: sponsorAccount.publicKey,
    network_fee: transaction.networkFee.toString(),
    sponsored_tx_base64: sponsoredTx,
    witnesses: transaction.witnesses.map((witness) => witness.serialize()),
  };

  if (!payload.broadcast) {
    return result;
  }

  if (!context.rpcUrl) {
    throw new Error("NEO_RPC_URL is required to broadcast sponsored Neo N3 transactions");
  }

  const rpcClient = new neoRpc.RPCClient(context.rpcUrl);
  const txHashRaw = await rpcClient.sendRawTransaction(normalizeNeoRawTransaction(sponsoredTx));
  const txHash = trimString(txHashRaw).startsWith("0x") ? trimString(txHashRaw) : `0x${trimString(txHashRaw)}`;
  let appLog;
  if (payload.wait) {
    appLog = await waitForNeoApplicationLog(
      rpcClient,
      txHash,
      Number(payload.timeout_ms) || DEFAULT_WAIT_TIMEOUT_MS,
      Number(payload.poll_interval_ms) || DEFAULT_POLL_INTERVAL_MS,
    );
  }

  return { ...result, tx_hash: txHash, app_log: appLog };
}

export async function broadcastNeoN3RawTransaction(payload) {
  const context = loadNeoN3Context(payload, { required: false, requireRpc: true });
  const rpcClient = new neoRpc.RPCClient(context.rpcUrl);
  const txHashRaw = await rpcClient.sendRawTransaction(normalizeNeoRawTransaction(
    payload.raw_transaction || payload.raw_tx || payload.signed_tx || payload.tx_base64 || payload.tx_hex,
  ));
  const txHash = trimString(txHashRaw).startsWith("0x") ? trimString(txHashRaw) : `0x${trimString(txHashRaw)}`;

  let appLog;
  if (payload.wait) {
    appLog = await waitForNeoApplicationLog(
      rpcClient,
      txHash,
      Number(payload.timeout_ms) || DEFAULT_WAIT_TIMEOUT_MS,
      Number(payload.poll_interval_ms) || DEFAULT_POLL_INTERVAL_MS,
    );
  }

  return { target_chain: "neo_n3", tx_hash: txHash, app_log: appLog };
}

export function normalizeBigIntLike(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  return BigInt(String(value));
}

export function normalizeEvmTransaction(payload) {
  const txPayload = payload.transaction && typeof payload.transaction === "object" ? payload.transaction : payload;
  const transaction = {
    to: trimString(txPayload.to),
    data: trimString(txPayload.data || txPayload.calldata || txPayload.call_data || "0x") || "0x",
    value: normalizeBigIntLike(txPayload.value),
    nonce: txPayload.nonce !== undefined ? Number(txPayload.nonce) : undefined,
    chainId: txPayload.chain_id !== undefined ? Number(txPayload.chain_id) : (txPayload.chainId !== undefined ? Number(txPayload.chainId) : undefined),
    type: txPayload.type !== undefined ? Number(txPayload.type) : undefined,
    gasLimit: normalizeBigIntLike(txPayload.gas_limit ?? txPayload.gasLimit),
    gasPrice: normalizeBigIntLike(txPayload.gas_price ?? txPayload.gasPrice),
    maxFeePerGas: normalizeBigIntLike(txPayload.max_fee_per_gas ?? txPayload.maxFeePerGas),
    maxPriorityFeePerGas: normalizeBigIntLike(txPayload.max_priority_fee_per_gas ?? txPayload.maxPriorityFeePerGas),
  };

  if (!transaction.to) throw new Error("Neo X transaction requires to");
  return transaction;
}

export async function relayNeoXTransaction(payload) {
  const context = loadNeoXContext(payload, { required: true, requireRpc: payload.broadcast !== false || !!payload.raw_transaction });
  let rawTransaction = trimString(payload.raw_transaction || payload.raw_tx || payload.signed_tx || payload.tx_hex);
  if (rawTransaction && !rawTransaction.startsWith("0x")) {
    rawTransaction = `0x${strip0x(rawTransaction)}`;
  }

  let transactionRequest;
  if (!rawTransaction) {
    transactionRequest = normalizeEvmTransaction(payload);
    if (!transactionRequest.chainId && context.chainId) {
      transactionRequest.chainId = context.chainId;
    }
    rawTransaction = await context.wallet.signTransaction(transactionRequest);
  }

  if (payload.broadcast === false) {
    return { target_chain: "neo_x", address: context.wallet.address, raw_transaction: rawTransaction };
  }

  if (!context.provider) throw new Error("Neo X RPC provider is required for relay");
  const txHash = await context.provider.send("eth_sendRawTransaction", [rawTransaction]);
  let receipt;
  if (payload.wait) {
    receipt = await context.provider.waitForTransaction(txHash, Number(payload.confirmations) || 1, Number(payload.timeout_ms) || DEFAULT_WAIT_TIMEOUT_MS);
  }

  return { target_chain: "neo_x", address: context.wallet.address, tx_hash: txHash, raw_transaction: rawTransaction, receipt };
}

export async function handleSignPayload(payload) {
  const targetChain = normalizeTargetChain(payload.target_chain);
  if (targetChain === "neo_n3") {
    const context = loadNeoN3Context(payload, { required: true, requireRpc: false });
    const { bytes, source } = resolveSigningBytes(payload);
    const signature = neoWallet.sign(bytes.toString("hex"), context.account.privateKey);
    return json(200, {
      target_chain: "neo_n3",
      source,
      payload_hash: sha256Hex(bytes),
      signature,
      public_key: context.account.publicKey,
      address: context.account.address,
      script_hash: `0x${context.account.scriptHash}`,
    });
  }

  const context = loadNeoXContext(payload, { required: true, requireRpc: false });
  if (payload.typed_data && typeof payload.typed_data === "object") {
    const typedData = payload.typed_data;
    const signature = await context.wallet.signTypedData(typedData.domain || {}, typedData.types || {}, typedData.value || {});
    return json(200, {
      target_chain: "neo_x",
      signature,
      address: context.wallet.address,
      mode: "typed_data",
      payload_hash: sha256Hex(stableStringify(typedData)),
    });
  }

  if (payload.transaction && typeof payload.transaction === "object") {
    const signedTransaction = await context.wallet.signTransaction(normalizeEvmTransaction(payload));
    return json(200, {
      target_chain: "neo_x",
      address: context.wallet.address,
      mode: "transaction",
      raw_transaction: signedTransaction,
      payload_hash: sha256Hex(signedTransaction),
    });
  }

  const { bytes, source } = resolveSigningBytes(payload);
  const signature = await context.wallet.signMessage(bytes);
  return json(200, {
    target_chain: "neo_x",
    source,
    payload_hash: sha256Hex(bytes),
    signature,
    address: context.wallet.address,
    mode: "message",
  });
}

export async function handleRelayTransaction(payload) {
  const targetChain = normalizeTargetChain(payload.target_chain);
  if (targetChain === "neo_x") {
    return json(200, await relayNeoXTransaction(payload));
  }

  if ((payload.tx_base64 || payload.txBase64) && (payload.user_address || payload.userAddress)) {
    return json(200, await sponsorNeoN3Transaction(payload));
  }

  if (payload.raw_transaction || payload.raw_tx || payload.signed_tx || payload.tx_base64 || payload.tx_hex) {
    return json(200, await broadcastNeoN3RawTransaction(payload));
  }

  const invokeResult = await relayNeoN3Invocation(payload);
  return json(invokeResult.status, invokeResult.body);
}

export async function handleTxProxyInvoke(payload) {
  const invokeResult = await relayNeoN3Invocation(payload);
  return json(invokeResult.status, invokeResult.body);
}
