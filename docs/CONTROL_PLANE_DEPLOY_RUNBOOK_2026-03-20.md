# Control Plane Deploy Runbook

## Goal

Deploy the first production-ready version of the four-layer architecture while
keeping the confidential execution plane on the existing Phala CVM.

## Layers

1. Cloudflare Workers: control plane
2. Cloudflare Queues: orchestration
3. Supabase: durable state
4. Phala CVM: confidential execution

## Prerequisites

- existing Phala public execution URLs for both networks
- existing app/backend deployment for the internal Node routes
- Supabase service-role credentials
- Cloudflare account with Workers + Queues enabled

## 1. Apply Database Migration

Apply:

- [0010_control_plane_jobs.sql](/Users/jinghuiliao/git/neo-morpheus-oracle/supabase/migrations/0010_control_plane_jobs.sql)

Verify:

- `morpheus_control_plane_jobs` exists
- indexes exist
- `select` policy exists

## 2. Create Cloudflare Queues

Create these queues:

- `morpheus-oracle-request`
- `morpheus-feed-tick`
- `morpheus-callback-broadcast`
- `morpheus-automation-execute`

Use:

- [wrangler.example.toml](/Users/jinghuiliao/git/neo-morpheus-oracle/deploy/cloudflare/morpheus-control-plane/wrangler.example.toml)

## 3. Configure Cloudflare Control Plane

Deploy:

- [worker.mjs](/Users/jinghuiliao/git/neo-morpheus-oracle/deploy/cloudflare/morpheus-control-plane/worker.mjs)
- [vars.example.env](/Users/jinghuiliao/git/neo-morpheus-oracle/deploy/cloudflare/morpheus-control-plane/vars.example.env)
- [wrangler.meshmini.toml](/Users/jinghuiliao/git/neo-morpheus-oracle/deploy/cloudflare/morpheus-control-plane/wrangler.meshmini.toml)

Required vars:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`
- `MORPHEUS_CONTROL_PLANE_API_KEY`
- `MORPHEUS_MAINNET_EXECUTION_BASE_URL`
- `MORPHEUS_TESTNET_EXECUTION_BASE_URL`
- `MORPHEUS_EXECUTION_TOKEN`
- `MORPHEUS_APP_BACKEND_URL`
- `MORPHEUS_APP_BACKEND_TOKEN`

Optional:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

## 4. Deploy App Backend Routes

The app backend must expose these internal routes:

- [feed-tick route](/Users/jinghuiliao/git/neo-morpheus-oracle/apps/web/app/api/internal/control-plane/feed-tick/route.ts)
- [callback-broadcast route](/Users/jinghuiliao/git/neo-morpheus-oracle/apps/web/app/api/internal/control-plane/callback-broadcast/route.ts)
- [automation-execute route](/Users/jinghuiliao/git/neo-morpheus-oracle/apps/web/app/api/internal/control-plane/automation-execute/route.ts)
- [job status route](/Users/jinghuiliao/git/neo-morpheus-oracle/apps/web/app/api/control-plane/jobs/[jobId]/route.ts)

These routes require a backend environment that still has:

- current Neo N3 / Neo X signer material
- current Phala execution URL/token
- current Supabase service-role credentials

## 5. Cutover Flags

Set on the web app/backend:

- `MORPHEUS_CONTROL_PLANE_URL`
- `MORPHEUS_CONTROL_PLANE_API_KEY`

Once these are present, these public routes stop calling Phala directly and
start returning `202 Accepted` async job records instead:

- `/api/oracle/query`
- `/api/oracle/smart-fetch`
- `/api/compute/execute`
- `/api/neodid/bind`
- `/api/neodid/action-ticket`
- `/api/neodid/recovery-ticket`
- `/api/cron/feed`

## 6. Verification Sequence

Verify in this order:

1. `GET /testnet/health` on the control plane worker
2. `POST /testnet/oracle/query` on the control plane worker directly
3. confirm a `morpheus_control_plane_jobs` row is created with status `dispatched`
4. confirm the queue consumer updates the same row to `succeeded` or `failed`
5. verify `GET /api/control-plane/jobs/:jobId`
6. switch web `MORPHEUS_CONTROL_PLANE_URL`
7. verify `/api/oracle/query`
8. verify `/api/cron/feed`
9. verify callback broadcast and automation-execute job creation manually

Smoke helper:

- [smoke-control-plane.mjs](/Users/jinghuiliao/git/neo-morpheus-oracle/scripts/smoke-control-plane.mjs)
- command: `npm run smoke:control-plane`

Local mock test:

- [worker.test.mjs](/Users/jinghuiliao/git/neo-morpheus-oracle/deploy/cloudflare/morpheus-control-plane/worker.test.mjs)
- command: `npm run test:control-plane`

Required env for the smoke:

- `MORPHEUS_CONTROL_PLANE_URL`
- `MORPHEUS_CONTROL_PLANE_API_KEY` or `MORPHEUS_OPERATOR_API_KEY`
- `MORPHEUS_NETWORK`

Config validation helper:

- [check-control-plane-env.mjs](/Users/jinghuiliao/git/neo-morpheus-oracle/scripts/check-control-plane-env.mjs)
- command: `npm run check:control-plane`

## 7. Rollback

Immediate rollback:

- remove `MORPHEUS_CONTROL_PLANE_URL` from the web/backend env

Effect:

- public API routes fall back to direct Phala execution
- control plane jobs already enqueued can continue independently

## 8. Current Scope

This rollout does **not** remove the Phala confidential execution plane.

Current behavior:

- scheduling/orchestration move outward
- confidential execution remains on Phala
- chain-specific SDK/broadcast logic remains in backend Node routes
