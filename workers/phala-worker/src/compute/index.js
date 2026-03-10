import { createVerify, randomBytes } from "node:crypto";
import { keccak256, toUtf8Bytes } from "ethers";
import { assertUntrustedScriptsEnabled, env, json, normalizeTargetChain, parseDurationMs, resolveScript, resolveWasmModuleBase64, sha256Hex, stableStringify, trimString } from "../platform/core.js";
import { buildSignedResultEnvelope, buildVerificationEnvelope } from "../chain/index.js";
import { runScriptWithTimeout } from "../platform/script-runner.js";
import { maybeBuildDstackAttestation } from "../platform/dstack.js";
import { resolveConfidentialPayload } from "../oracle/crypto.js";
import { validateUserScriptSource } from "../platform/script-policy.js";
import { runWasmWithTimeout } from "../platform/wasm-runner.js";

function bigintPowMod(base, exponent, modulus) {
  let result = 1n;
  let b = BigInt(base) % BigInt(modulus);
  let e = BigInt(exponent);
  const m = BigInt(modulus);
  while (e > 0n) {
    if (e & 1n) result = (result * b) % m;
    e >>= 1n;
    b = (b * b) % m;
  }
  return result;
}

function multiplyMatrices(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || !left.length || !right.length) {
    throw new Error("matrix.multiply requires non-empty left/right matrices");
  }
  const rows = left.length;
  const shared = left[0].length;
  const cols = right[0].length;
  if (!left.every((row) => Array.isArray(row) && row.length === shared)) throw new Error("invalid left matrix");
  if (!right.every((row) => Array.isArray(row) && row.length === cols)) throw new Error("invalid right matrix");
  if (right.length !== shared) throw new Error("matrix dimensions do not align");
  const out = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
  for (let i = 0; i < rows; i += 1) {
    for (let j = 0; j < cols; j += 1) {
      let sum = 0;
      for (let k = 0; k < shared; k += 1) sum += Number(left[i][k]) * Number(right[k][j]);
      out[i][j] = sum;
    }
  }
  return out;
}

