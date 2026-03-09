# Deployment

## Environment Templates

- `.env.example`
- `.env.development.example`
- `.env.production.example`

## Frontend

Deploy `apps/web` to Vercel.

Required env vars:

- `PHALA_API_URL`
- `PHALA_API_TOKEN` or `PHALA_SHARED_SECRET`
- `TWELVEDATA_API_KEY` for the TwelveData built-in provider
- optional Coinbase spot provider requires no secret
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- optional but recommended in production: `MORPHEUS_PROVIDER_CONFIG_API_KEY` or `ADMIN_CONSOLE_API_KEY`
- optional datafeed defaults: `MORPHEUS_FEED_PROJECT_SLUG`, `MORPHEUS_FEED_PROVIDER`

## Phala Worker

Deploy `workers/phala-worker` to Phala with:

- `PHALA_API_TOKEN` or `PHALA_SHARED_SECRET`
- `NEO_RPC_URL`
- `NEOX_RPC_URL`
- `PHALA_NEO_N3_WIF` or `PHALA_NEO_N3_PRIVATE_KEY`
- `PHALA_NEOX_PRIVATE_KEY`
- `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` if direct worker calls should resolve project provider defaults
- `SUPABASE_SERVICE_ROLE_KEY` (or compatible service key) for worker-side provider-config lookup
- optional `ORACLE_TIMEOUT` for upstream fetch timeout (for example `20s`)
- optional `ORACLE_SCRIPT_TIMEOUT_MS` for privacy Oracle script execution timeout
- optional `COMPUTE_SCRIPT_TIMEOUT_MS` for compute script execution timeout
- optional `PHALA_USE_DERIVED_KEYS=true` to derive worker and relayer signing keys from tappd/dstack when explicit keys are omitted
- optional `PHALA_EMIT_ATTESTATION=true` to attach dstack quotes in worker responses
- optional `PHALA_DSTACK_ENDPOINT` to override the tappd endpoint
- optional `PHALA_DSTACK_NEO_N3_KEY_PATH` / `PHALA_DSTACK_NEOX_KEY_PATH` to override worker derived key paths
- optional `PHALA_DSTACK_RELAYER_NEO_N3_KEY_PATH` / `PHALA_DSTACK_RELAYER_NEOX_KEY_PATH` to override relayer derived key paths

## Phala CVM Topology

Recommended first deployment:

- 1 `Confidential VM`
- 2 containers inside it: `phala-worker` + `morpheus-relayer`

Sizing guidance:

- `Small TDX` → not recommended
- `Medium TDX` → recommended for testnet / MVP
- `Large TDX` → recommended default for production

Deployment files:

- `workers/phala-worker/Dockerfile`
- `workers/morpheus-relayer/Dockerfile`
- `deploy/phala/docker-compose.yml`
- `deploy/phala/Caddyfile`
- `deploy/phala/morpheus.env.example`
- `deploy/phala/README.md`
- `scripts/render-phala-env.mjs`
- `scripts/check-phala-env.mjs`

## Morpheus Relayer

Run `workers/morpheus-relayer` as the async bridge that watches `OracleRequested` events and calls `fulfillRequest` back on-chain.

Required env vars:

- `PHALA_API_URL`
- `PHALA_API_TOKEN` or `PHALA_SHARED_SECRET`
- `MORPHEUS_NETWORK`
- `MORPHEUS_RELAYER_NEO_N3_WIF` or `MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY`
- `MORPHEUS_RELAYER_NEOX_PRIVATE_KEY`
- `CONTRACT_MORPHEUS_ORACLE_HASH`
- `CONTRACT_MORPHEUS_ORACLE_X_ADDRESS`

Optional:

- `MORPHEUS_RELAYER_POLL_INTERVAL_MS`
- `MORPHEUS_RELAYER_CONCURRENCY`
- `MORPHEUS_RELAYER_MAX_BLOCKS_PER_TICK`
- `MORPHEUS_RELAYER_MAX_RETRIES`
- `MORPHEUS_RELAYER_RETRY_BASE_DELAY_MS`
- `MORPHEUS_RELAYER_RETRY_MAX_DELAY_MS`
- `MORPHEUS_RELAYER_PROCESSED_CACHE_SIZE`
- `MORPHEUS_RELAYER_DEAD_LETTER_LIMIT`
- `MORPHEUS_RELAYER_LOG_FORMAT`
- `MORPHEUS_RELAYER_LOG_LEVEL`
- `MORPHEUS_RELAYER_NEO_N3_CONFIRMATIONS`
- `MORPHEUS_RELAYER_NEO_X_CONFIRMATIONS`
- `MORPHEUS_RELAYER_STATE_FILE`

## Supabase

Apply, in order:

- `supabase/migrations/0001_morpheus_schema.sql`
- `supabase/migrations/0002_morpheus_policies_and_seeds.sql`
- `supabase/migrations/0003_provider_configs.sql`
- `supabase/migrations/0004_relayer_ops.sql`

Optional:

- `supabase/seed.sql`

## Contracts

Build and deploy the Morpheus gateway contracts from `contracts/`.
Use `config/networks/testnet.json` and `config/networks/mainnet.json` as the canonical address registry files.

Core contracts:

- Neo N3: `MorpheusOracle`, `OracleCallbackConsumer`, `MorpheusDataFeed`
- Neo X: `MorpheusOracleX`, `OracleCallbackConsumerX`, `MorpheusDataFeedX`

The intended logic is consistent across both chains:

- privacy oracle requests
- off-chain privacy compute through oracle/compute worker modules
- datafeed storage and updater-controlled publication

Provider control-plane notes:

- built-in provider metadata lives in the worker provider registry
- project-level provider defaults live in Supabase `morpheus_provider_configs`
- the web dashboard can manage provider configs through `/api/provider-configs`

## Optional On-Chain Key Publication

After the Phala worker is live, publish the active Oracle encryption key to your gateway contract:

```bash
npm run publish:oracle-key
```
