# Morpheus Phala Worker

This worker is the trusted execution core of **neo-morpheus-oracle**.

## Modules

- `oracle` — privacy oracle fetch and programmable transformations
- `compute` — built-in heavy compute functions and script execution
- `feeds` — signed market/datafeed endpoints
- `vrf` — randomness
- `sign` — chain-aware signing helpers
- `relay` — Neo N3 and Neo X relay helpers

## Built-in Compute Functions

- `hash.sha256`
- `math.modexp`
- `matrix.multiply`
- `vector.cosine_similarity`
- `zkp.public_signal_hash`
- `zkp.proof_digest`
- `fhe.batch_plan`
- `fhe.noise_budget_estimate`

## Key Endpoints

- `GET /health`
- `GET /oracle/public-key`
- `POST /oracle/query`
- `POST /oracle/smart-fetch`
- `GET /compute/functions`
- `POST /compute/execute`
- `GET /feeds/price/:symbol`
- `POST /vrf/random`
- `POST /sign/payload`
- `POST /relay/transaction`

## Notes

- supports Neo N3 + Neo X
- accepts `encrypted_token` and `encrypted_payload` as secret aliases
- accepts `script` and `script_base64` as programmable compute aliases
- intended to run inside Phala TEE
