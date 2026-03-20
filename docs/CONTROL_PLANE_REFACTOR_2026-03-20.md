# Control Plane Refactor

## Target Topology

1. Cloudflare Workers: stateless control plane
2. Cloudflare Queues: durable queue ingress and orchestration
3. Supabase: durable state
4. Phala CVM: confidential execution plane

The confidential execution plane remains on the current Phala CVM. This refactor
only moves request ingress, queueing, and job-state tracking out of the CVM.

## First Slice Implemented

- Added `morpheus_control_plane_jobs` durable state table
- Added Cloudflare Worker scaffold under:
  - [worker.mjs](/Users/jinghuiliao/git/neo-morpheus-oracle/deploy/cloudflare/morpheus-control-plane/worker.mjs)
- Added queue ingress documentation and Wrangler example
- Added feature-flagged dispatch support in the Next.js API layer for:
  - `/api/oracle/query`
  - `/api/oracle/smart-fetch`
  - `/api/compute/execute`
  - `/api/neodid/bind`
  - `/api/neodid/action-ticket`
  - `/api/neodid/recovery-ticket`
- Added `GET /api/control-plane/jobs/:jobId` as a unified status endpoint for
  the new async control-plane job model
- Added the first queue consumer:
  - `oracle_request` now forwards supported execution routes to the current
    Phala confidential execution plane
- Added internal Node-backed backend routes for:
  - callback broadcasting
  - automation execution
- Added queue consumers for:
  - `feed_tick`
  - `callback_broadcast`
  - `automation_execute`

## Feature Flags

The web app stays backward-compatible by default.

When `MORPHEUS_CONTROL_PLANE_URL` is **not** configured:

- routes continue to call Phala directly

When `MORPHEUS_CONTROL_PLANE_URL` **is** configured:

- supported execution routes enqueue async jobs through the control plane
- responses become `202 Accepted` job records instead of immediate compute output

## Next Slices

1. Add queue consumers for:
2. Patch consumers to update `morpheus_control_plane_jobs`
3. Move callback broadcasting and automation scheduling off the CVM
4. Keep only confidential execution and attested signing inside the Phala CVM

## Intentional Non-Goals in This Slice

- no change to on-chain contracts
- no change to existing Phala confidential execution routes
- no attempt to remove the current relayer yet
- no frontend UX migration to async job polling yet
