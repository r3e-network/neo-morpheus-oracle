import { randomUUID } from "node:crypto";
import { buildSignedResultEnvelope, buildVerificationEnvelope } from "../chain/index.js";
import { maybeBuildDstackAttestation } from "../platform/dstack.js";
import { env, json, normalizeTargetChain, parseDurationMs, sha256Hex, trimString } from "../platform/core.js";

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function parseCsv(value) {
  const raw = trimString(value);
  if (!raw) return [];
  return raw.split(",").map((entry) => trimString(entry)).filter(Boolean);
}

function resolvePaymasterNetwork(payload = {}) {
  const requested = trimString(payload.network || payload.morpheus_network || env("MORPHEUS_NETWORK") || "testnet").toLowerCase();
  return requested === "mainnet" ? "mainnet" : "testnet";
}

function resolvePaymasterPolicy(network) {
  const upper = network === "mainnet" ? "MAINNET" : "TESTNET";
  return {
    network,
    enabled: normalizeBoolean(env(`MORPHEUS_PAYMASTER_${upper}_ENABLED`), false),
    policyId: trimString(env(`MORPHEUS_PAYMASTER_${upper}_POLICY_ID`) || `${network}-default`),
    maxGasUnits: Number(env(`MORPHEUS_PAYMASTER_${upper}_MAX_GAS_UNITS`) || 0),
    allowTargets: parseCsv(env(`MORPHEUS_PAYMASTER_${upper}_ALLOW_TARGETS`)).map((entry) => entry.toLowerCase()),
    allowMethods: parseCsv(env(`MORPHEUS_PAYMASTER_${upper}_ALLOW_METHODS`)).map((entry) => entry.toLowerCase()),
    allowAccounts: parseCsv(env(`MORPHEUS_PAYMASTER_${upper}_ALLOW_ACCOUNTS`)).map((entry) => entry.toLowerCase()),
    blockAccounts: parseCsv(env(`MORPHEUS_PAYMASTER_${upper}_BLOCK_ACCOUNTS`)).map((entry) => entry.toLowerCase()),
    allowDapps: parseCsv(env(`MORPHEUS_PAYMASTER_${upper}_ALLOW_DAPPS`)).map((entry) => entry.toLowerCase()),
    ttlMs: parseDurationMs(env(`MORPHEUS_PAYMASTER_${upper}_TTL_MS`) || "15m", 15 * 60_000),
  };
}

function normalizeVerdictPayload(payload = {}) {
  return {
    account_id: trimString(payload.account_id || payload.accountId || payload.requester || ""),
    dapp_id: trimString(payload.dapp_id || payload.dappId || ""),
    target_contract: trimString(payload.target_contract || payload.targetContract || ""),
    method: trimString(payload.method || payload.target_method || payload.targetMethod || ""),
    estimated_gas_units: Number(payload.estimated_gas_units ?? payload.estimatedGasUnits ?? 0),
    operation_hash: trimString(payload.operation_hash || payload.operationHash || ""),
    target_chain: normalizeTargetChain(payload.target_chain || "neo_n3"),
  };
}

function buildDeniedVerdict(policy, normalized, reason) {
  return {
    mode: "paymaster_authorize",
    approved: false,
    reason,
    network: policy.network,
    target_chain: normalized.target_chain,
    account_id: normalized.account_id,
    dapp_id: normalized.dapp_id,
    target_contract: normalized.target_contract,
    method: normalized.method,
    estimated_gas_units: normalized.estimated_gas_units,
    operation_hash: normalized.operation_hash,
    policy: {
      policy_id: policy.policyId,
      max_gas_units: policy.maxGasUnits,
      allow_targets: policy.allowTargets,
      allow_methods: policy.allowMethods,
      allow_accounts: policy.allowAccounts,
      block_accounts: policy.blockAccounts,
      allow_dapps: policy.allowDapps,
    },
  };
}

