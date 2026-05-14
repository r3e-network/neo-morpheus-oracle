# Morpheus Control Plane

Cloudflare Worker that owns the public control layer and durable orchestration layer for Morpheus. Confidential execution stays on the Phala CVMs.

The public route names remain compatibility-oriented, but internally this worker should be read as
the dispatch/orchestration layer for shared MiniApp OS module lanes.

## Responsibilities

- expose `/mainnet/*` and `/testnet/*` ingress routes
- validate/authenticate requests before dispatch
- persist job envelopes into `morpheus_control_plane_jobs`
- send execution-bound jobs to Cloudflare Queues
- send orchestration-heavy jobs to Cloudflare Workflows
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
    - kernel lane: `request_dispatch`
  - `feed_tick`: forwards feed-sync execution to the confidential execution plane
    - kernel lane: `shared_resource_sync`
- workflow-backed:
  - `callback_broadcast`: durable workflow around signed callback broadcast
    - kernel lane: `callback_adapter_broadcast`
  - `automation_execute`: durable workflow around automation queueing
    - kernel lane: `automation_orchestration`

The older queue-based callback and automation path is gone. These lanes now use native Workflows.

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

This is primarily for post-outage recovery. A typical operator flow is:

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
- `MORPHEUS_MAINNET_EXECUTION_BASE_URL` or shared `MORPHEUS_EXECUTION_BASE_URL`
- `MORPHEUS_TESTNET_EXECUTION_BASE_URL` or shared `MORPHEUS_EXECUTION_BASE_URL`
- `MORPHEUS_MAINNET_FEED_EXECUTION_BASE_URL` / `MORPHEUS_TESTNET_FEED_EXECUTION_BASE_URL`
  when `feed_tick` should execute on the dedicated DataFeed CVM instead of the request CVM
- `MORPHEUS_EXECUTION_TOKEN`
- Feed signer material can use dedicated feed, updater, or relayer env names. Preferred mainnet
  names are `MORPHEUS_UPDATER_NEO_N3_WIF_MAINNET` /
  `MORPHEUS_UPDATER_NEO_N3_PRIVATE_KEY_MAINNET`; testnet uses the `_TESTNET` suffix.
  Prefix-style names such as `MORPHEUS_MAINNET_UPDATER_NEO_N3_WIF` and shared
  `MORPHEUS_UPDATER_NEO_N3_WIF` / `MORPHEUS_RELAYER_NEO_N3_WIF` remain supported.
- `MORPHEUS_APP_BACKEND_URL`
- `MORPHEUS_APP_BACKEND_TOKEN`
- `MORPHEUS_CONTROL_PLANE_REQUEUE_LIMIT`
- `MORPHEUS_CONTROL_PLANE_STALE_PROCESSING_MS`
- `MORPHEUS_CONTROL_PLANE_RETRY_BASE_SECONDS`
- `MORPHEUS_CONTROL_PLANE_RETRY_MAX_SECONDS`

Example env template:

- [vars.example.env](./vars.example.env)
- [wrangler.meshmini.toml](./wrangler.meshmini.toml)

Current production target:

- `https://control.meshmini.app`

Validation helper:

- `npm run check:control-plane` (required bindings only)
- `npm run check:control-plane:strict` (full production configuration)
- `npm run test:control-plane`
