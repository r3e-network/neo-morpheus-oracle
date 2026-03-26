# Validation

## Canonical Validation Sequence

Run these checks after any meaningful change to runtime logic, deployment config, or public docs/frontend behavior.

```bash
npm run test:worker
npm run test:relayer
npm run test:control-plane
npm run build:web
npm run smoke:control-plane
npm run smoke:n3
npm run check:signers
MORPHEUS_NETWORK=testnet npm run verify:n3
```

## Targeted Neo N3 Regression Paths

```bash
npm run examples:test:n3:callback-boundary
npm run examples:test:n3:neodid-registry-boundary
npm run examples:test:n3:neodid-registry-v1
npm run examples:test:n3:encrypted-ref-boundary
npm run examples:test:n3:fulfillment-replay
npm run examples:test:n3:aa-session-oracle-boundary
npm run examples:test:n3:attack-regression
```

These cover:

- callback injection rejection
- NeoDID registry and ticket boundary behavior
- encrypted ref requester/callback binding
- fulfillment replay rejection
- AA session-key downstream Oracle boundaries
- integrated attack regression

## Environment Validation

```bash
npm run check:env
npm run check:control-plane
npm run check:control-plane:strict
npm run check:phala-env
npm run check:signers
```

## SaaS Validation

```bash
npm run check:checkly
npm run check:betterstack
npm run check:betterstack:monitors
npm run check:betterstack:sources
npm run export:saas
```

## What “Healthy” Means

- the web app builds successfully
- control plane tests pass
- worker and relayer tests pass
- Oracle key publication matches the runtime
- pinned signer identities match expected addresses
- testnet smoke and verify flows pass end to end
- no documentation pages or explorer pages reference removed topology or stale routes
