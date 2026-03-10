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
- `npm run examples:all`
- `examples:all` runs `examples/scripts/deploy-and-test-all.mjs`, which compiles the Neo N3 and Neo X example contracts, deploys them to testnet, allowlists the callback consumer, and runs live oracle / encrypted compute / custom URL oracle / pricefeed flows.
- Deployment addresses are recorded under `examples/deployments/testnet.json`.
- The per-chain `examples:test:*` scripts rerun the live checks against the latest recorded deployment addresses without redeploying.
