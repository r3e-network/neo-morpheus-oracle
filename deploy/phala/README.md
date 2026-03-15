# Phala CVM Deployment

This folder contains the recommended first-stage deployment layout for `neo-morpheus-oracle` on **Phala Confidential VM**.

For a bilingual explanation of the important environment variables, see:

- `docs/ENVIRONMENT.md`

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

Use two CVMs:

- **testnet validation CVM**: `Small TDX`
- **mainnet production CVM**: `Medium TDX`

Current recorded app ids:

- testnet CVM: `28294e89d490924b79c85cdee057ce55723b3d56`
- mainnet CVM: `966f16610bdfe1794a503e16c5ae0bc69a1d92f1`
- testnet public endpoint: `https://28294e89d490924b79c85cdee057ce55723b3d56-3000.dstack-pha-prod9.phala.network`
- mainnet public endpoint: `https://966f16610bdfe1794a503e16c5ae0bc69a1d92f1-80.dstack-pha-prod9.phala.network`

Tracked launcher files:

- `phala.testnet.toml`
- `phala.mainnet.toml`

## Why Small is acceptable for testnet but not mainnet

For production, `Small TDX` is too tight because one CVM will be running:

- a long-lived HTTP worker
- a long-lived relayer loop
- Node runtime overhead
- relayer state persistence
- future provider config / relayer ops / retry queues

2GB RAM leaves very little operational margin.

For isolated testnet validation, `Small TDX` is acceptable because:

- lower throughput is fine
- temporary relayer state is disposable
- it keeps attack simulation and noisy test logs away from production

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
2. Generate dedicated env files:

```bash
npm run render:phala-env
npm run render:phala-env:testnet
npm run render:phala-env:mainnet
npm run check:phala-env
```

Notes:

- `npm run render:phala-env` is the mainnet alias
- testnet should use `deploy/phala/morpheus.testnet.env`
- mainnet should use `deploy/phala/morpheus.mainnet.env`
- relayer state is now split by network and start block as `/data/.morpheus-relayer-state.<network>.<start-block>.json`

3. Copy `docker-compose.yml`, the selected generated env file (`morpheus.mainnet.env` or `morpheus.testnet.env`), and optionally `Caddyfile` into the CVM
4. Fill or review the selected env file against `morpheus.env.example`
5. Start services:

```bash
MORPHEUS_LOCAL_ENV_FILE=./morpheus.mainnet.env docker compose --env-file ./morpheus.mainnet.env -f docker-compose.yml up -d
```

For testnet, replace `morpheus.mainnet.env` with `morpheus.testnet.env`.

If you want Caddy as the public edge proxy:

```bash
MORPHEUS_LOCAL_ENV_FILE=./morpheus.mainnet.env docker compose --env-file ./morpheus.mainnet.env --profile edge -f docker-compose.yml up -d
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
- `MORPHEUS_PUBLIC_PORT`
- `PHALA_WORKER_PORT`
- `PHALA_SHARED_SECRET`
- `PHALA_API_TOKEN`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MORPHEUS_RUNTIME_CONFIG_JSON`

Everything else now lives inside `MORPHEUS_RUNTIME_CONFIG_JSON`.

`MORPHEUS_PUBLIC_PORT` should stay aligned with the exposed dstack app URL. The default public mapping is `3000 -> caddy:80`.

Recommended flow:

```bash
npm run render:phala-env
npm run check:phala-env
```

For testnet validation, set `MORPHEUS_NETWORK=testnet` before `npm run check:phala-env` or pass `PHALA_ENV_FILE=deploy/phala/morpheus.testnet.env`.

Then copy only the direct keys above into Phala Dashboard Encrypted Secrets.

## Security notes

- keep the real env file only inside the CVM
- do not commit `morpheus.mainnet.env` or `morpheus.testnet.env`
- in UI mode, prefer Dashboard Encrypted Secrets over file-based envs
- use `Caddyfile` only for the public worker edge; keep relayer internal
- `PHALA_USE_DERIVED_KEYS=true` enables dstack-derived signing key fallback in the worker and relayer
- `PHALA_EMIT_ATTESTATION=true` enables optional quote attachment in worker responses when requested
- `PHALA_DSTACK_ORACLE_ENCRYPTION_KEY_PATH` controls the derived wrapping key path for the stable Oracle X25519 transport key
- `PHALA_ORACLE_KEYSTORE_PATH` controls where the sealed Oracle transport key is stored inside the CVM volume
- `WEB3AUTH_CLIENT_ID` and `WEB3AUTH_JWKS_URL` should be included in `MORPHEUS_RUNTIME_CONFIG_JSON` if NeoDID uses `provider = "web3auth"` and verifies JWTs inside the TEE
- mount `/var/run/dstack.sock` so the dstack SDK can fetch info, quotes, and derived keys
- file-based compose should be launched with both `MORPHEUS_LOCAL_ENV_FILE=...` and `--env-file ...` so the selected generated env file is used for container env injection and Compose interpolation
- worker now supports a stable dstack-sealed Oracle public key instead of restart-random key material
- relayer now also supports derived-key signing fallback for N3 / NeoX fulfill transactions when explicit keys are omitted
