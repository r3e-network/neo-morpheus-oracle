# Cloudflare Workflows Cutover

This document records the current production design after the control-plane
workflow cutover.

## Final Split

- Cloudflare Queues:
  - `oracle_request`
  - `feed_tick`
- Cloudflare Workflows:
  - `callback_broadcast`
  - `automation_execute`

## Why This Split

Queues remain on the core confidential-execution path because they are already
simple, fast, and close to the TEE runtime boundary.

Workflows own the orchestration-heavy lanes because they remove the most custom
code while improving durability:

- durable retries
- persisted instance state
- per-instance inspection
- smaller local recovery surface

## What Was Removed

The standalone `deploy/cloudflare/morpheus-workflows` scaffold and the old
queue-based callback/automation consumers were removed. The active design is a
single control-plane worker with native workflow bindings.

## Recovery Model

`POST /<network>/jobs/recover` now follows this order for workflow-backed jobs:

1. inspect the existing workflow instance if one is recorded
2. keep the existing instance when it is still active
3. mark the job succeeded when the workflow already completed
4. create a new workflow instance only when the old one is no longer usable

This keeps the control plane simple while avoiding unnecessary duplicate
dispatch.

## Source Of Truth

- Supabase remains the durable request ledger
- Cloudflare Workflows are the orchestration runtime
- Phala CVM remains the confidential execution plane

## Relevant Files

- [deploy/cloudflare/morpheus-control-plane/worker.mjs](/Users/jinghuiliao/git/neo-morpheus-oracle/deploy/cloudflare/morpheus-control-plane/worker.mjs)
- [deploy/cloudflare/morpheus-control-plane/workflow-runtime.mjs](/Users/jinghuiliao/git/neo-morpheus-oracle/deploy/cloudflare/morpheus-control-plane/workflow-runtime.mjs)
- [deploy/cloudflare/morpheus-control-plane/wrangler.example.toml](/Users/jinghuiliao/git/neo-morpheus-oracle/deploy/cloudflare/morpheus-control-plane/wrangler.example.toml)
- [deploy/cloudflare/morpheus-control-plane/README.md](/Users/jinghuiliao/git/neo-morpheus-oracle/deploy/cloudflare/morpheus-control-plane/README.md)
