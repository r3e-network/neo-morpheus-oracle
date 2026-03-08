import { randomUUID } from "crypto";
import { experimental, rpc as neoRpc, tx, u, wallet as neoWallet } from "@cityofzion/neon-js";
import { DEFAULT_NEO_NETWORK_MAGIC, DEFAULT_POLL_INTERVAL_MS, DEFAULT_WAIT_TIMEOUT_MS, trimString } from "./core.js";
import {
  allowlistAllows,
  canonicalizeMethodName,
  checkNeoIntentPolicy,
  normalizeContractHash,
  toNeoContractParam,
} from "./allowlist.js";
import { forgetRequestId, rememberRequestId } from "./signing.js";
import { sleep } from "./core.js";
import { env } from "./core.js";

export function getNeoSigners(account, scope = "CalledByEntry") {
  return [{ account: account.scriptHash, scopes: trimString(scope) || "CalledByEntry" }];
}

export function normalizeNeoRawTransaction(rawTransaction) {
  const raw = trimString(rawTransaction);
  if (!raw) throw new Error("raw transaction required");
  if (/^(0x)?[0-9a-fA-F]+$/.test(raw) && raw.replace(/^0x/i, "").length % 2 === 0) {
    return u.HexString.fromHex(raw.replace(/^0x/i, "")).toBase64();
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
      return { status: 400, body: { request_id: requestId, error: simulation?.exception || "Neo invocation simulation failed", vm_state: simulation?.state || "FAULT" } };
    }

    const txHashRaw = await contract.invoke(method, params, signers);
    const txHash = trimString(txHashRaw).startsWith("0x") ? trimString(txHashRaw) : `0x${trimString(txHashRaw)}`;
    let vmState = simulation?.state || "HALT";
    let exception = simulation?.exception || undefined;
    let appLog;
    if (payload.wait) {
      appLog = await waitForNeoApplicationLog(rpcClient, txHash, Number(payload.timeout_ms) || DEFAULT_WAIT_TIMEOUT_MS, Number(payload.poll_interval_ms) || DEFAULT_POLL_INTERVAL_MS);
      const summary = getNeoExecutionSummary(appLog);
      vmState = summary.vmState || vmState;
      exception = summary.exception || exception;
    }

    return { status: 200, body: { request_id: requestId, tx_hash: txHash, vm_state: vmState, exception, app_log: appLog } };
  } catch (error) {
    forgetRequestId(requestId);
    return { status: 400, body: { request_id: requestId, error: error instanceof Error ? error.message : String(error) } };
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
  if (!hasUserSigner) throw new Error("transaction does not belong to the supplied user_address");

  const sponsorScriptHash = sponsorAccount.scriptHash;
  const hasSponsorSigner = transaction.signers.some((signer) => String(signer.account) === sponsorScriptHash);
  if (!hasSponsorSigner) {
    transaction.signers.push(new tx.Signer({ account: sponsorAccount.scriptHash, scopes: tx.WitnessScope.None }));
  }

  const feePerByte = Number(payload.fee_per_byte || payload.feePerByte || 1000);
  const priorityFee = Number(payload.priority_fee || payload.priorityFee || 100000);
  const dummySignatures = transaction.signers.map((signer) => {
    if (String(signer.account) === sponsorAccount.scriptHash) {
      return new tx.Witness({ invocationScript: "0c40" + "00".repeat(64), verificationScript: "21" + sponsorAccount.publicKey + "ac" });
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

  if (!payload.broadcast) return result;
  if (!context.rpcUrl) throw new Error("NEO_RPC_URL is required to broadcast sponsored Neo N3 transactions");

  const rpcClient = new neoRpc.RPCClient(context.rpcUrl);
  const txHashRaw = await rpcClient.sendRawTransaction(normalizeNeoRawTransaction(sponsoredTx));
  const txHash = trimString(txHashRaw).startsWith("0x") ? trimString(txHashRaw) : `0x${trimString(txHashRaw)}`;
  let appLog;
  if (payload.wait) {
    appLog = await waitForNeoApplicationLog(rpcClient, txHash, Number(payload.timeout_ms) || DEFAULT_WAIT_TIMEOUT_MS, Number(payload.poll_interval_ms) || DEFAULT_POLL_INTERVAL_MS);
  }

  return { ...result, tx_hash: txHash, app_log: appLog };
}

export async function broadcastNeoN3RawTransaction(payload) {
  const context = loadNeoN3Context(payload, { required: false, requireRpc: true });
  const rpcClient = new neoRpc.RPCClient(context.rpcUrl);
  const txHashRaw = await rpcClient.sendRawTransaction(normalizeNeoRawTransaction(payload.raw_transaction || payload.raw_tx || payload.signed_tx || payload.tx_base64 || payload.tx_hex));
  const txHash = trimString(txHashRaw).startsWith("0x") ? trimString(txHashRaw) : `0x${trimString(txHashRaw)}`;
  let appLog;
  if (payload.wait) {
    appLog = await waitForNeoApplicationLog(rpcClient, txHash, Number(payload.timeout_ms) || DEFAULT_WAIT_TIMEOUT_MS, Number(payload.poll_interval_ms) || DEFAULT_POLL_INTERVAL_MS);
  }
  return { target_chain: "neo_n3", tx_hash: txHash, app_log: appLog };
}
