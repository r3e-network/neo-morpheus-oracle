# Testnet Oracle Recovery 2026-03-17

Date: 2026-03-17
Network: Neo N3 Testnet

## Scope

This note records the recovery of the direct Neo N3 Morpheus Oracle path after
testnet fulfillment had regressed.

## Root Cause

Two on-chain configuration values had drifted away from the signer that the
live testnet CVM worker and relayer were actually using:

- `updater`
- `oracleVerificationPublicKey`

The symptoms changed in sequence:

- first `fulfillRequest(...)` faulted with `unauthorized`
- after repairing `updater`, fulfillment progressed further but faulted with
  `invalid verification signature`

## On-Chain Repairs

- `setUpdater` tx:
  `0x944d44a176f989aef282c4359647ae08db26890ef733365f0da6fdd9be4620eb`
- `setOracleVerificationPublicKey` tx:
  `0x6070d6b0684df3531a9b1b9d9bbd60b149cfdd08af02960afe837b7458f223c6`

Final expected live signer identity:

- signer address:
  `NTmHjwiadq4g3VHpJ5FQigQcD4fF5m8TyX`
- signer script hash:
  `0x0c3146e78efc42bfb7d4cc2e06e3efd063c01c56`
- verifier public key:
  `03407c24a382011c16be1597699cd6460f54e49c25098d4943fdf0192c80cb6917`

## Validation

`scripts/verify-morpheus-n3.mjs` now reports:

- `updater_matches_expected = true`
- `verifier_key_matches_expected = true`
- callback allowlist and registry alignment remain true

Fresh direct smoke success:

- request tx:
  `0x8c8b6f09de54aad0b1c5cb52a5627b2c3cd3b0a6324c006ffd8afdd7843e1d64`
- request id:
  `3877`
- callback success:
  `true`

Fresh cross-repo smoke success:

- request tx:
  `0x7203b7a4781237bb8f255766b56d4f2718cf12cf9b8e686383832e8e724b3ef6`
- request id:
  `3878`
- callback success:
  `true`

Fresh default-script smoke success:

- request tx:
  `0x56c59ae481e31719d0b8785dcdddf5461f405e3d862028e7d2accd152e8eae57`
- request id:
  `3880`
- callback success:
  `true`

## Conclusion

The direct Neo N3 Oracle callback path is healthy again on testnet.
