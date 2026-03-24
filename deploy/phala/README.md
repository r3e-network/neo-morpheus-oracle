# Phala CVM Deployment

This folder contains the recommended first-stage deployment layout for `neo-morpheus-oracle` on **Phala Confidential VM**.

For a bilingual explanation of the important environment variables, see:

- `docs/ENVIRONMENT.md`

## Recommended topology

Use **2 role-specialized CVMs**:

- `feed hub` CVM
  - `mainnet-feed-worker`
  - `mainnet-feed-relayer`
  - `testnet-feed-worker`
  - `testnet-feed-relayer`
- `request hub` CVM
  - `mainnet-request-worker`
  - `mainnet-request-relayer`
  - `testnet-request-worker`
  - `testnet-request-relayer`
  - `request-router`
  - `dstack-ingress`

This keeps `pricefeed` isolated from slower request/response workflows while still maximizing utilization across just two CVMs.

## Which CVM size to choose

From the TDX sizes shown in your console:

- `Small TDX (1 vCPU / 2GB)` — only for narrow isolated validation, not a stable shared environment
- `Medium TDX (2 vCPU / 4GB)` — acceptable for light dev or temporary test workloads
- `Large TDX (4 vCPU / 8GB)` — current production baseline
- `XLarge TDX (8 vCPU / 16GB)` — only if you expect high throughput or heavier compute bursts
- `2XLarge TDX (16 vCPU / 32GB)` — unnecessary for the current codebase

## Practical recommendation

Use the existing two CVMs by **role**, not by network:

- **feed hub / small CVM**: `28294e89d490924b79c85cdee057ce55723b3d56`
- **request hub / large CVM**: `ddff154546fe22d15b65667156dd4b7c611e6093`

Public routing:

- request hub public domain: `https://morpheus.meshmini.app`
- mainnet public path via request hub: `https://morpheus.meshmini.app/mainnet`
- testnet public path via request hub: `https://morpheus.meshmini.app/testnet`
- Cloudflare edge routes:
  - `https://edge.meshmini.app/mainnet/*`
  - `https://edge.meshmini.app/testnet/*`
  - `https://morpheus-testnet.meshmini.app/*`

Tracked launcher files:

- `phala.request-hub.toml`
- `phala.feed-hub.toml`

## Capacity Profiles

Do not extrapolate production capacity directly from testnet results.

Mainnet currently runs on a materially stronger CVM profile than testnet, so:

- testnet measurements are the lower-bound safety floor
- mainnet measurements must be collected separately and treated as the real operating envelope

For production, `Small TDX` is too tight because one CVM will be running:

- a long-lived HTTP worker
- a long-lived relayer loop
- Node runtime overhead
- relayer state persistence
- future provider config / relayer ops / retry queues

2GB RAM leaves very little operational margin.

For the feed hub, `Small TDX` is acceptable because:

- pricefeed is periodic and predictable
- it avoids request/response bursts starving feed updates
- it keeps continuous market data isolated from heavier interactive flows

## Deploy steps

### Option A — Phala Cloud UI native mode

Use the Dashboard `Deploy -> docker-compose.yml` flow and paste `deploy/phala/docker-compose.ui.yml`.

For the official Phala custom-domain route, use:

- `deploy/phala/docker-compose.ingress.ui.yml`
- split-relayer UI route: `deploy/phala/docker-compose.ui.split-relayer.yml`
- split-relayer + ingress UI route: `deploy/phala/docker-compose.ingress.ui.split-relayer.yml`

In the UI, add the same keys from `deploy/phala/morpheus.env.example` into **Encrypted Secrets**.

Recommended deployment now:

- feed hub:
  - launcher: `phala.feed-hub.toml`
  - compose: `deploy/phala/docker-compose.feed-hub.yml`
- request hub:
  - launcher: `phala.request-hub.toml`
  - compose: `deploy/phala/docker-compose.request-hub.yml`

When updating an existing Phala CVM with `phala deploy`, keep using `deploy/phala/docker-compose.ui.yml` together with `-e deploy/phala/morpheus.<network>.env`. That path injects the env values directly as encrypted secrets. The file-based `deploy/phala/docker-compose.yml` expects a real env file inside the CVM (`./morpheus.<network>.env`) and will fail on restart if you only pass the env file to `phala deploy` without copying it into the guest filesystem.

### Option B — file-based compose in a dev/debug CVM

1. Build and push both images
2. Generate dedicated env files:

```bash
npm run render:phala-env
npm run render:phala-env:testnet
npm run render:phala-env:mainnet
npm run render:phala-hub-env
npm run check:signers
npm run check:phala-env
```

Notes:

