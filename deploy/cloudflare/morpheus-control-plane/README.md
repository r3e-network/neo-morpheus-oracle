# Morpheus Control Plane

Cloudflare Worker fronting the first two layers of the refactor:

1. stateless control plane
2. durable queue ingress

The confidential execution plane remains on the existing Phala CVM.

## Responsibilities

- expose `/mainnet/*` and `/testnet/*` async ingress routes
- validate/authenticate requests before enqueue
- persist job envelopes into `morpheus_control_plane_jobs`
- fan jobs into Cloudflare Queues
- expose `GET /<network>/jobs/<job_id>` for status polling

## Current First Slice

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
- `GET /<network>/health`

This worker does **not** replace the Phala worker. It only accepts jobs and
hands them to queue consumers. Consumers can continue to call the existing
Phala CVM endpoints.

Current consumer support:

- `oracle_request`: implemented, forwards supported execution routes to the
  existing confidential execution plane
- `feed_tick`: implemented, forwards feed-sync execution to the app backend
- `callback_broadcast`: implemented, forwards signed callback payloads to the
  app backend for chain broadcast
- `automation_execute`: implemented, forwards automation execution jobs to the
  app backend for queueing on-chain automation requests

## Required Bindings

- `MORPHEUS_ORACLE_REQUEST_QUEUE`
- `MORPHEUS_FEED_TICK_QUEUE`
- `MORPHEUS_CALLBACK_BROADCAST_QUEUE`
- `MORPHEUS_AUTOMATION_EXECUTE_QUEUE`

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
- `MORPHEUS_APP_BACKEND_URL`
- `MORPHEUS_APP_BACKEND_TOKEN`

Example env template:

- [vars.example.env](/Users/jinghuiliao/git/neo-morpheus-oracle/deploy/cloudflare/morpheus-control-plane/vars.example.env)
- [wrangler.meshmini.toml](/Users/jinghuiliao/git/neo-morpheus-oracle/deploy/cloudflare/morpheus-control-plane/wrangler.meshmini.toml)

Current production route target:

- `https://morpheus.meshmini.app/control`

Validation helper:

- `npm run check:control-plane`