function cosineSimilarity(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length || left.length === 0) {
    throw new Error("vector.cosine_similarity requires equal-length non-empty vectors");
  }
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let i = 0; i < left.length; i += 1) {
    const a = Number(left[i]);
    const b = Number(right[i]);
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (leftNorm === 0 || rightNorm === 0) throw new Error("cosine similarity undefined for zero vector");
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function asLeafHash(value) {
  const raw = trimString(value);
  if (/^(0x)?[0-9a-fA-F]+$/.test(raw) && raw.replace(/^0x/i, "").length % 2 === 0) {
    return Buffer.from(raw.replace(/^0x/i, ""), "hex");
  }
  return Buffer.from(raw, "utf8");
}

function maskString(value, unmaskedLeft = 2, unmaskedRight = 2) {
  const str = String(value || "");
  if (str.length <= unmaskedLeft + unmaskedRight) return "*".repeat(Math.max(str.length, 4));
  return str.slice(0, unmaskedLeft) + "*".repeat(str.length - unmaskedLeft - unmaskedRight) + str.slice(-unmaskedRight);
}

function cryptoRandomUnit() {
  return randomBytes(6).readUIntBE(0, 6) / 0x1000000000000;
}

function addLaplaceNoise(value, scale = 1.0) {
  const u = cryptoRandomUnit() - 0.5;
  const noise = -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  return Number(value) + noise;
}

function merkleRoot(leaves) {
  if (!Array.isArray(leaves) || leaves.length === 0) throw new Error("merkle.root requires at least one leaf");
  let level = leaves.map((leaf) => Buffer.from(sha256Hex(asLeafHash(leaf)), "hex"));
  while (level.length > 1) {
    const next = [];
    for (let index = 0; index < level.length; index += 2) {
      const left = level[index];
      const right = level[index + 1] || left;
      next.push(Buffer.from(sha256Hex(Buffer.concat([left, right])), "hex"));
    }
    level = next;
  }
  return level[0].toString("hex");
}

function evaluatePolynomial(coefficients, x_value, modulus = null) {
  if (!Array.isArray(coefficients) || coefficients.length === 0) {
    throw new Error("math.polynomial requires at least one coefficient");
  }
  let result = 0n;
  const x = BigInt(Math.floor(Number(x_value)));
  const m = modulus ? BigInt(modulus) : null;
  
  for (const coefficient of coefficients) {
    const c = BigInt(Math.floor(Number(coefficient)));
    result = result * x + c;
    if (m !== null) {
      result = ((result % m) + m) % m;
    }
  }
  return result.toString();
}

function verifyRSASignature(publicKeyPem, signatureHex, payloadString) {
  try {
    const verify = createVerify("RSA-SHA256");
    verify.update(payloadString);
    verify.end();
    return verify.verify(publicKeyPem, Buffer.from(signatureHex, "hex"));
  } catch (error) {
    return false;
  }
}

export const BUILTIN_COMPUTE_CATALOG = [
  { name: "hash.sha256", category: "hash", description: "Hashes any JSON-serializable payload with SHA-256." },
  { name: "hash.keccak256", category: "hash", description: "Hashes any JSON-serializable payload with Keccak-256." },
  { name: "crypto.rsa_verify", category: "crypto", description: "Verifies an RSA-SHA256 signature (expensive on-chain)." },
  { name: "math.modexp", category: "math", description: "Performs big integer modular exponentiation." },
  { name: "math.polynomial", category: "math", description: "Evaluates a polynomial of arbitrary degree." },
  { name: "matrix.multiply", category: "linear_algebra", description: "Multiplies two dense matrices." },
  { name: "vector.cosine_similarity", category: "linear_algebra", description: "Computes cosine similarity between two vectors." },
  { name: "merkle.root", category: "merkle", description: "Builds a SHA-256 Merkle root from a list of leaves." },
  { name: "zkp.public_signal_hash", category: "zkp", description: "Computes a deterministic digest over public signals." },
  { name: "zkp.proof_digest", category: "zkp", description: "Computes a deterministic digest over a proof object." },
  { name: "zkp.witness_digest", category: "zkp", description: "Computes a digest over witness material before proving." },
  { name: "zkp.groth16.prove.plan", category: "zkp", description: "Returns a planning estimate for Groth16 proving workloads." },
  { name: "zkp.plonk.prove.plan", category: "zkp", description: "Returns a planning estimate for PLONK proving workloads." },
  { name: "fhe.batch_plan", category: "fhe", description: "Builds a ciphertext batching plan." },
  { name: "fhe.noise_budget_estimate", category: "fhe", description: "Estimates a rough FHE noise budget." },
  { name: "fhe.rotation_plan", category: "fhe", description: "Returns a rotation/key-switch planning summary." },
  { name: "privacy.mask", category: "privacy", description: "Masks a sensitive string, leaving edges visible." },
  { name: "privacy.add_noise", category: "privacy", description: "Adds simulated Laplace noise for differential privacy." },
];

export function listBuiltinComputeFunctions() {
  return BUILTIN_COMPUTE_CATALOG;
}

export async function executeBuiltinCompute(payload) {
  const fn = trimString(payload.function || payload.compute_fn);
  const input = payload.input ?? payload.compute_args ?? {};
  switch (fn) {
    case "hash.sha256":
      return { function: fn, result: { digest: sha256Hex(stableStringify(input)) } };
    case "hash.keccak256":
      return { function: fn, result: { digest: keccak256(toUtf8Bytes(stableStringify(input))) } };
    case "crypto.rsa_verify":
      return { function: fn, result: { is_valid: verifyRSASignature(input.public_key, input.signature, input.payload) } };
    case "math.modexp":
      return { function: fn, result: { value: bigintPowMod(input.base, input.exponent, input.modulus).toString() } };
    case "math.polynomial":
      return { function: fn, result: { value: evaluatePolynomial(input.coefficients, input.x, input.modulus) } };
    case "matrix.multiply":
      return { function: fn, result: { matrix: multiplyMatrices(input.left, input.right) } };
    case "vector.cosine_similarity":
      return { function: fn, result: { similarity: cosineSimilarity(input.left, input.right) } };
    case "merkle.root":
      return { function: fn, result: { root: merkleRoot(input.leaves || []) } };
    case "zkp.public_signal_hash":
      return { function: fn, result: { digest: sha256Hex(stableStringify({ circuit_id: input.circuit_id || null, signals: input.signals || [] })) } };
    case "zkp.proof_digest":
      return { function: fn, result: { digest: sha256Hex(stableStringify({ proof: input.proof || input, verifying_key: input.verifying_key || null })) } };
    case "zkp.witness_digest":
      return { function: fn, result: { digest: sha256Hex(stableStringify({ witness: input.witness || input, circuit_id: input.circuit_id || null })) } };
    case "zkp.groth16.prove.plan": {
      const constraints = Number(input.constraints || 0);
      const witnessCount = Number(input.witness_count || input.witnessCount || 0);
      return { function: fn, result: { constraints, witness_count: witnessCount, estimated_segments: Math.max(Math.ceil(constraints / 50000), 1), estimated_memory_mb: Math.max(Math.ceil((constraints + witnessCount) / 25000), 1) } };
    }
    case "zkp.plonk.prove.plan": {
      const gates = Number(input.gates || 0);
      return { function: fn, result: { gates, estimated_polynomials: Math.max(Math.ceil(gates / 65536), 1), estimated_memory_mb: Math.max(Math.ceil(gates / 30000), 1) } };
    }
    case "fhe.batch_plan": {
      const slotCount = Number(input.slot_count || input.slotCount || 0);
      const ciphertextCount = Number(input.ciphertext_count || input.ciphertextCount || 0);
      const slotsPerCiphertext = slotCount > 0 && ciphertextCount > 0 ? Math.ceil(slotCount / ciphertextCount) : slotCount;
      return { function: fn, result: { slot_count: slotCount, ciphertext_count: ciphertextCount, slots_per_ciphertext: slotsPerCiphertext } };
    }
    case "fhe.noise_budget_estimate": {
      const multiplicativeDepth = Number(input.multiplicative_depth || input.multiplicativeDepth || 1);
      const scaleBits = Number(input.scale_bits || input.scaleBits || 40);
      const modulusBits = Number(input.modulus_bits || input.modulusBits || 218);
      const estimatedNoiseBudget = Math.max(modulusBits - (multiplicativeDepth * scaleBits), 0);
      return { function: fn, result: { multiplicative_depth: multiplicativeDepth, scale_bits: scaleBits, modulus_bits: modulusBits, estimated_noise_budget: estimatedNoiseBudget } };
    }
    case "fhe.rotation_plan": {
      const indices = Array.isArray(input.indices) ? input.indices.map((value) => Number(value)) : [];
      return { function: fn, result: { indices, unique_rotations: [...new Set(indices)].sort((a, b) => a - b), key_switch_steps: indices.length } };
    }
    case "privacy.mask":
      return { function: fn, result: { masked: maskString(input.value, input.unmasked_left, input.unmasked_right) } };
    case "privacy.add_noise":
      return { function: fn, result: { noisy_value: addLaplaceNoise(input.value, input.scale) } };
    default:
      throw new Error(`unknown builtin compute function: ${fn}`);
  }
}

export async function executeStandaloneCompute(payload) {
  const wasmModuleBase64 = resolveWasmModuleBase64(payload);
  if (wasmModuleBase64) {
    const entryPoint = trimString(payload.wasm_entry || payload.wasm_entry_point || payload.entry_point || "run") || "run";
    const timeoutMs = parseDurationMs(
      payload.wasm_timeout_ms
        || payload.script_timeout_ms
        || payload.compute_timeout_ms
        || env("COMPUTE_WASM_TIMEOUT_MS", "MORPHEUS_WASM_TIMEOUT_MS")
        || 30000,
      30000,
    );
    return {
      runtime: "wasm",
      entry_point: entryPoint,
      result: await runWasmWithTimeout({
        mode: "compute",
        moduleBase64: wasmModuleBase64,
        entryPoint,
        input: { input: payload.input ?? {} },
        timeoutMs,
      }),
    };
  }

  const script = resolveScript(payload);
  if (!script) {
    throw new Error("script or script_base64 required");
  }
  assertUntrustedScriptsEnabled();
  validateUserScriptSource(script);

  const entryPoint = trimString(payload.entry_point || "process") || "process";
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(entryPoint)) {
    throw new Error("entry point must be a valid identifier");
  }
  const timeoutMs = parseDurationMs(
    payload.script_timeout_ms || payload.compute_timeout_ms || env("COMPUTE_SCRIPT_TIMEOUT_MS"),
    2000,
  );

  return {
    runtime: "script",
    entry_point: entryPoint,
    result: await runScriptWithTimeout({
      mode: "compute",
      script,
      entryPoint,
      input: payload.input ?? {},
      timeoutMs,
    }),
  };
}

