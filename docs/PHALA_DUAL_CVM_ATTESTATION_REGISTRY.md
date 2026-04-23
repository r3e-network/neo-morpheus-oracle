# Phala Dual-CVM Attestation Registry

This report records the current published Phala attestation anchors after the Morpheus runtime was
split into two role-specialized confidential VMs.

## Canonical CVM Roles

- Oracle request/response runtime
  - CVM name: `oracle-morpheus-neo-r3e`
  - app id: `ddff154546fe22d15b65667156dd4b7c611e6093`
  - Phala explorer: `https://cloud.phala.com/explorer/app_ddff154546fe22d15b65667156dd4b7c611e6093`
  - public runtime paths:
    - `https://oracle.meshmini.app/mainnet`
    - `https://oracle.meshmini.app/testnet`
- DataFeed runtime
  - CVM name: `datafeed-morpheus-neo-r3e`
  - app id: `ac5b6886a2832df36e479294206611652400178f`
  - Phala explorer: `https://cloud.phala.com/explorer/app_ac5b6886a2832df36e479294206611652400178f`

## Interpretation

- Oracle traffic is now role-routed, not CVM-per-network.
- Mainnet and testnet Oracle requests share the same Oracle CVM and differ only by network path or
  request payload.
- Continuous pricefeed synchronization is isolated onto the dedicated DataFeed CVM.
- These explorer URLs are the canonical public attestation references that should be reused by the
  frontend, verifier documentation, runbooks, and downstream integrations.
