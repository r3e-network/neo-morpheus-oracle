# Scripts

## Neo N3 contracts

- `node scripts/deploy-service-gateway.mjs`
- `node scripts/deploy-callback-consumer.mjs`
- `node scripts/setup-morpheus.mjs`
- `npm run publish:oracle-key`
- `npm run write:addresses`
- `npm run verify:n3`
- `npm run smoke:n3`
- `node scripts/upgrade-morpheus-oracle.mjs`
- `npm run render:phala-env`
- `npm run render:phala-env:mainnet`
- `npm run render:phala-env:testnet`
- `npm run check:phala-env`

## Neo X contracts

- `node scripts/deploy-neox-contracts.mjs`
- `node scripts/setup-neox-addresses.mjs`
- `node scripts/publish-oracle-public-key-neox.mjs`
- `npm run verify:neox`
- `npm run smoke:neox`

## Unified smoke

- `npm run smoke:all`

## Relayer

- `npm --prefix workers/morpheus-relayer run once`
- `npm --prefix workers/morpheus-relayer run start`
- `npm --prefix workers/morpheus-relayer run metrics`
- `workers/morpheus-relayer/Dockerfile`
- `workers/phala-worker/Dockerfile`
- `deploy/systemd/morpheus-relayer.service`
- `deploy/phala/docker-compose.yml`
- `deploy/phala/morpheus.env.example`
- `deploy/phala/README.md`

Notes:

- `npm run render:phala-env` now aliases mainnet generation
- `npm run check:phala-env` validates `deploy/phala/morpheus.<network>.env`

## Expected env vars

- `NEO_N3_WIF` (preferred)
- legacy `NEO_TESTNET_WIF`
- `NEO_RPC_URL`
- `NEO_NETWORK_MAGIC`
- `CONTRACT_MORPHEUS_ORACLE_HASH`
- `CONTRACT_ORACLE_CALLBACK_CONSUMER_HASH`
- `CONTRACT_MORPHEUS_DATAFEED_HASH`
- `CONTRACT_MORPHEUS_ORACLE_X_ADDRESS`
- `CONTRACT_ORACLE_CALLBACK_CONSUMER_X_ADDRESS`
- `CONTRACT_MORPHEUS_DATAFEED_X_ADDRESS`
- optional `MORPHEUS_UPDATER_HASH`
