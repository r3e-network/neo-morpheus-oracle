# Morpheus MiniApp OS Contracts

This directory now defines the Neo N3 on-chain kernel for the Morpheus `miniapp-os + miniapps` model.

The design goal is:

- system contracts own generic IO, request routing, callback delivery, fee accounting, and shared state
- miniapps register into the kernel instead of each deploying their own generic plumbing
- optional extension contracts remain possible, but they are adapters, not the default

## Included Contracts

### Neo N3

- `MorpheusOracle`
  - legacy deployment name retained for compatibility
  - now acts as the shared MiniApp OS kernel
  - owns miniapp registry, module registry, capability grants, async request queue, inbox delivery, shared fee credits, and generic app state
- `MorpheusDataFeed`
  - built-in shared numeric resource module
  - price feeds are the main use case, but the contract is framed as a reusable system registry for operator-maintained numeric snapshots
- `OracleCallbackConsumer`
  - optional external callback adapter
  - no longer required for normal miniapp integrations because the kernel inbox is canonical
- `NeoDIDRegistry`
  - specialized identity / nullifier verifier module
  - remains separate because its signature verification and replay constraints are domain-specific

## Kernel Model

The kernel contract is expected to own the generic platform surface:

1. `RegisterMiniApp(...)`
2. `RegisterSystemModule(...)`
3. `GrantModuleToMiniApp(...)`
4. `SubmitMiniAppRequest(...)`
5. `FulfillRequest(...)`
6. `GetInboxItem(...)`
7. `PutMiniAppState(...)`

That means:

- request/response flow is a kernel concern
- sponsorship / fee credits are a kernel concern
- callback persistence is a kernel concern
- common app state storage is a kernel concern
- miniapps focus on business configuration and business semantics

## Compatibility Layer

The old oracle-shaped entrypoints still exist in the kernel for migration:

- `Request(...)`
- `RequestFromCallback(...)`
- `QueueAutomationRequest(...)`
- `OracleEncryptionAlgorithm()`
- `OracleEncryptionPublicKey()`
- `OracleEncryptionKeyVersion()`
- `OracleVerificationPublicKey()`

These methods now map into the kernel model and should be treated as compatibility shims, not the preferred long-term API.

## Build

```bash
cd contracts
./build.sh
```

## Test

```bash
dotnet test __tests__/NeoContracts.Tests.csproj
```

## Next-upgrade notes (deployed N3 kernel `0xf54d8584`; tracked from the 2026-06-11 review)

The deployed kernel is upgradeable (admin-gated `Update`), but until the next upgrade ships
the following are live behaviors integrators must account for — and required fixes for the
next `ContractManagement.Update`:

- **Callback reverse-mapping uniqueness (OR-D-03)**: `PutMiniApp` (and `RebuildIndexes`) must
  assert `CallbackIndexMap[callbackContract]` is empty or already equals the appId before
  writing, or any account can repoint another app's callback routing (last-write-wins).
- **`onOracleResult` is the only dispatched callback**: `FulfillRequest` always calls
  `onOracleResult(requestId, operation, success, result, error)`; `onMiniAppResult` is never
  invoked (dead constant + manifest permission). A consumer implementing only `onMiniAppResult`
  silently receives nothing — the failure is swallowed by the kernel's try/catch.
- **`ExpireStaleRequest` writes no inbox item**: expiry refunds and emits
  `RequestExpired`/`MiniAppRequestCompleted` but stores no `InboxItem`, so inbox polling can
  never observe it. Consumers must treat `GetRequest().Status` as the source of truth and
  handle the Failed/expired state. Next upgrade: persist a failed inbox item on expiry.
- **Identifier charset**: `ValidateIdentifier` is length-only, but the relayer trims before
  hashing — whitespace-padded appId/moduleId/operation values produce a digest mismatch and
  can never be fulfilled (stall until expiry). Next upgrade: constrain identifiers to a safe
  charset (e.g. `[a-z0-9._-]`).
- **Hot-path triple deserialize**: `SubmitMiniAppRequestInternal` loads + deserializes the
  MiniApp record three times (`ValidateRequestInputs` twice internally, then
  `RequireActiveMiniApp` again) and re-asserts `Active` redundantly. Next rebuild: have
  `ValidateRequestInputs` return the record (single load). Pure GAS savings.