async function evaluatePaymasterAuthorization(payload = {}) {
  const policy = resolvePaymasterPolicy(resolvePaymasterNetwork(payload));
  const normalized = normalizeVerdictPayload(payload);

  if (!policy.enabled) {
    return buildDeniedVerdict(policy, normalized, "paymaster disabled for network");
  }
  if (!normalized.account_id) {
    return buildDeniedVerdict(policy, normalized, "account_id is required");
  }
  if (normalized.target_chain !== "neo_n3") {
    return buildDeniedVerdict(policy, normalized, "paymaster currently supports neo_n3 only");
  }
  if (!normalized.operation_hash) {
    return buildDeniedVerdict(policy, normalized, "operation_hash is required");
  }
  if (!normalized.target_contract) {
    return buildDeniedVerdict(policy, normalized, "target_contract is required");
  }
  if (!normalized.method) {
    return buildDeniedVerdict(policy, normalized, "method is required");
  }
  if (!Number.isFinite(normalized.estimated_gas_units) || normalized.estimated_gas_units <= 0) {
    return buildDeniedVerdict(policy, normalized, "estimated_gas_units must be positive");
  }
  if (policy.maxGasUnits > 0 && normalized.estimated_gas_units > policy.maxGasUnits) {
    return buildDeniedVerdict(policy, normalized, "estimated gas exceeds network paymaster limit");
  }
  if (policy.blockAccounts.length > 0 && policy.blockAccounts.includes(normalized.account_id.toLowerCase())) {
    return buildDeniedVerdict(policy, normalized, "account_id is blocklisted");
  }
  if (policy.allowAccounts.length > 0 && !policy.allowAccounts.includes(normalized.account_id.toLowerCase())) {
    return buildDeniedVerdict(policy, normalized, "account_id is not allowlisted");
  }
  if (policy.allowDapps.length > 0) {
    if (!normalized.dapp_id) {
      return buildDeniedVerdict(policy, normalized, "dapp_id is required");
    }
    if (!policy.allowDapps.includes(normalized.dapp_id.toLowerCase())) {
      return buildDeniedVerdict(policy, normalized, "dapp_id is not allowlisted");
    }
  }
  if (policy.allowTargets.length > 0 && !policy.allowTargets.includes(normalized.target_contract.toLowerCase())) {
    return buildDeniedVerdict(policy, normalized, "target_contract is not allowlisted");
  }
  if (policy.allowMethods.length > 0 && !policy.allowMethods.includes(normalized.method.toLowerCase())) {
    return buildDeniedVerdict(policy, normalized, "method is not allowlisted");
  }

  return {
    mode: "paymaster_authorize",
    approved: true,
    network: policy.network,
    target_chain: normalized.target_chain,
    policy_id: policy.policyId,
    sponsorship_id: randomUUID(),
    account_id: normalized.account_id,
    dapp_id: normalized.dapp_id,
    target_contract: normalized.target_contract,
    method: normalized.method,
    estimated_gas_units: normalized.estimated_gas_units,
    operation_hash: normalized.operation_hash,
    approval_digest: sha256Hex({
      network: policy.network,
      policy_id: policy.policyId,
      account_id: normalized.account_id,
      dapp_id: normalized.dapp_id,
      target_contract: normalized.target_contract,
      method: normalized.method,
      estimated_gas_units: normalized.estimated_gas_units,
      operation_hash: normalized.operation_hash,
    }),
    expires_at: new Date(Date.now() + policy.ttlMs).toISOString(),
    policy: {
      policy_id: policy.policyId,
      max_gas_units: policy.maxGasUnits,
    },
  };
}

export async function handlePaymasterAuthorize(payload = {}) {
  try {
    const result = await evaluatePaymasterAuthorization(payload);
    const signed = await buildSignedResultEnvelope(result, payload);
    const teeAttestation = await maybeBuildDstackAttestation(payload, result);
    return json(200, {
      ...result,
      output_hash: signed.output_hash,
      signature: signed.signature,
      public_key: signed.public_key,
      attestation_hash: signed.attestation_hash,
      tee_attestation: teeAttestation,
      verification: buildVerificationEnvelope(signed, teeAttestation),
    });
  } catch (error) {
    return json(400, { error: error instanceof Error ? error.message : String(error) });
  }
}
