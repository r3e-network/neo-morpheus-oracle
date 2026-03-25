# Morpheus Control Plane

Cloudflare Worker fronting the first two layers of the refactor:

1. stateless control plane
2. durable orchestration ingress

The confidential execution plane remains on the existing Phala CVM.

## Responsibilities

- expose `/mainnet/*` and `/testnet/*` async ingress routes
- validate/authenticate requests before dispatch
- persist job envelopes into `morpheus_control_plane_jobs`
- send core confidential-execution jobs to Cloudflare Queues
- send callback/automation orchestration jobs to Cloudflare Workflows
- expose `GET /<network>/jobs/<job_id>` for status polling
- expose `POST /<network>/jobs/recover` for operator-driven recovery of stale jobs

## Current Delivery Model

Implemented routes:

- `POST /<network>/oracle/query`
- `POST /<network>/oracle/smart-fetch`
- `POST /<network>/compute/execute`
- `POST /<network>/neodid/bind`
- `POST /<network>/neodid/action-ticket`
- `POST /<network>/neodid/recovery-ticket`
- `POST /<network>/feeds/tick`
- `POST /<network>/callbacks/broadcast`
- `POST /<network>/automation/execute`
- `GET /<network>/jobs/<job_id>`
- `POST /<network>/jobs/recover`
- `GET /<network>/health`

This worker does **not** replace the Phala CVM. It only owns ingress,
durability, orchestration, and dispatch.

Current runtime split:

- queue-backed:
  - `oracle_request`: forwards supported execution routes to the
  existing confidential execution plane
  - `feed_tick`: forwards feed-sync execution to the confidential execution plane
- workflow-backed:
  - `callback_broadcast`: durable workflow around signed callback broadcast
  - `automation_execute`: durable workflow around automation queueing

The older queue-based callback/automation path has been removed. These two
lanes now use Workflows directly to reduce custom retry code and shrink the
operational surface area.

## Recovery Model

The control plane treats delivery as recoverable instead of assuming a single
successful pass:

- retryable execution/backend failures move jobs back to `queued`
- `run_after` is persisted with exponential backoff plus jitter
- queue consumers skip non-stale `processing` jobs to avoid duplicate execution
- workflow-backed jobs use Cloudflare Workflow state as the first recovery
  signal before a new instance is dispatched
- stale `processing` jobs and overdue `queued` jobs can be recovered with
  `POST /<network>/jobs/recover`

This is mainly for post-outage recovery. A typical operator flow is:

```bash
curl -X POST \
  -H "authorization: Bearer $MORPHEUS_CONTROL_PLANE_API_KEY" \
  https://control.meshmini.app/testnet/jobs/recover
```

The response includes `scanned`, `requeued_count`, `skipped_count`, and
`failed_count`.

## Required Bindings

- `MORPHEUS_ORACLE_REQUEST_QUEUE`
- `MORPHEUS_FEED_TICK_QUEUE`
- `CALLBACK_BROADCAST_WORKFLOW`
- `AUTOMATION_EXECUTE_WORKFLOW`

## Required Secrets

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`

Optional:

- `MORPHEUS_CONTROL_PLANE_API_KEY`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `MORPHEUS_MAINNET_EXECUTION_BASE_URL`
- `MORPHEUS_TESTNET_EXECUTION_BASE_URL`
- `MORPHEUS_EXECUTION_TOKEN`
- `MORPHEUS_MAINNET_RELAYER_NEO_N3_WIF` or `MORPHEUS_MAINNET_RELAYER_NEO_N3_PRIVATE_KEY`
- `MORPHEUS_TESTNET_RELAYER_NEO_N3_WIF` or `MORPHEUS_TESTNET_RELAYER_NEO_N3_PRIVATE_KEY`
- `MORPHEUS_APP_BACKEND_URL`
- `MORPHEUS_APP_BACKEND_TOKEN`
- `MORPHEUS_CONTROL_PLANE_REQUEUE_LIMIT`
- `MORPHEUS_CONTROL_PLANE_STALE_PROCESSING_MS`
- `MORPHEUS_CONTROL_PLANE_RETRY_BASE_SECONDS`
- `MORPHEUS_CONTROL_PLANE_RETRY_MAX_SECONDS`

Example env template:

- [vars.example.env](/Users/jinghuiliao/git/neo-morpheus-oracle/deploy/cloudflare/morpheus-control-plane/vars.example.env)
- [wrangler.meshmini.toml](/Users/jinghuiliao/git/neo-morpheus-oracle/deploy/cloudflare/morpheus-control-plane/wrangler.meshmini.toml)

Current production route target:

- `https://control.meshmini.app`

Validation helper:

- `npm run check:control-plane` (required bindings only)
- `npm run check:control-plane:strict` (full production configuration)
- `npm run test:control-plane`
