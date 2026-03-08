# Morpheus Oracle Contracts

This directory contains the standalone on-chain contracts for `neo-morpheus-oracle`.

## Included Contracts

- `MorpheusOracle` — Oracle-only asynchronous request/callback gateway and Oracle encryption key registry
- `OracleCallbackConsumer` — minimal callback consumer for verification and integration flows

## Key Oracle Methods

- `Request(requestType, payload, callbackContract, callbackMethod)`
- `FulfillRequest(requestId, success, result, error)`
- `SetUpdater(...)`
- `SetOracleEncryptionKey(...)`
- `OracleEncryptionAlgorithm()`
- `OracleEncryptionPublicKey()`
- `OracleEncryptionKeyVersion()`

## Build

```bash
cd contracts
./build.sh
```

## Test

```bash
dotnet test __tests__/NeoContracts.Tests.csproj
```
