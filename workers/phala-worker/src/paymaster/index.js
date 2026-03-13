import { randomUUID } from "node:crypto";
import { buildSignedResultEnvelope, buildVerificationEnvelope } from "../chain/index.js";
import { executeBuiltinCompute } from "../compute/index.js";
import { maybeBuildDstackAttestation } from "../platform/dstack.js";
import { env, json, normalizeTargetChain, parseDurationMs, trimString } from "../platform/core.js";

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
    maxGasUnits: Number(env(`MORPHEUS_PAYMASTER_${upper}_MAX_GAS_UNITS`) || 0),
    allowTargets: parseCsv(env(`MORPHEUS_PAYMASTER_${upper}_ALLOW_TARGETS`)).map((entry) => entry.toLowerCase()),
    allowMethods: parseCsv(env(`MORPHEUS_PAYMASTER_${upper}_ALLOW_METHODS`)).map((entry) => entry.toLowerCase()),
    requireZerc20Proof: normalizeBoolean(env(`MORPHEUS_PAYMASTER_${upper}_REQUIRE_ZERC20_PROOF`), false),
    ttlMs: parseDurationMs(env(`MORPHEUS_PAYMASTER_${upper}_TTL_MS`) || "15m", 15 * 60_000),
  };
}

function normalizeVerdictPayload(payload = {}) {
  return {
    account_id: trimString(payload.account_id || payload.accountId || payload.requester || ""),
    target_contract: trimString(payload.target_contract || payload.targetContract || ""),
    method: trimString(payload.method || payload.target_method || payload.targetMethod || ""),
    estimated_gas_units: Number(payload.estimated_gas_units ?? payload.estimatedGasUnits ?? 0),
    target_chain: normalizeTargetChain(payload.target_chain || "neo_n3"),
  };
}

async function verifyZerc20ProofIfRequired(payload, policy) {
  const provided = payload.zerc20_proof || payload.zk_proof || null;
  if (!policy.requireZerc20Proof) {
    return { required: false, provided: Boolean(provided), verified: null, result: null };
  }
  if (!provided || typeof provided !== "object") {
    return { required: true, provided: false, verified: false, result: null };
  }
  const result = await executeBuiltinCompute({
    function: "zkp.zerc20.single_withdraw.verify",
    input: provided,
  });
  return { required: true, provided: true, verified: Boolean(result?.result?.is_valid), result: result?.result || null };
}

function buildDeniedVerdict(policy, normalized, reason, zerc20) {
  return {
    mode: "paymaster_authorize",
    approved: false,
    reason,
    network: policy.network,
    target_chain: normalized.target_chain,
    account_id: normalized.account_id,
    target_contract: normalized.target_contract,
    method: normalized.method,
    estimated_gas_units: normalized.estimated_gas_units,
    policy: {
      max_gas_units: policy.maxGasUnits,
      allow_targets: policy.allowTargets,
      allow_methods: policy.allowMethods,
      require_zerc20_proof: policy.requireZerc20Proof,
    },
    zerc20,
  };
}

async function evaluatePaymasterAuthorization(payload = {}) {
  const policy = resolvePaymasterPolicy(resolvePaymasterNetwork(payload));
  const normalized = normalizeVerdictPayload(payload);

  if (!policy.enabled) {
    return buildDeniedVerdict(policy, normalized, "paymaster disabled for network", null);
  }
  if (!normalized.account_id) {
    return buildDeniedVerdict(policy, normalized, "account_id is required", null);
  }
  if (!normalized.target_contract) {
    return buildDeniedVerdict(policy, normalized, "target_contract is required", null);
  }
  if (!normalized.method) {
    return buildDeniedVerdict(policy, normalized, "method is required", null);
  }
  if (!Number.isFinite(normalized.estimated_gas_units) || normalized.estimated_gas_units <= 0) {
    return buildDeniedVerdict(policy, normalized, "estimated_gas_units must be positive", null);
  }
  if (policy.maxGasUnits > 0 && normalized.estimated_gas_units > policy.maxGasUnits) {
    return buildDeniedVerdict(policy, normalized, "estimated gas exceeds network paymaster limit", null);
  }
  if (policy.allowTargets.length > 0 && !policy.allowTargets.includes(normalized.target_contract.toLowerCase())) {
    return buildDeniedVerdict(policy, normalized, "target_contract is not allowlisted", null);
  }
  if (policy.allowMethods.length > 0 && !policy.allowMethods.includes(normalized.method.toLowerCase())) {
    return buildDeniedVerdict(policy, normalized, "method is not allowlisted", null);
  }

  const zerc20 = await verifyZerc20ProofIfRequired(payload, policy);
  if (zerc20.required && !zerc20.verified) {
    return buildDeniedVerdict(policy, normalized, "zerc20 proof verification failed", zerc20);
  }

  return {
    mode: "paymaster_authorize",
    approved: true,
    network: policy.network,
    target_chain: normalized.target_chain,
    sponsorship_id: randomUUID(),
    account_id: normalized.account_id,
    target_contract: normalized.target_contract,
    method: normalized.method,
    estimated_gas_units: normalized.estimated_gas_units,
    expires_at: new Date(Date.now() + policy.ttlMs).toISOString(),
    policy: {
      max_gas_units: policy.maxGasUnits,
      require_zerc20_proof: policy.requireZerc20Proof,
    },
    zerc20,
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
