# Morpheus Workflows Scaffold

This folder contains a first-stage Cloudflare Workflows scaffold for moving
control-plane orchestration away from ad-hoc queue/retry state handling.

## Initial migration targets

These are the safest first workflows to move:

1. `callback_broadcast`
2. `automation_execute`

Why these first:

- they are orchestration-heavy
- they have clear success/failure terminal states
- they benefit from durable retries
- they are less risky than the primary `oracle_request` execution path

## Current intent

The scaffold here is not a hard cutover. It is designed to coexist with the
existing control-plane queue flow while you validate:

- Workflow instance creation
- idempotent instance IDs
- step retries
- backend invocation semantics
- status inspection

## Files

- [worker.ts](/Users/jinghuiliao/git/neo-morpheus-oracle/deploy/cloudflare/morpheus-workflows/worker.ts)
- [wrangler.example.toml](/Users/jinghuiliao/git/neo-morpheus-oracle/deploy/cloudflare/morpheus-workflows/wrangler.example.toml)

## Suggested rollout

1. Deploy this as a separate Worker
2. Trigger test instances manually
3. Compare workflow results with the current queue-based implementation
4. Add a feature flag in the existing control-plane to route only selected jobs into Workflows
5. Once stable, reduce the amount of custom `run_after` / `retry_count` / `recover` logic

## Design notes

- Non-idempotent side effects stay inside `step.do(...)`
- Workflow instance IDs should be derived from stable job IDs
- Existing Supabase job records can remain as the system-of-record while Workflows act as the durable execution engine
- Existing backend endpoints are reused to minimize migration risk
