# Security Audit Notes

Date: 2026-03-10

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
- configurable with:
  - `ORACLE_TIMEOUT`

### 7. Compute entry-point name allowed identifier injection risk

Fixed in `workers/phala-worker/src/compute/index.js`:

- `entry_point` must match a valid JS identifier

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
- The locally ignored file `deploy/phala/morpheus.env` currently contains live operational secrets and private keys. It is ignored by git, but it still represents a workstation secret concentration risk and should be handled as sensitive operator material.

## Validation

- `npm --prefix workers/phala-worker run check`
- `npm --prefix workers/phala-worker test`
- `npm --prefix contracts/neox test`
- `dotnet test contracts/__tests__/NeoContracts.Tests.csproj`
- `node examples/scripts/test-neox-examples.mjs`
- `node examples/scripts/test-n3-examples.mjs`
- live Phala health and public-key endpoint verification
- live Supabase write verification for `morpheus_operation_logs` and `morpheus_encrypted_secrets`
