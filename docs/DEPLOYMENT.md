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

## Phala Worker

Deploy `workers/phala-worker` to Phala with:

- `PHALA_API_TOKEN` or `PHALA_SHARED_SECRET`
- `NEO_RPC_URL`
- `NEOX_RPC_URL`
- `PHALA_NEO_N3_WIF` or `PHALA_NEO_N3_PRIVATE_KEY`
- `PHALA_NEOX_PRIVATE_KEY`

## Supabase

Apply, in order:

- `supabase/migrations/0001_morpheus_schema.sql`
- `supabase/migrations/0002_morpheus_policies_and_seeds.sql`
- `supabase/migrations/0003_provider_configs.sql`

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
