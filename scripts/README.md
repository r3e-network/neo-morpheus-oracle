# Scripts

## Deployment And Verification

### Neo N3

- `node scripts/deploy-service-gateway.mjs`
- `node scripts/deploy-callback-consumer.mjs`
- `node scripts/setup-morpheus.mjs`
- `npm run publish:oracle-key`
- `npm run publish:oracle-verifier-key`
- `npm run write:addresses`
- `npm run verify:n3`
- `npm run smoke:n3`
- `npm run set:updater:n3`
- `node scripts/upgrade-morpheus-oracle.mjs`
- `npm run upgrade:datafeed:n3`

### Runtime env rendering

- `npm run render:phala-env`
- `npm run render:phala-env:mainnet`
- `npm run render:phala-env:testnet`
- `npm run render:phala-hub-env`
- `npm run check:signers`
- `npm run check:phala-env`
- `npm run check:control-plane`
- `npm run check:control-plane:strict`

### Control plane and runtime smoke

- `npm run smoke:control-plane`
- `npm run smoke:all`

## Validation Suites

- `npm run test:worker`
- `npm run test:relayer`
- `npm run test:control-plane`
- `npm run build:web`
- `npm run examples:test:n3`
- `npm run examples:test:n3:privacy`
- `npm run examples:test:n3:automation`
- `npm run examples:test:n3:callback-boundary`
- `npm run examples:test:n3:neodid-registry-boundary`
- `npm run examples:test:n3:encrypted-ref-boundary`
- `npm run examples:test:n3:fulfillment-replay`
- `npm run examples:test:n3:aa-session-oracle-boundary`
- `npm run examples:test:n3:attack-regression`

## Relayer Operations

- `npm run once:relayer`
- `npm run start:relayer`
- `npm run metrics:relayer`
- `npm run metrics:relayer:prom`
- `npm run start:relayer:metrics`
- `npm run stress:runtime`

Important relayer notes:

- `MORPHEUS_RELAYER_MODE=requests_only` for the Oracle CVM
- `MORPHEUS_RELAYER_MODE=feed_only` for the DataFeed CVM
- `MORPHEUS_RELAYER_INSTANCE_ID` makes queue ownership explicit
- `MORPHEUS_DURABLE_QUEUE_ENABLED=true` persists chain events before checkpoint advance

## SaaS Sync

- `npm run sync:checkly`
- `npm run sync:checkly:browser`
- `npm run check:betterstack`
- `npm run sync:betterstack`
- `npm run check:betterstack:monitors`
- `npm run sync:betterstack:monitors`
- `npm run check:betterstack:sources`
- `npm run sync:betterstack:sources`
- `npm run export:saas`

## Archived Neo X Reference Commands

Neo X remains reference-only:

- `node scripts/deploy-neox-contracts.mjs`
- `node scripts/setup-neox-addresses.mjs`
- `node scripts/publish-oracle-public-key-neox.mjs`
- `npm run verify:neox`
- `npm run smoke:neox`

## Expected Environment

- `NEO_N3_WIF`
- legacy `NEO_TESTNET_WIF`
- `NEO_RPC_URL`
- `NEO_NETWORK_MAGIC`
- `CONTRACT_MORPHEUS_ORACLE_HASH`
- `CONTRACT_ORACLE_CALLBACK_CONSUMER_HASH`
- `CONTRACT_MORPHEUS_DATAFEED_HASH`
- optional `MORPHEUS_UPDATER_HASH`

## Local Testnet RNG Loop

```bash
npm run set:updater:n3
npm run start:testnet-rng-local
```
