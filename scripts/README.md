# Scripts

## Neo N3 contracts

- `node scripts/deploy-service-gateway.mjs`
- `node scripts/deploy-callback-consumer.mjs`
- `node scripts/setup-morpheus.mjs`
- `npm run publish:oracle-key`
- `npm run write:addresses`
- `npm run verify:n3`
- `npm run set:updater:n3`
- `npm run smoke:n3`
- `node scripts/upgrade-morpheus-oracle.mjs`
- `npm run render:phala-env`
- `npm run render:phala-env:mainnet`
- `npm run render:phala-env:testnet`
- `npm run check:signers`
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
- `npm --prefix workers/morpheus-relayer run metrics:prom`
- `npm run metrics:relayer:prom`
- `npm run start:testnet-rng-local`
- `workers/morpheus-relayer/Dockerfile`
- `workers/phala-worker/Dockerfile`
- `deploy/systemd/morpheus-relayer.service`
- `deploy/phala/docker-compose.yml`
- `deploy/phala/morpheus.env.example`
- `deploy/phala/README.md`

Notes:

- `npm run render:phala-env` now aliases mainnet generation
- `npm run check:signers` audits pinned Neo N3 worker / relayer / updater / oracle_verifier identities across local and generated env files
- `npm run check:phala-env` validates `deploy/phala/morpheus.<network>.env`
- `MORPHEUS_RELAYER_MODE=feed_only` can be used for a dedicated pricefeed relayer instance
- `MORPHEUS_RELAYER_INSTANCE_ID` can be set to make durable-queue claim ownership explicit in logs and job metadata
- `MORPHEUS_DURABLE_QUEUE_ENABLED=true` persists fresh chain events into `morpheus_relayer_jobs` before checkpoints advance
- `MORPHEUS_BETTERSTACK_RELAYER_HEARTBEAT_URL` and related heartbeat URLs can be used to ping Better Stack from cron and relayer success/failure paths
- `npm run metrics:relayer:prom` renders Prometheus text for Grafana Cloud or any Prometheus-compatible scraper / push bridge

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

### Local testnet RNG isolation

Use these when you need a known-good local `rng` fulfillment loop on Neo N3
testnet:

- `npm run set:updater:n3`
- `npm run start:testnet-rng-local`

Expected env:

- `TESTNET_WIF` or `NEO_TESTNET_WIF`
- `UPDATER_WIF` or `MORPHEUS_RELAYER_NEO_N3_WIF`
- `MORPHEUS_UPDATER_HASH` when switching the Oracle updater
