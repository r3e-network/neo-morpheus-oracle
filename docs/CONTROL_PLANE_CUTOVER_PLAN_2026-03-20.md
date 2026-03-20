# Control Plane Cutover Plan

## Strategy

Use a phased cutover so failures stay isolated to one class of route at a time.

All phases assume:

- `morpheus_control_plane_jobs` migration applied
- Cloudflare queues created
- control-plane worker deployed
- app backend deployed with internal control-plane routes
- Phala execution plane healthy

## Phase 0: Validation Only

- do **not** set `MORPHEUS_CONTROL_PLANE_URL` on the public web app yet
- call the control plane directly
- run:
  - `npm run check:control-plane`
  - `npm run test:control-plane`
  - `npm run smoke:control-plane`

Exit criteria:

- control-plane smoke reaches `succeeded`

## Phase 1: Oracle Query

Enable:

- `/api/oracle/query`

Validation:

- submit one public builtin provider query
- confirm `202 Accepted`
- confirm job status transitions:
  - `queued`
  - `dispatched`
  - `processing`
  - `succeeded`

Rollback:

- remove `MORPHEUS_CONTROL_PLANE_URL`

## Phase 2: Smart Fetch + Compute

Enable:

- `/api/oracle/smart-fetch`
- `/api/compute/execute`

Validation:

- public smart fetch
- encrypted smart fetch
- builtin compute

Watch:

- job terminal status distribution
- queue retry count
- backend route error rates

## Phase 3: NeoDID

Enable:

- `/api/neodid/bind`
- `/api/neodid/action-ticket`
- `/api/neodid/recovery-ticket`

Validation:

- public bind
- encrypted ref bind
- action ticket
- recovery ticket

Watch:

- encrypted ref resolution success
- callback status timings

## Phase 4: Feed

Enable:

- `/api/cron/feed`

Validation:

- trigger one feed tick manually
- confirm `feed_tick` job reaches `succeeded`
- confirm Phala execution plane still updates chain feed data

Watch:

- feed tick queue lag
- feed tick retry rate
- pricefeed freshness

## Phase 5: Callback + Automation

Enable operational use of:

- `callback_broadcast`
- `automation_execute`

Validation:

- enqueue callback broadcast job manually
- enqueue automation execute job manually
- confirm internal backend routes work under control plane

Watch:

- chain broadcast error rate
- automation queue throughput
- duplicate execution behavior

## Success Condition

When all phases succeed:

- public ingress and scheduling/orchestration are outside the CVM
- Phala CVM is reduced to confidential execution
- rollback remains simple by removing `MORPHEUS_CONTROL_PLANE_URL`
