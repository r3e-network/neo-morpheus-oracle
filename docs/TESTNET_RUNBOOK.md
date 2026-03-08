# Testnet Runbook

## 1. Install dependencies

```bash
npm install
```

## 2. Prepare env

```bash
cp .env.development.example .env.local
```

Fill in at least:

- `PHALA_API_URL`
- `PHALA_SHARED_SECRET` or `PHALA_API_TOKEN`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEO_TESTNET_WIF`
- `PHALA_NEO_N3_WIF` or `PHALA_NEO_N3_PRIVATE_KEY`
- `PHALA_NEOX_PRIVATE_KEY`

## 3. Apply Supabase schema

Run:

- `supabase/migrations/0001_morpheus_schema.sql`
- `supabase/migrations/0002_morpheus_policies_and_seeds.sql`
- optional `supabase/seed.sql`

## 4. Build contracts

```bash
cd contracts
./build.sh
```

## 5. Deploy contracts

### Neo N3

```bash
node scripts/deploy-service-gateway.mjs
node scripts/deploy-callback-consumer.mjs
```

Write deployed addresses into:

- `CONTRACT_MORPHEUS_ORACLE_HASH`
- `CONTRACT_ORACLE_CALLBACK_CONSUMER_HASH`
- `CONTRACT_MORPHEUS_DATAFEED_HASH`

### Neo X

```bash
npm --prefix contracts/neox install
npm --prefix contracts/neox run compile
npm --prefix contracts/neox test
node scripts/setup-neox-addresses.mjs
```

## 6. Configure contracts

```bash
node scripts/setup-morpheus.mjs
npm run publish:oracle-key
npm run write:addresses
```

## 7. Validate worker and web

```bash
npm --prefix workers/phala-worker test
npm --prefix apps/web run build
```

## 8. Launch local web

```bash
npm --prefix apps/web run dev
```

## 9. Smoke checks

- `GET /api/health`
- `GET /api/oracle/public-key`
- `GET /api/compute/functions`
- `GET /api/feeds/NEO-USD`
- run one `compute` builtin call
- run one `oracle smart-fetch` call with encrypted payload
