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

### `math.modexp`
Big integer modular exponentiation for cryptographic preprocessing.

### `matrix.multiply`
Dense matrix multiplication.

### `vector.cosine_similarity`
Vector similarity scoring.

### `zkp.public_signal_hash`
Normalizes and hashes a public signal set.

### `zkp.proof_digest`
Builds a deterministic digest of a proof object and optional verifying key context.

### `fhe.batch_plan`
Returns a batching/packing plan based on slot and ciphertext counts.

### `fhe.noise_budget_estimate`
Returns a coarse planning estimate for FHE noise budget based on depth and modulus settings.

## Notes

These built-ins are the first production-facing layer of Morpheus Compute.
They are intentionally designed so that later Phala worker profiles can replace the internal implementation with real external ZKP / FHE engines while preserving the API surface.
