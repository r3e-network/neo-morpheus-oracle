# Built-in Compute Functions

Morpheus Compute exposes built-in heavy functions through `POST /compute/execute`.

## Request Shape

```json
{
  "mode": "builtin",
  "function": "math.modexp",
  "input": {
    "base": "2",
    "exponent": "10",
    "modulus": "17"
  },
  "target_chain": "neo_n3"
}
```

## Available Built-ins

### `hash.sha256`
Hashes any JSON-serializable input.

### `hash.keccak256`
Keccak-256 digest for EVM-oriented preprocessing and cross-checks.

### `math.modexp`
Big integer modular exponentiation for cryptographic preprocessing.

### `matrix.multiply`
Dense matrix multiplication.

### `vector.cosine_similarity`
Vector similarity scoring.

### `merkle.root`
Builds a SHA-256 Merkle root from a list of leaves.

### `zkp.public_signal_hash`
Normalizes and hashes a public signal set.

### `zkp.proof_digest`
Builds a deterministic digest of a proof object and optional verifying key context.

### `zkp.witness_digest`
Builds a deterministic digest of witness material before proving.

### `zkp.groth16.prove.plan`
Returns a planning estimate for Groth16 proving workloads.

### `zkp.plonk.prove.plan`
Returns a planning estimate for PLONK proving workloads.

### `fhe.batch_plan`
Returns a batching/packing plan based on slot and ciphertext counts.

### `fhe.noise_budget_estimate`
Returns a coarse planning estimate for FHE noise budget based on depth and modulus settings.

### `fhe.rotation_plan`
Returns a rotation/key-switch planning summary for vector index usage.

## Notes

These built-ins are the first production-facing layer of Morpheus Compute.
They are intentionally designed so that later Phala worker profiles can replace the internal implementation with real external ZKP / FHE engines while preserving the API surface.
