# AA / confidential execution-runtime edge migration — RUNBOOK

**Status: deployable artifacts prepared, NOT deployed.** Nothing here is live until an
operator with Cloudflare + DNS + TLS access runs the steps below.

## What this migrates (and what it does not)

The Cloudflare control plane (`control.meshmini.app`,
`deploy/cloudflare/morpheus-control-plane`) dispatches **confidential
execution-plane** jobs to an execution runtime base URL. Today that base URL list is
`oracle.meshmini.app → edge.meshmini.app → <phala>`, and **all three are dead or the
Vercel `emergency-vercel-runtime` placeholder** (`phala_runtime_control_plane_disabled`)
— so every execution-plane lane is degraded.

This migration makes the **AWS Nitro box the execution runtime**, so the compute runs
**in-TEE** (the enclave worker), replacing Phala/Vercel.

Covered (the control plane's `EXECUTION_PLANE_ROUTES` /
`JOB_ROUTE_CONFIG` → `MORPHEUS_ORACLE_REQUEST_QUEUE`):
`/oracle/query`, `/oracle/smart-fetch`, `/compute/execute`, `/neodid/bind`,
`/neodid/action-ticket`, `/neodid/recovery-ticket`.

**Not covered by this migration** (separate paths — verify independently):
- `/feeds/tick` — feeds are already pushed on-chain by the box feed-pusher (in-TEE).
- `/callbacks/broadcast`, `/automation/execute` — route to `MORPHEUS_APP_BACKEND_URL`
  (the Vercel Next.js app), not the execution runtime.
- **AA paymaster / gasless relay** (gas-sponsor, aa-relay-console) — there is **no
  `/paymaster` route in the control plane**; that path is app-backend/chain-direct.
  The AA *contracts* are live on-chain, so contract-interaction AA apps already work.

## Prerequisites
- `CLOUDFLARE_API_TOKEN` for the `morpheus-control-plane` worker (account
  `bf0d7e814f69945157f30505e9fba9fe`), with `wrangler`.
- DNS control for a runtime hostname (recommended: `runtime.meshmini.app`).
- A TLS cert for that hostname on the box.
- SSM access to the box (`i-0c52851f134db20ee`).
- **Decision:** this exposes the enclave's 6 execution-plane routes publicly (auth-gated).
  The nginx gateway (`runtime-gateway.nginx.conf`) refuses everything else.

## Steps (ordered — each gates the next)

### 1. Build + deploy the execution-plane-capable enclave (maintenance window)
The passthrough (`EXECUTION_PLANE_PASSTHROUGH` in `enclave-server.mjs`) is a **new
EIF** → new PCRs. Build it on the box:
```
cd /opt/morpheus/neo-morpheus-oracle && git pull
MORPHEUS_RELEASE=oracle-enclave-exec-<date> bash deploy/nitro/build-enclave-eif.sh --verify-reproducible
```
Record PCR0/1/2 → commit a new `deploy/nitro/measurements/<release>.json` (the
attestation verifier serves it). EXPECTED PCR0 (this commit): `__FILL_AFTER_BUILD__`.

Cut over (same staged pattern as the original cutover): point
`MORPHEUS_NITRO_EIF` in `/opt/morpheus/nitro/morpheus-nitro.env` at the new EIF and
`systemctl restart morpheus-nitro-signer` (the egress + provision services re-run;
brief mainnet signing pause, relayer retries cover it). **Rollback:** repoint
`MORPHEUS_NITRO_EIF` to `morpheus-nitro-signer.eif` (current) and restart.

### 2. Stand up the public gateway on the box
```
cp deploy/nitro/runtime-gateway.nginx.conf /etc/nginx/conf.d/morpheus-runtime.conf
certbot certonly --nginx -d runtime.meshmini.app   # or install your cert at the paths in the conf
nginx -t && systemctl reload nginx
```
The gateway proxies ONLY the 6 execution routes (+ /health, /attestation) to the
existing host bridge `127.0.0.1:8787` → vsock → enclave. (No new box port is exposed
beyond 443.)

### 3. Execution token
The enclave auth-gates the passthrough with its provisioned trusted tokens
(`MORPHEUS_RUNTIME_TOKEN` / `NITRO_API_TOKEN`, already provisioned). Set the control
plane's `MORPHEUS_EXECUTION_TOKEN` (wrangler secret) to that same token so its
`Authorization: Bearer` is accepted:
```
cd deploy/cloudflare/morpheus-control-plane && wrangler secret put MORPHEUS_EXECUTION_TOKEN
```

### 4. DNS
Point `runtime.meshmini.app` → the box public IP (`32.199.39.216`). Verify:
```
curl -s https://runtime.meshmini.app/health
curl -s -X POST https://runtime.meshmini.app/mainnet/oracle/smart-fetch \
  -H "authorization: Bearer <execution-token>" -H 'content-type: application/json' \
  -d '{"symbol":"BTC/USD"}'
```

### 5. Re-point the control plane (config already staged)
`wrangler.meshmini.toml` already sets `MORPHEUS_{MAINNET,TESTNET}_EXECUTION_BASE_URL =
https://runtime.meshmini.app/{network}`. Deploy:
```
cd deploy/cloudflare/morpheus-control-plane && wrangler deploy --config wrangler.meshmini.toml
```
Validate: submit an oracle HTTP request through the control plane and confirm it is
fulfilled via the box (the box's egress proxy logs the provider fetch).

### 6. Retire the Vercel placeholder
Once execution flows through the box, disable / re-point the
`apps/web/app/api/emergency-runtime` placeholder so `oracle.meshmini.app` /
`edge.meshmini.app` no longer report `degraded`.

## Per-lane notes (validate after deploy)
- `/oracle/smart-fetch`, `/oracle/query`: need provider egress — already wired
  (the enclave egress proxy + allowlist). Should work out of the box.
- `/neodid/*`: the salt is provisioned (see provision-enclave-compute.sh), but
  **web3auth verification additionally needs `WEB3AUTH_CLIENT_ID`** (not on the box —
  supply it via the provision env if neodid web3auth is required).
- `/compute/execute`: gated by `MORPHEUS_ENABLE_UNTRUSTED_SCRIPTS` (off by default).
- The worker's result-signing for these lanes uses the provisioned signer keys; if a
  lane returns unsigned/`success:false` on "key" errors, extend
  `provision-enclave-compute.sh` to provision that lane's key (same pattern as the
  decrypt key).
