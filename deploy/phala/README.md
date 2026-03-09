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

## Security notes

- keep the real env file only inside the CVM
- do not commit `morpheus.env`
- use `Caddyfile` only for the public worker edge; keep relayer internal
- mount `/var/run/tappd.sock` so you can later integrate Phala attestation / derived keys
- current code is CVM-ready, but full `tappd` integration is still a next step