export async function handleComputeExecute(payload) {
  try {
    const resolvedPayload = await resolveConfidentialPayload(payload);
    const mode = trimString(
      resolvedPayload.mode || (resolvedPayload.function || resolvedPayload.compute_fn ? "builtin" : "script"),
    ) || "script";
    const result = mode === "builtin"
      ? await executeBuiltinCompute(resolvedPayload)
      : await executeStandaloneCompute(resolvedPayload);
    const signed = await buildSignedResultEnvelope(result, resolvedPayload);
    const teeAttestation = await maybeBuildDstackAttestation(resolvedPayload, result);
    return json(200, {
      mode,
      target_chain: resolvedPayload.target_chain ? normalizeTargetChain(resolvedPayload.target_chain) : "neo_n3",
      target_chain_id: resolvedPayload.target_chain_id ? String(resolvedPayload.target_chain_id) : null,
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

export function handleComputeFunctions() {
  const functions = listBuiltinComputeFunctions();
  return json(200, { functions, names: functions.map((item) => item.name) });
}

export function handleComputeJobs(jobId = null) {
  if (jobId) {
    return json(200, {
      id: jobId,
      status: "completed",
      mode: "morpheus-compute",
      result: null,
      note: "Job detail response served by the Morpheus compute module.",
    });
  }

  return json(200, {
    jobs: [],
    mode: "morpheus-compute",
    note: "Morpheus compute exposes built-in and script-driven off-chain functions from the same trusted worker runtime.",
  });
}
