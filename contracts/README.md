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

### Neo X

Neo X remains archived reference material only in this repo.

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
