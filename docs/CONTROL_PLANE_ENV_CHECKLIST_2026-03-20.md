# Control Plane Env Checklist

## Cloudflare Worker

Public vars / bindings:

- `SUPABASE_URL`
- `UPSTASH_REDIS_REST_URL`
- `MORPHEUS_MAINNET_EXECUTION_BASE_URL`
- `MORPHEUS_TESTNET_EXECUTION_BASE_URL`
- `MORPHEUS_APP_BACKEND_URL`
- Queue bindings:
  - `MORPHEUS_ORACLE_REQUEST_QUEUE`
  - `MORPHEUS_FEED_TICK_QUEUE`
  - `MORPHEUS_CALLBACK_BROADCAST_QUEUE`
  - `MORPHEUS_AUTOMATION_EXECUTE_QUEUE`

Secrets:

- `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`
- `MORPHEUS_CONTROL_PLANE_API_KEY`
- `MORPHEUS_EXECUTION_TOKEN`
- `MORPHEUS_APP_BACKEND_TOKEN`
- `UPSTASH_REDIS_REST_TOKEN`

## App Backend

Must remain configured with:

- current Supabase service-role credentials
- current Phala execution URL/token
- Neo N3 updater/relayer signer material
- Neo X updater/relayer signer material if Neo X remains enabled
- `MORPHEUS_CONTROL_PLANE_URL`
- `MORPHEUS_CONTROL_PLANE_API_KEY`

Routes that require backend availability:

- `/api/internal/control-plane/feed-tick`
- `/api/internal/control-plane/callback-broadcast`
- `/api/internal/control-plane/automation-execute`
- `/api/control-plane/jobs/:jobId`

## Phala Execution Plane

Must remain configured with:

- worker public base URL
- auth token accepted by the worker
- current signer identities
- stable oracle transport key

Current execution-facing routes used by the control plane:

- `/oracle/query`
- `/oracle/smart-fetch`
- `/compute/execute`
- `/neodid/bind`
- `/neodid/action-ticket`
- `/neodid/recovery-ticket`

## Validation Commands

- `npm run check:control-plane`
- `npm run test:control-plane`
- `npm run smoke:control-plane`