- `npm run render:phala-env` is the mainnet alias
- `npm run check:signers` audits the pinned Neo N3 identities across `.env`, `morpheus.testnet.env`, and `morpheus.mainnet.env`
- testnet should use `deploy/phala/morpheus.testnet.env`
- mainnet should use `deploy/phala/morpheus.mainnet.env`
- dual-role hubs should use `deploy/phala/morpheus.hub.env`
- relayer state is now split by network and start block as `/data/.morpheus-relayer-state.<network>.<start-block>.json`
- `MORPHEUS_RELAYER_MODE` supports `combined`, `feed_only`, and `requests_only`; the hub topology runs `feed_only` on the feed CVM and `requests_only` on the request CVM
- `MORPHEUS_RELAYER_INSTANCE_ID` can be set explicitly; otherwise the relayer derives `mode:network:hostname:pid` for durable-queue claim tracing
- durable chain-request queueing now defaults to `MORPHEUS_DURABLE_QUEUE_ENABLED=true` and `MORPHEUS_DURABLE_QUEUE_FAIL_CLOSED=true`, so fresh chain events are persisted to Supabase before the relayer advances checkpoints
- `pricefeed` now also bootstraps from `morpheus_feed_snapshots` when local feed-state files are empty; snapshot writes stay best-effort so a transient Supabase issue does not block chain price updates
- the async Oracle callback path asks the worker to sign fulfillment digests as `oracle_verifier`; renderers now include `MORPHEUS_ORACLE_VERIFIER_*` / `PHALA_ORACLE_VERIFIER_*` in the packed runtime config
- Neo N3 signer identities are pinned in `config/signer-identities.json`; role drift now fails validation instead of silently switching addresses
- testnet renderers default the verifier signer to `NEO_TESTNET_WIF` unless you explicitly set a dedicated verifier key, and they default `PHALA_USE_DERIVED_KEYS=false` so the explicit testnet signer is not shadowed by a dstack-derived key
- testnet renderers also default `MORPHEUS_RELAYER_NEO_N3_SCAN_MODE=request_cursor` because the public testnet `n3index_notifications` feed can lag far behind the current tip

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

For the dual-hub topology:

```bash
phala deploy --cvm-id 28294e89d490924b79c85cdee057ce55723b3d56 --compose deploy/phala/docker-compose.feed-hub.yml -e deploy/phala/morpheus.hub.env --wait
phala deploy --cvm-id ddff154546fe22d15b65667156dd4b7c611e6093 --compose deploy/phala/docker-compose.request-hub.yml -e deploy/phala/morpheus.hub.env --wait
```

The request hub routes:

- `/` -> mainnet request worker
- `/mainnet/*` -> mainnet request worker
- `/testnet/*` -> testnet request worker

Cloudflare edge and control-plane configs should point both networks to the neutral request hub domain:

- mainnet: `https://morpheus.meshmini.app/mainnet`
- testnet: `https://morpheus.meshmini.app/testnet`

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
- `MORPHEUS_RUNTIME_TOKEN` or `PHALA_API_TOKEN`
- `PHALA_SHARED_SECRET`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MORPHEUS_RUNTIME_CONFIG_JSON`

Everything else now lives inside `MORPHEUS_RUNTIME_CONFIG_JSON`.

For `deploy/phala/docker-compose.ingress.ui.yml`, add these extra secrets:

- `CLOUDFLARE_DNS_API_TOKEN`
- `CERTBOT_EMAIL`
- `MORPHEUS_CUSTOM_DOMAIN`
- `MORPHEUS_INGRESS_PORT`
- `MORPHEUS_INGRESS_SET_CAA`

`MORPHEUS_PUBLIC_PORT` should stay aligned with the exposed dstack app URL. The default public mapping is `3000 -> caddy:80`.

Recommended flow:

```bash
npm run render:phala-env
npm run check:signers
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
- `MORPHEUS_ORACLE_VERIFIER_WIF` / `MORPHEUS_ORACLE_VERIFIER_PRIVATE_KEY` (or the `PHALA_*` aliases) define the Neo N3 signer used for async Oracle fulfillment signatures when you do not want to rely on the worker-signing fallback
- `WEB3AUTH_CLIENT_ID` and `WEB3AUTH_JWKS_URL` should be included in `MORPHEUS_RUNTIME_CONFIG_JSON` if NeoDID uses `provider = "web3auth"` and verifies JWTs inside the TEE
- mount `/var/run/dstack.sock` so the dstack SDK can fetch info, quotes, and derived keys
- file-based compose should be launched with both `MORPHEUS_LOCAL_ENV_FILE=...` and `--env-file ...` so the selected generated env file is used for container env injection and Compose interpolation
- worker now supports a stable dstack-sealed Oracle public key instead of restart-random key material
- relayer now also supports derived-key signing fallback for N3 / NeoX fulfill transactions when explicit keys are omitted
