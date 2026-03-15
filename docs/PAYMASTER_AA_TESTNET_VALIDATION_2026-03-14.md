# Morpheus Paymaster + AA Testnet Validation

Date: 2026-03-14
Network: Neo N3 Testnet

Refresh note on 2026-03-15:

- the canonical shared testnet AA core is now `0xe24d2980d17d2580ff4ee8dc5dddaa20e3caec38`
- the canonical shared testnet `Web3AuthVerifier` is now `0xf2560a0db44bbb32d0a6919cf90a3d0643ad8e3d`
- this report remains the historical record of the original 2026-03-14 validation run

## Scope

This report records the live validation of the Morpheus paymaster service when used by the Neo Abstract Account relay flow on testnet.

Validated components:

- Morpheus test CVM app id: `28294e89d490924b79c85cdee057ce55723b3d56`
- Morpheus paymaster policy id: `testnet-aa`
- Neo N3 AA core contract: `0x9cbbfc969f94a5056fd6a658cab090bcb3604724`
- Neo N3 Web3Auth verifier: `0xcd2e4589debfd80449ba9190548c5a7d539ce062`
- relay method: `executeUserOp`

## Bug Fixed Before Validation

The AA relay API built the paymaster request with `sanitizeHex(...)` but did not import `sanitizeHex`.

Effect before the fix:

- every paymaster-backed relay request failed before Morpheus authorization was completed
- the AA API error surfaced as a paymaster-stage failure

After the fix:

- Morpheus authorization succeeds
- the relay path reaches chain execution normally

## Validation Matrix

### 1. Direct paymaster authorization

Confirmed live against the Morpheus worker:

- HTTP status: `200`
- approved: `true`
- network: `testnet`
- target chain: `neo_n3`
- policy id: `testnet-aa`

### 2. Direct relay submission

Confirmed separately on the AA side:

- relay txid: `0xa8492f393bff2f1835cd58aa0117f5ea6594ad5aae71a1effb024899c5ab0022`
- vmstate: `HALT`

### 3. Full end-to-end path using an existing allowlisted account

- account id: `0x1111222233334444555566667777888899990000`
- relay txid: `0x1d79429b9e8af4115845d7858ddaefcc575dafff2b14a37a000caaea58a0f0bb`
- paymaster approval digest: `bb40b23016f702b3e7e084a977bcba02e595a3054095053294618cf65d630a3c`
- paymaster attestation hash: `e352300442435c80478e09f27328150cdd50dd97e052865f39a410b5cfc5133f`
- execution vmstate: `HALT`
- execution return stack: `GAS`

### 4. Full end-to-end path including new account registration and allowlist update

- account id: `0x531a5f4d3a916dffbba3ea372317623fdbbb853c`
- register txid: `0xf79d6a1d3012e9edc64c1a7e40abc932253c7f737873698055ad8f3df8a1869e`
- update verifier txid: `0xed9c97801a757fb0e3d72d641d75a6659c1242c084134234b5e7cd1a81e903d8`
- relay txid: `0x057d4a581efbe815fad0148a3766284da2a33335e72fb50e54d476078d8f40d4`
- paymaster approval digest: `04111a96d6356231c45fdb033ddc91818856c1dc0ac0ce09677ecdb033cae92f`
- paymaster attestation hash: `73849ae405db210d51c28ff63033bc4bb5f2f0886e1a7478c2557e1ac9c39886`
- execution vmstate: `HALT`
- execution return stack: `GAS`

## Harness Note

The most reliable workstation-to-CVM validation path was:

1. upload a helper script with `phala cp`
2. execute it with `phala ssh -- sh /tmp/helper.sh`

This replaced a stdin-piped `phala ssh` approach that intermittently failed with transport error `255`.

The underlying Morpheus paymaster service was not the failure source in that earlier harness issue. The failure was in the transport used by the test bridge.

## Conclusion

The Morpheus paymaster service is now validated for the Neo N3 AA relay path on testnet across:

- direct authorization
- direct relay execution
- full existing-account replay
- full new-account registration + allowlist + authorization + relay execution

The service-side controls remained intact throughout validation:

- contract allowlist
- method allowlist
- account allowlist
- dapp allowlist
- max gas limit
- TEE-signed result envelope with attestation metadata
