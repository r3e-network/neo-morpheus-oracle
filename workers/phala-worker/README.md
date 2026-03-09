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

Inspect the live catalog via `GET /compute/functions`.
Current built-ins cover hashing, RSA verification, modular arithmetic, polynomial evaluation, matrices, vector similarity, Merkle roots, ZKP planning/digests, FHE planning, and privacy helpers.

## Key Endpoints

- `GET /health`
- `GET /info`
- `GET /attestation`
- `GET /keys/derived`
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
- accepts `encrypted_token` for auth secrets and encrypted JSON payload patches via `encrypted_params`, `encrypted_input`, or JSON-object `encrypted_payload`
- accepts `script` and `script_base64` as programmable compute aliases
- intended to run inside Phala TEE
- can emit dstack attestation quotes when `PHALA_EMIT_ATTESTATION=true`
- can derive worker signing keys from tappd when `PHALA_USE_DERIVED_KEYS=true`
- `src/server.js` provides the HTTP entrypoint for container/CVM deployment
- `Dockerfile` packages the worker for Phala CVM deployment
