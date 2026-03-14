# AA V3 Testnet Validation Suite

Date: 2026-03-14
Network: Neo N3 testnet
Primary upstream repository: `../neo-abstract-account`

## Scope

This document mirrors the latest standalone AA V3 testnet validation baseline that Morpheus integrations depend on.

The suite now validates four layers in order:

1. `V3 Smoke`
2. `V3 Plugin Matrix`
3. `V3 Paymaster Policy`
4. `V3 Paymaster Relay`

## Upstream Evidence

Canonical upstream artifacts:

- `../neo-abstract-account/docs/reports/2026-03-14-v3-testnet-validation-suite.md`
- `../neo-abstract-account/sdk/docs/reports/2026-03-14-v3-testnet-validation-suite.latest.json`
- `../neo-abstract-account/sdk/docs/reports/2026-03-14-v3-testnet-paymaster-policy.1773454365197.json`
- `../neo-abstract-account/sdk/docs/reports/2026-03-13-v3-testnet-plugin-matrix.1773454185382.json`

## Result Summary

All four stages completed successfully on Neo N3 testnet:

- `V3 Smoke`: `ok`
- `V3 Plugin Matrix`: `ok`
- `V3 Paymaster Policy`: `ok`
- `V3 Paymaster Relay`: `ok`

## Key Transactions

### Smoke

- registerAccount: `0xa041c2c3ac501dd07030f707df4fac8f96d34ede49701958f6953cf7d3503475`
- native executeUserOp: `0xb06a3776504a169077a8968e42a3a42a739549d29c8e0b3ce3e36d9d0e0681c9`
- whitelist-hook executeUserOp: `0x359fc9e212b0f0efd80ef8ae81bd00f042966ed0059e67408a8f8b70d6730c52`
- Web3Auth executeUserOp: `0xe731e7fbd9b691a2b8c851f34ceb55b2b298820e51f945e163abe1f63b72d150`

### Plugin Matrix

- generated report: `../neo-abstract-account/sdk/docs/reports/2026-03-13-v3-testnet-plugin-matrix.1773454185382.json`
- validated scenarios:
  - `directConfigGuards`
  - `web3Auth`
  - `teeVerifier`
  - `webAuthnVerifier`
  - `sessionKeyVerifier`
  - `multiSigVerifier`
  - `subscriptionVerifier`
  - `zkEmailVerifier`
  - `whitelistHook`
  - `dailyLimitHook`
  - `tokenRestrictedHook`
  - `multiHook`
  - `neoDidCredentialHook`

### Paymaster Policy

- generated report: `../neo-abstract-account/sdk/docs/reports/2026-03-14-v3-testnet-paymaster-policy.1773454365197.json`
- validated deny cases:
  - `missingOperationHash`
  - `wrongDappId`
  - `wrongAccountId`
  - `wrongTargetContract`
  - `wrongMethod`
  - `gasTooHigh`
  - `wrongTargetChain`

### Paymaster Relay

- relay txid: `0xb55e8c4c02243cc3769074c89d2b0dfc16ffa6c7dfbec1a62da9cb89df86c856`
- policy id: `testnet-aa`
- approval digest: `775bf2ff09499b96c33546317416f1ba052a777f0bda9ed6e8a99b1df06a62cb`
- attestation hash: `b697e13b497201bbefbeb933269d878997e0c7cc274176ad5656e62372f61bbe`
- execution vmstate: `HALT`

## Why This Matters For Morpheus

Morpheus integrations now inherit a stronger AA baseline than the earlier 2026-03-13 standalone plugin-only run:

- verifier and hook primitives are still covered
- paymaster policy abuse checks are now covered live
- sponsored AA relay execution is now covered live

This means the Morpheus-side integrated attack matrix can assume not only verifier / hook correctness, but also:

- sponsorship policy scoping correctness
- live testnet `executeUserOp` sponsorship success
- live testnet rejection of malformed or non-allowlisted sponsorship requests
