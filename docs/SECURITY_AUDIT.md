# Security Audit Notes

## Scope

- Neo N3 contracts
- Neo X contracts
- Phala worker privacy Oracle and compute execution paths

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

## Remaining architectural notes

- N3 contracts still expose an explicit admin-only `Update(...)`, while the Neo X contracts are currently non-upgradeable plain contracts. This is a lifecycle difference, not an immediate exploitable vulnerability.
- Full Phala `tappd` attestation / derived-key integration is still a next-step hardening task.

## Validation

- `npm --prefix workers/phala-worker run check`
- `npm --prefix workers/phala-worker test`
- `npm --prefix contracts/neox test`
- `dotnet test contracts/__tests__/NeoContracts.Tests.csproj`
