# Security Audit Notes

Date: 2026-03-13

## Executive Summary

The current system is materially stronger than earlier iterations and is operating successfully on testnet. The worker, relayer, and contracts passed the current test suite and real end-to-end chain validation.

However, one protocol-level finding remains open and should be treated as the primary unresolved security issue before claiming a fully hardened production posture.

## Scope

- Neo N3 contracts
- Neo X contracts
- Phala worker privacy Oracle and compute execution paths
- NeoDID bind / ticket issuance and public DID resolution surfaces
- Relayer callback fulfillment path
- Web admin/control-plane surfaces

## Open Findings

### High: fulfillment signatures do not bind full callback context

Status: open

Affected files:

- `contracts/MorpheusOracle/MorpheusOracle.cs`
- `contracts/neox/contracts/MorpheusOracleX.sol`
- `workers/morpheus-relayer/src/relayer.js`

Current behavior:

- the relayer asks the worker to sign only the callback `result`
- both contracts verify only that signature over `result`
- `requestId`, `requestType`, `success`, and `error` are not covered by the worker signature

Impact:

- if the updater/relayer key is compromised, an attacker can finalize pending requests with a mismatched success/error context while still presenting a valid worker signature over some result bytes
- this weakens non-repudiation of the full callback envelope

Required fix:

- change the worker, relayer, and both contracts to verify a canonical fulfillment envelope that binds:
  - `requestId`
  - `requestType`
  - `success`
  - `result`
  - `error`

This requires a coordinated contract upgrade on both chains.

## Findings addressed

### 1. Neo X request and key size guards were weaker than Neo N3

Fixed in `contracts/neox/contracts/MorpheusOracleX.sol`:

- `requestType` length capped at `64`
- `callbackMethod` length capped at `64`
- `payload` size capped at `4096`
- Oracle encryption `algorithm` capped at `64`
- Oracle encryption `publicKey` capped at `2048`

### 2. Callback consumer parity gaps

Fixed parity between N3 and Neo X:

- N3 callback consumer now emits admin/oracle change events
- Neo X callback consumer now exposes `getCallback(uint256)`

### 3. DataFeed not-found behavior differed across chains

Fixed in `contracts/neox/contracts/MorpheusDataFeedX.sol`:

- `getLatest(pair)` now returns a default record with the queried `pair` instead of an empty string pair

### 4. DataFeed source-set and attestation constraints were looser on N3

Fixed in `contracts/MorpheusDataFeed/MorpheusDataFeed.cs`:

- `sourceSetId >= 0`
- `attestationHash.length <= 32`

### 5. Privacy Oracle and compute script execution could hang indefinitely

Fixed in worker runtime:

- Oracle programmable scripts now run in a separate worker thread
- Compute scripts now run in a separate worker thread
- `vm` timeout interrupts synchronous infinite loops
- worker termination timeout handles non-terminating async execution
- configurable with:
  - `ORACLE_SCRIPT_TIMEOUT_MS`
  - `COMPUTE_SCRIPT_TIMEOUT_MS`

### 6. Upstream Oracle fetches could hang indefinitely

Fixed in worker runtime:

- all provider fetches support timeout/abort
- direct Oracle HTTP fetches support timeout/abort
- upstream Oracle / provider responses now have a hard maximum body size
- configurable with:
  - `ORACLE_TIMEOUT`
  - `ORACLE_MAX_UPSTREAM_BODY_BYTES`

### 7. Compute entry-point name allowed identifier injection risk

Fixed in `workers/phala-worker/src/compute/index.js`:

- `entry_point` must match a valid JS identifier

### 7b. Untrusted compute/oracle payloads could still attempt large input/result amplification

Fixed in worker runtime:

- compute input payloads now have a maximum serialized size
- oracle programmable input payloads now have a maximum serialized size
- script worker results now have a maximum serialized size
- wasm worker results now have a maximum serialized size
- script bodies can be fetched by `script_ref`, but the fetched source still passes the same script-policy checks and size limits

Configurable with:

- `COMPUTE_MAX_INPUT_BYTES`
- `ORACLE_MAX_SCRIPT_INPUT_BYTES`
- `SCRIPT_WORKER_MAX_RESULT_BYTES`
- `WASM_CHILD_MAX_RESULT_BYTES`
- `MORPHEUS_MAX_REGISTERED_SCRIPT_BYTES`

### 8. Browser admin keys were persisted too broadly

Fixed in frontend admin panels:

- provider-config admin key now uses `sessionStorage`, not `localStorage`
- relayer-ops admin key now uses `sessionStorage`, not `localStorage`
- browser restart no longer silently retains privileged admin keys

