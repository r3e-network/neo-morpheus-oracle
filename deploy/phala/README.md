# Phala CVM Deployment

This folder contains the recommended first-stage deployment layout for `neo-morpheus-oracle` on **Phala Confidential VM**.

## Recommended topology

Use **1 CVM with 2 containers**:

- `phala-worker`
- `morpheus-relayer`

This is the best balance for the current project: simple, cheap, and enough to run the full async Oracle loop.

## Which CVM size to choose

From the TDX sizes shown in your console:

- `Small TDX (1 vCPU / 2GB)` — **not recommended** for this project
- `Medium TDX (2 vCPU / 4GB)` — **recommended for dev / testnet / MVP**
- `Large TDX (4 vCPU / 8GB)` — **recommended default for production**
- `XLarge TDX (8 vCPU / 16GB)` — only if you expect high throughput or heavier compute bursts
- `2XLarge TDX (16 vCPU / 32GB)` — unnecessary for the current codebase

## Practical recommendation

- **If you are deploying testnet first:** choose `Medium TDX`
- **If you want one-shot safer production headroom:** choose `Large TDX`

For your current codebase, I recommend:

- **`Medium TDX` to start now**
- **upgrade to `Large TDX` when you begin sustained production traffic or heavier compute usage**

## Why not Small

`Small TDX` is too tight because one CVM will be running:

- a long-lived HTTP worker
- a long-lived relayer loop
- Node runtime overhead
- relayer state persistence
- future provider config / relayer ops / retry queues

2GB RAM leaves very little operational margin.

## Deploy steps

### Option A — Phala Cloud UI native mode

Use the Dashboard `Deploy -> docker-compose.yml` flow and paste `deploy/phala/docker-compose.ui.yml`.

In the UI, add the same keys from `deploy/phala/morpheus.env.example` into **Encrypted Secrets**.

Recommended first deployment in the UI:

- CVM size: `Medium TDX`
- Guest image: `dstack-dev-*`
- Compose mode: `Advanced`
- Public service: `caddy` on port `80`
- Paste `deploy/phala/docker-compose.ui.yml`

### Option B — file-based compose in a dev/debug CVM

1. Build and push both images
2. Generate local env once from root `.env` if you want a practical starting file:

```bash
npm run render:phala-env
npm run check:phala-env
```

3. Copy `docker-compose.yml`, `morpheus.env`, and optionally `Caddyfile` into the CVM
4. Fill or review `morpheus.env` against `morpheus.env.example`
5. Start services:

```bash
docker compose -f docker-compose.yml up -d
```

If you want Caddy as the public edge proxy:

```bash
docker compose --profile edge -f docker-compose.yml up -d
```

5. Verify worker:

```bash
curl http://127.0.0.1:8080/health
```

6. Verify relayer metrics inside container:

```bash
docker exec -it morpheus-relayer npm --prefix workers/morpheus-relayer run metrics
```

## Encrypted Secrets checklist for UI mode

For the current `deploy/phala/docker-compose.ui.yml`, the Phala UI only needs these direct secrets:

- `MORPHEUS_PHALA_WORKER_IMAGE`
- `MORPHEUS_RELAYER_IMAGE`
- `PHALA_WORKER_PORT`
- `PHALA_SHARED_SECRET`
- `PHALA_API_TOKEN`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MORPHEUS_RUNTIME_CONFIG_JSON`

Everything else now lives inside `MORPHEUS_RUNTIME_CONFIG_JSON`.

Recommended flow:

```bash
npm run render:phala-env
npm run check:phala-env
```

Then copy only the direct keys above into Phala Dashboard Encrypted Secrets.

## Security notes

- keep the real env file only inside the CVM
- do not commit `morpheus.env`
- in UI mode, prefer Dashboard Encrypted Secrets over file-based envs
- use `Caddyfile` only for the public worker edge; keep relayer internal
- `PHALA_USE_DERIVED_KEYS=true` enables dstack-derived signing key fallback in the worker and relayer
- `PHALA_EMIT_ATTESTATION=true` enables optional quote attachment in worker responses when requested
- `PHALA_DSTACK_ORACLE_ENCRYPTION_KEY_PATH` controls the derived wrapping key path for the stable Oracle encryption key
- `PHALA_ORACLE_KEYSTORE_PATH` controls where the sealed Oracle RSA key is stored inside the CVM volume
- mount `/var/run/dstack.sock` so the dstack SDK can fetch info, quotes, and derived keys
- worker now supports a stable dstack-sealed Oracle public key instead of restart-random key material
- relayer now also supports derived-key signing fallback for N3 / NeoX fulfill transactions when explicit keys are omitted
