# Deployment

## Environment Templates

- `.env.example`
- `.env.development.example`
- `.env.production.example`
- `config/networks/mainnet.json` for canonical mainnet addresses, domains, CVM ids, attestation explorers, and runtime URLs
- `config/networks/testnet.json` for canonical testnet addresses, domains, CVM ids, attestation explorers, and runtime URLs
- `deploy/phala/morpheus.mainnet.env` generated from `npm run render:phala-env:mainnet`
- `deploy/phala/morpheus.testnet.env` generated from `npm run render:phala-env:testnet`
- `docs/ENVIRONMENT.md` for bilingual variable explanations and operator guidance

Recommended operator rule:

- keep one root secret set in `.env`
- render dedicated runtime env files per network
- never reuse the testnet generated env file on the mainnet CVM or vice versa
- set `MORPHEUS_ACTIVE_CHAINS=neo_n3` while the production rollout remains Neo N3-only

## Frontend

Deploy `apps/web` to Vercel.

Required env vars:

- `NEXT_PUBLIC_MORPHEUS_NETWORK` (`mainnet` or `testnet`)
- `MORPHEUS_RUNTIME_URL` preferred, or network-scoped `MORPHEUS_MAINNET_RUNTIME_URL` / `MORPHEUS_TESTNET_RUNTIME_URL`
- `MORPHEUS_RUNTIME_TOKEN` preferred, or `PHALA_API_TOKEN` / `PHALA_SHARED_SECRET`
- `TWELVEDATA_API_KEY` for the TwelveData built-in provider
- `NEXT_PUBLIC_WEB3AUTH_CLIENT_ID`
- optional Coinbase spot provider requires no secret
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SECRET_KEY`
- recommended for NeoDID Web3Auth production login:
  - `WEB3AUTH_CLIENT_SECRET`
  - `NEXT_PUBLIC_WEB3AUTH_NETWORK`
- optional but recommended in production: `MORPHEUS_PROVIDER_CONFIG_API_KEY` or `ADMIN_CONSOLE_API_KEY`
- optional and recommended for scoped admin separation:
  - `MORPHEUS_PROVIDER_CONFIG_API_KEY`
  - `MORPHEUS_RELAYER_ADMIN_API_KEY`
  - `MORPHEUS_SIGNING_ADMIN_API_KEY`
  - `MORPHEUS_RELAY_ADMIN_API_KEY`
  - `MORPHEUS_OPERATOR_API_KEY`
- optional datafeed defaults: `MORPHEUS_FEED_PROJECT_SLUG`, `MORPHEUS_FEED_PROVIDER`
- public NeoDID endpoints exposed by the frontend:
  - `/api/neodid/resolve`
  - `/launchpad/neodid-live`
  - `/launchpad/neodid-resolver`

## Phala Worker

Deploy `workers/phala-worker` to Phala with:

- `MORPHEUS_RUNTIME_TOKEN` or `PHALA_API_TOKEN` / `PHALA_SHARED_SECRET`
- `NEO_RPC_URL`
- `MORPHEUS_ACTIVE_CHAINS=neo_n3`
- `PHALA_NEO_N3_WIF` or `PHALA_NEO_N3_PRIVATE_KEY`
- `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` if direct worker calls should resolve project provider defaults
- `SUPABASE_SECRET_KEY` (preferred) or `SUPABASE_SERVICE_ROLE_KEY` for worker-side provider-config lookup
- `WEB3AUTH_CLIENT_ID` for in-TEE Web3Auth JWT audience verification
- optional `WEB3AUTH_JWKS_URL` to override the default Web3Auth JWKS endpoint
- optional `ORACLE_TIMEOUT` for upstream fetch timeout (for example `20s`)
- optional `ORACLE_SCRIPT_TIMEOUT_MS` for privacy Oracle script execution timeout
- optional `COMPUTE_SCRIPT_TIMEOUT_MS` for compute script execution timeout
- optional `PHALA_USE_DERIVED_KEYS=true` to derive worker and relayer signing keys from tappd/dstack when explicit keys are omitted
- optional `PHALA_EMIT_ATTESTATION=true` to attach dstack quotes in worker responses
- optional `PHALA_DSTACK_ENDPOINT` to override the dstack endpoint (defaults to `/var/run/dstack.sock` when mounted)
- optional `PHALA_DSTACK_NEO_N3_KEY_PATH` / `PHALA_DSTACK_NEOX_KEY_PATH` to override worker derived key paths
- optional `PHALA_DSTACK_RELAYER_NEO_N3_KEY_PATH` / `PHALA_DSTACK_RELAYER_NEOX_KEY_PATH` to override relayer derived key paths
- optional `PHALA_DSTACK_ORACLE_ENCRYPTION_KEY_PATH` to control the wrapping-key path for stable Oracle X25519 transport key storage
- optional `PHALA_ORACLE_KEYSTORE_PATH` to control where the sealed Oracle transport key is persisted (default `/data/morpheus/oracle-key.json` inside the shared CVM volume)
- current mainnet Oracle runtime endpoint: `https://oracle.meshmini.app/mainnet`
- current testnet Oracle runtime endpoint: `https://oracle.meshmini.app/testnet`
- Oracle CVM attestation explorer: `https://cloud.phala.com/explorer/app_ddff154546fe22d15b65667156dd4b7c611e6093`
- DataFeed CVM attestation explorer: `https://cloud.phala.com/explorer/app_28294e89d490924b79c85cdee057ce55723b3d56`
- web verifier API: `/api/attestation/verify`
- demo verifier flow: `/api/attestation/demo` and `/verifier`