### 9. One admin key previously covered too many backend capabilities

Fixed in web API auth routing:

- provider config routes now prefer `MORPHEUS_PROVIDER_CONFIG_API_KEY`
- relayer operation routes now prefer `MORPHEUS_RELAYER_ADMIN_API_KEY`
- signing routes now prefer `MORPHEUS_SIGNING_ADMIN_API_KEY`
- relay transaction routes now prefer `MORPHEUS_RELAY_ADMIN_API_KEY`
- `MORPHEUS_OPERATOR_API_KEY` and legacy `ADMIN_CONSOLE_API_KEY` remain optional fallback keys for compatibility

### 10. API operations were not comprehensively persisted, and encrypted request fields were not guaranteed to be stored as ciphertext

Fixed in web/API layer:

- added `morpheus_operation_logs` for API operation auditing
- added route-level and proxy-level logging for Oracle, Compute, Feed, Runtime, Attestation, Provider Config, Relayer, Signing, and Relay routes
- encrypted request fields are now extracted and stored in `morpheus_encrypted_secrets` as ciphertext without decryption
- plaintext secret-like keys are redacted before operation-log persistence

### 11. Mainnet and testnet signer/env selection could drift when a root `.env` value overrode the intended network

Fixed in scripts, worker, relayer, and Phala env generation:

- network-scoped Neo N3 signer resolution now prefers `NEO_TESTNET_WIF` when `MORPHEUS_NETWORK=testnet`
- generated Phala env files are now split into `morpheus.mainnet.env` and `morpheus.testnet.env`
- `phala.request-hub.toml` and `phala.feed-hub.toml` now bind each role-split CVM to the correct generated env file
- frontend runtime defaults now resolve the selected network's Phala endpoint from `config/networks/*.json`

Security impact:

- prevents accidental mainnet signer leakage into testnet test runs
- reduces the risk of producing tainted validation artifacts that mix the wrong RPC, contract hash, or CVM metadata

### 12. Supabase data from mainnet and testnet could be mixed under shared slugs and shared operational tables

Fixed in schema and application logic:

- added `network` scoping across active Supabase tables
- changed project uniqueness from `slug` to `(network, slug)`
- provider config lookup now resolves by `project_slug + network`
- relayer, automation, encrypted secret, backup, and operation-log writes now stamp the current network
- relayer admin queries and attestation lookup now filter by network

Security and ops impact:

- prevents testnet relayer jobs, encrypted refs, and automation state from appearing in mainnet operator views
- prevents a shared slug like `demo` from resolving to the wrong environment's provider config
- reduces the risk of cross-environment data leakage when one Supabase instance backs both networks

## Phala tappd / attestation progress

The worker now includes first-stage and second-stage Phala dstack/tappd integration:

- public `GET /info`
- public `GET /attestation`
- authenticated `GET /keys/derived`
- optional response-side quote attachment when `PHALA_EMIT_ATTESTATION=true`
- derived Neo N3 signing fallback when `PHALA_USE_DERIVED_KEYS=true`
- stable Oracle X25519 transport key using dstack-derived wrapping key + sealed keystore
- verifier API and `/verifier` demo flow for application-level attestation checks

## Remaining architectural notes

- N3 contracts still expose an explicit admin-only `Update(...)`, while the Neo X contracts are currently non-upgradeable plain contracts. This is a lifecycle difference, not an immediate exploitable vulnerability.
- Relayer-side transaction signing now supports dstack-derived key fallback for N3 and Neo X fulfill transactions, but explicit env keys are still supported as operational overrides.
- The public NeoDID DID resolver should remain metadata-only. It must not be extended to expose provider UIDs, Web3Auth JWT claims, master nullifiers, action nullifiers, or decrypted confidential payloads.
- The locally ignored generated files `deploy/phala/morpheus.mainnet.env` and `deploy/phala/morpheus.testnet.env` can contain live operational secrets and private keys. They are ignored by git, but they still represent workstation secret concentration risk and should be handled as sensitive operator material.

## Validation

- `npm --prefix workers/phala-worker run check`
- `npm --prefix workers/phala-worker test`
- `npm --prefix contracts/neox test`
- `dotnet test contracts/__tests__/NeoContracts.Tests.csproj`
- `node examples/scripts/test-neox-examples.mjs`
- `node examples/scripts/test-n3-examples.mjs`
- live Phala health and public-key endpoint verification
- live Supabase write verification for `morpheus_operation_logs` and `morpheus_encrypted_secrets`
- standalone AA verifier / hook validation in the active `neo-abstract-account` test suite
- cross-system attack coverage through the current integrated regression scripts
