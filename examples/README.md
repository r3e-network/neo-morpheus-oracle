# Examples Directory

This directory contains copy-pasteable examples for the most common Morpheus workflows.

Structure:

- `browser-encryption/` — browser-side encryption helpers
- `node-encryption/` — Node-side encryption helpers
- `payloads/` — ready-to-edit request payload templates
  - includes automation templates for one-shot, interval, and price-threshold jobs
- `contracts/neox/` — Neo X user contract examples
- `contracts/n3/` — Neo N3 user contract examples
- `wasm/` — minimal WASM modules and build notes

Suggested usage:

1. Read the matching payload template under `payloads/`.
2. Encrypt any secret fields with the helpers under `browser-encryption/` or `node-encryption/`.
3. Use the matching contract example under `contracts/` to issue the request from chain.
4. Use the modules under `wasm/` when you want stronger isolation than custom JS.

Live deploy/test:

- `npm run examples:deploy:neox`
- `npm run examples:test:neox`
- `npm run examples:deploy:n3`
- `npm run examples:test:n3`
- `npm run examples:test:n3:builtins`
- `npm run examples:test:n3:automation`
- `npm run examples:all`
- `examples:all` runs `examples/scripts/deploy-and-test-all.mjs`, which compiles the Neo N3 and Neo X example contracts, deploys them to testnet, allowlists the callback consumer, and runs live oracle / encrypted compute / custom URL oracle / on-chain feed read flows.
- Deployment addresses are recorded under `examples/deployments/testnet.json`.
- The per-chain `examples:test:*` scripts rerun the live checks against the latest recorded deployment addresses without redeploying.

Mainnet validation:

- Neo N3 mainnet privacy matrix report: `docs/MAINNET_PRIVACY_VALIDATION_2026-03-11.md`
- Latest machine-readable report: `examples/deployments/mainnet-privacy-validation.latest.json`
- Pricefeed synchronization is operator-managed and automatic; end-user contracts should read the on-chain feed registry directly instead of trying to trigger feed publication.

Per-script report outputs:

- `examples:test:n3` now writes:
  - `examples/deployments/n3-examples-validation.<network>.latest.json`
  - `docs/N3_EXAMPLES_VALIDATION_<NETWORK>_<DATE>.md`
- `examples:test:n3:builtins` now writes:
  - `examples/deployments/n3-builtins-validation.<network>.latest.json`
  - `docs/N3_BUILTINS_VALIDATION_<NETWORK>_<DATE>.md`
- `examples:test:n3:automation` now writes:
  - `examples/deployments/n3-automation-validation.<network>.latest.json`
  - `docs/N3_AUTOMATION_VALIDATION_<NETWORK>_<DATE>.md`