## Phala CVM Topology

Recommended production deployment:

- 2 `Confidential VM`s, split by runtime role
- **Oracle CVM**: `oracle-morpheus-neo-r3e` / `ddff154546fe22d15b65667156dd4b7c611e6093`
- **DataFeed CVM**: `datafeed-morpheus-neo-r3e` / `28294e89d490924b79c85cdee057ce55723b3d56`
- each CVM runs multiple containers internally, but public/runtime topology is defined by role rather than by network

Tracked Phala descriptors:

- `phala.request-hub.toml`
- `phala.feed-hub.toml`

Generated local env files:

- `deploy/phala/morpheus.testnet.env`
- `deploy/phala/morpheus.mainnet.env`

Sizing guidance:

- `Small TDX` → dedicated testnet validation only
- `Medium TDX` → current mainnet baseline
- `Large TDX` → upgrade path for higher production traffic

Deployment files:

- `workers/phala-worker/Dockerfile`
- `workers/morpheus-relayer/Dockerfile`
- `deploy/phala/docker-compose.yml`
- `deploy/phala/Caddyfile`
- `deploy/phala/morpheus.env.example`
- `deploy/phala/README.md`
- `scripts/render-phala-env.mjs`
- `scripts/check-phala-env.mjs`

Recommended render commands:

```bash
npm run render:phala-env:mainnet
npm run render:phala-env:testnet
```

Compatibility note:

- `npm run render:phala-env` now intentionally aliases mainnet generation.

## Morpheus Relayer

Run `workers/morpheus-relayer` as the async bridge that watches `OracleRequested` events and calls `fulfillRequest` back on-chain.

Current production scope:

- Neo N3 is the active supported chain.
- Keep `MORPHEUS_ACTIVE_CHAINS=neo_n3` unless you are explicitly validating Neo X in an isolated environment.

Required env vars:

- `MORPHEUS_RUNTIME_URL`
- `MORPHEUS_RUNTIME_TOKEN` or `PHALA_API_TOKEN` / `PHALA_SHARED_SECRET`
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
- `MORPHEUS_RELAYER_NEO_N3_START_BLOCK`
- `MORPHEUS_RELAYER_NEO_X_START_BLOCK`
- `MORPHEUS_RELAYER_STATE_FILE`
- `MORPHEUS_AUTOMATION_ENABLED`
- `MORPHEUS_AUTOMATION_BATCH_SIZE`
- `MORPHEUS_AUTOMATION_MAX_QUEUED_PER_TICK`
- `MORPHEUS_AUTOMATION_DEFAULT_PRICE_COOLDOWN_MS`

## Supabase

Apply, in order:

- `supabase/migrations/0001_morpheus_schema.sql`
- `supabase/migrations/0002_morpheus_policies_and_seeds.sql`
- `supabase/migrations/0003_provider_configs.sql`
- `supabase/migrations/0004_relayer_ops.sql`
- `supabase/migrations/0005_operation_logs.sql`
- `supabase/migrations/0006_automation.sql`
- `supabase/migrations/0007_system_backups.sql`
- `supabase/migrations/0008_network_isolation.sql`

Optional:

- `supabase/seed.sql`

## Supabase Recording Model

Current persistence behavior:

- relayer runs and jobs are recorded in `morpheus_relayer_runs` and `morpheus_relayer_jobs`
- web/API operations are recorded in `morpheus_operation_logs`
- encrypted request fields such as `encrypted_params`, `encrypted_input`, `encrypted_payload`, and `encrypted_inputs.*` are stored directly as ciphertext in `morpheus_encrypted_secrets`
- plaintext secret-like keys are redacted before operation-log persistence
- automation registrations are stored in `morpheus_automation_jobs`
- automation queue attempts are stored in `morpheus_automation_runs`

Network isolation behavior:

- Supabase rows are now scoped by `network` (`mainnet` or `testnet`) for projects, encrypted secrets, relayer state, automation state, operation logs, feed snapshots, request records, and system backups
- `morpheus_projects` is now unique on `(network, slug)`, so `demo` can exist independently on mainnet and testnet
- provider config lookup resolves `project_slug + network`, not just `project_slug`
- relayer admin APIs and attestation lookup now default to the current network and do not mix cross-network rows

## Contracts

Build and deploy the Morpheus gateway contracts from `contracts/`.
Use `config/networks/testnet.json` and `config/networks/mainnet.json` as the canonical address registry files.

Core contracts:

- Neo N3: `MorpheusOracle`, `OracleCallbackConsumer`, `MorpheusDataFeed`, `NeoDIDRegistry`, `AbstractAccount`
- Neo X: `MorpheusOracleX`, `OracleCallbackConsumerX`, `MorpheusDataFeedX`

The intended logic is consistent across both chains:

- privacy oracle requests
- off-chain privacy compute through oracle/compute worker modules
- datafeed storage and updater-controlled publication
- NeoDID bind / action-ticket / recovery-ticket issuance through the Oracle callback path
- automation registration, execution queueing, and callback fulfillment

Published Neo N3 service anchors are tracked in `config/networks/mainnet.json`, including:

- `oracle.morpheus.neo`
- `pricefeed.morpheus.neo`
- `neodid.morpheus.neo`
- `smartwallet.neo`

Provider control-plane notes:

- built-in provider metadata lives in the worker provider registry
- project-level provider defaults live in Supabase `morpheus_provider_configs`
- the web dashboard can manage provider configs through `/api/provider-configs`

## Optional On-Chain Key Publication

After the Phala worker is live, publish the active Oracle encryption key to your gateway contract:

```bash
npm run publish:oracle-key
```
