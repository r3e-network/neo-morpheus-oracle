# Deployment

## Environment Templates

- `.env.development.example`
- `.env.production.example`

## Frontend

Deploy `apps/web` to Vercel.

Required env vars:

- `PHALA_API_URL`
- `PHALA_API_TOKEN` or `PHALA_SHARED_SECRET`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Phala Worker

Deploy `workers/phala-worker` to Phala with:

- `PHALA_API_TOKEN` or `PHALA_SHARED_SECRET`
- `NEO_RPC_URL`
- `NEOX_RPC_URL`
- `PHALA_NEO_N3_WIF` or `PHALA_NEO_N3_PRIVATE_KEY`
- `PHALA_NEOX_PRIVATE_KEY`

## Supabase

Apply `supabase/migrations/0001_morpheus_schema.sql`.

## Contracts

Build and deploy the Morpheus gateway contracts from `contracts/`.

Core contracts:

- `MorpheusOracle`
- `OracleCallbackConsumer`

## Optional On-Chain Key Publication

After the Phala worker is live, publish the active Oracle encryption key to your gateway contract:

```bash
npm run publish:oracle-key
```
