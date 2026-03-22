# MeshMini Workspace Context (Oracle + AA + Miniapps)

This document is a single “resume point” for the MeshMini workspace. It inventories:

- repos + responsibilities
- public domains/routes
- external services (Cloudflare/Upstash/Supabase/TEE runtime)
- environment variables (names, scopes, where to set them)
- validation commands / regression entrypoints

## Security Rules (Read First)

- This doc intentionally **does not include raw secret values** (WIFs, API tokens, private keys, service-role keys, etc.).
- Store secret values in a secrets manager (1Password/Bitwarden/etc) and in platform secret stores:
  - Cloudflare Worker secrets (for Workers)
  - Vercel environment variables (for Vercel apps)
  - local `.env` files **never committed**
- If you need a single local document that includes values, generate the gitignored file:
  - `node scripts/generate-workspace-context-values.mjs`
  - output: `private-backups/WORKSPACE_CONTEXT_VALUES.md`
- When sharing context with a new engineer/LLM, share only:
  - this doc
  - the **names** of required secrets
  - and provide the secret values through your normal secure channel.

## Repositories

Local paths (typical dev workspace):

- `neo-morpheus-oracle`
  - Oracle system: control plane (Cloudflare Workers), durable ingress queues (Cloudflare Queues), app backend + UI (Vercel/Next.js), and the confidential execution plane (TEE worker runtime).
- `neo-abstract-account`
  - Abstract Account contracts + UI + server routes for relaying/ops, plus SDK test matrix.
- `neo-miniapps-platform`
  - Miniapps host platform + admin console + individual miniapps; integrates AA + oracle services.

## Public Domains / Routing

### Cloudflare Workers (Oracle)

This workspace uses **one hostname** + explicit network prefixes:

- `/mainnet/...`
- `/testnet/...`

Current recommended hostnames (Cloudflare Worker routes):

- `edge.meshmini.app/*`
  - Edge gateway in front of the confidential execution plane origins.
- `control.meshmini.app/*`
  - Control plane async ingress + durable queue orchestration + job status polling.

### Origin targets (behind the edge gateway)

Origins can be:

- TEE runtime (confidential execution plane) origin
- app backend origin (public web + admin surfaces)

These are configured as worker vars (non-secret) and can be rotated without code changes.

## Architecture: Four-Layer Model (Current Target)

1. **Serverless Control Plane** (Cloudflare Workers)
   - API ingress, auth, validation, rate limiting, health, job enqueue, job status query.
2. **Durable Queue / Orchestration** (Cloudflare Queues)
   - `oracle-request`, `feed-tick`, `callback-broadcast`, `automation-execute`
   - retry/backoff/dead-letter strategy
   - guarantees “do not drop requests”
3. **Durable State** (Supabase)
   - request records, encrypted refs, automation jobs, relayer jobs, feed snapshots, execution logs
4. **Confidential Execution Plane** (TEE worker runtime)
   - encrypted param decryption
   - NeoDID private payload execution
   - confidential compute
   - confidential signing + attested results

Rule of thumb:

- **Scheduling never enters TEE**
- **Execution enters TEE only when confidentiality is required**

## External Services Inventory

### Cloudflare

Used for:

- Workers (`morpheus-edge-gateway`, `morpheus-control-plane`)
- Queues (durable ingress)
- DNS for `meshmini.app` subdomains
- optional Turnstile verification

Operational notes:

- Use Cloudflare API tokens for CI/deploy automation, but prefer `wrangler` secret auth.
- Keep mainnet/testnet routed by path prefixes, not separate CVMs.

### Upstash Redis (REST)

Used for:

- edge gateway rate limit backing store (REST API)
- AA rate limiting / durability helpers (server routes)

Variables:

- `UPSTASH_REDIS_REST_URL` (non-secret)
- `UPSTASH_REDIS_REST_TOKEN` (secret)

### Supabase

Used for:

- durable state store across oracle + miniapps + AA ops
- service-role writes only on trusted server surfaces / workers

Variables:

- `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` (URL)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public anon key)
- `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY` (server secret)

### TEE Runtime Provider

This workspace keeps confidential execution on the existing TEE runtime.

Common variables:

- `PHALA_APP_ID`
- `PHALA_API_URL` / `MORPHEUS_RUNTIME_URL`
- `PHALA_API_TOKEN` / `PHALA_SHARED_SECRET` / `MORPHEUS_RUNTIME_TOKEN`

## Environment Variables (Full Inventory)

This section lists env var names and where they must be configured.

Legend:

- **CF Worker Secret**: set via `wrangler secret put ...` or dashboard secret store
- **CF Worker Var**: set in `wrangler.*.toml` `[vars]`
- **Vercel Env**: set on the Vercel project environment
- **Local Env**: `.env` file for local runs only

### 1) Oracle: Cloudflare Edge Gateway (`deploy/cloudflare/morpheus-edge-gateway`)

Where:

- vars: `deploy/cloudflare/morpheus-edge-gateway/wrangler.*.toml`
- route: `edge.meshmini.app/*`

Required:

- (CF Worker Var) `MORPHEUS_ORIGIN_URL`
- (CF Worker Var) `MORPHEUS_MAINNET_ORIGIN_URL`
- (CF Worker Var) `MORPHEUS_TESTNET_ORIGIN_URL`
- (CF Worker Secret) `MORPHEUS_ORIGIN_TOKEN`

Optional:

- (CF Worker Secret) `TURNSTILE_SECRET_KEY` (Turnstile verification)
- (CF Worker Var) `UPSTASH_REDIS_REST_URL`
- (CF Worker Secret) `UPSTASH_REDIS_REST_TOKEN`
- (CF native binding) `MORPHEUS_RATE_LIMITER` (Cloudflare native rate limiter, if enabled)

Notes:

- Unified routing uses `/mainnet/...` and `/testnet/...`.
- Safe GET caching is enabled for endpoints like `/health`, `/providers`, `/feeds/catalog`, `/feeds/price/*`, `/oracle/public-key`.

### 2) Oracle: Cloudflare Control Plane (`deploy/cloudflare/morpheus-control-plane`)

Where:

- vars: `deploy/cloudflare/morpheus-control-plane/wrangler.*.toml`
- route: `control.meshmini.app/*`

Bindings (required):

- `MORPHEUS_ORACLE_REQUEST_QUEUE`
- `MORPHEUS_FEED_TICK_QUEUE`
- `MORPHEUS_CALLBACK_BROADCAST_QUEUE`
- `MORPHEUS_AUTOMATION_EXECUTE_QUEUE`

Required secrets:

- (CF Worker Var) `SUPABASE_URL`
- (CF Worker Secret) `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`

Optional secrets/vars:

- (CF Worker Secret) `MORPHEUS_CONTROL_PLANE_API_KEY` (protect ingress)
- (CF Worker Var) `UPSTASH_REDIS_REST_URL`
- (CF Worker Secret) `UPSTASH_REDIS_REST_TOKEN`
- (CF Worker Var) `MORPHEUS_MAINNET_EXECUTION_BASE_URL`
- (CF Worker Var) `MORPHEUS_TESTNET_EXECUTION_BASE_URL`
- (CF Worker Secret) `MORPHEUS_EXECUTION_TOKEN`
- (CF Worker Secret) `MORPHEUS_MAINNET_RELAYER_NEO_N3_WIF` or `MORPHEUS_MAINNET_RELAYER_NEO_N3_PRIVATE_KEY`
- (CF Worker Secret) `MORPHEUS_TESTNET_RELAYER_NEO_N3_WIF` or `MORPHEUS_TESTNET_RELAYER_NEO_N3_PRIVATE_KEY`
- (CF Worker Var) `MORPHEUS_APP_BACKEND_URL`
- (CF Worker Secret) `MORPHEUS_APP_BACKEND_TOKEN`
- (CF Worker Var) `MORPHEUS_CONTROL_PLANE_URL`

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

Validation helpers:

- `npm run check:control-plane` (required bindings + Supabase only)
- `npm run check:control-plane:strict` (full production config)

### 3) Oracle: App Backend + Web UI (`apps/web`)

Where:

- deployed to Vercel (Next.js)
- used by control plane consumers to broadcast txs, run feed sync, and enqueue automation

Browser/public:

- (Vercel Env) `NEXT_PUBLIC_SUPABASE_URL`
- (Vercel Env) `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- (Vercel Env) `NEXT_PUBLIC_APP_NAME` (optional)
- (Vercel Env) `NEXT_PUBLIC_APP_URL` (optional)
- (Vercel Env) `NEXT_PUBLIC_MORPHEUS_CONTROL_PLANE_URL` (optional; defaults to `https://control.meshmini.app` in prod)
- (Vercel Env) `NEXT_PUBLIC_MORPHEUS_RUNTIME_URL` (optional; can be `https://edge.meshmini.app/<network>`)

Server-only:

- (Vercel Env) `SUPABASE_URL` (optional if `NEXT_PUBLIC_SUPABASE_URL` is set)
- (Vercel Env) `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`
- (Vercel Env) admin API keys (choose per surface):
  - `MORPHEUS_PROVIDER_CONFIG_API_KEY`
  - `MORPHEUS_RELAYER_ADMIN_API_KEY`
  - `MORPHEUS_SIGNING_ADMIN_API_KEY`
  - `MORPHEUS_RELAY_ADMIN_API_KEY`
  - `MORPHEUS_OPERATOR_API_KEY`
  - `ADMIN_CONSOLE_API_KEY`
- (Vercel Env) runtime/auth:
  - `MORPHEUS_RUNTIME_URL` (or network-scoped `MORPHEUS_RUNTIME_URL_MAINNET` / `_TESTNET`)
  - `MORPHEUS_RUNTIME_TOKEN` (or `PHALA_API_TOKEN` / `PHALA_SHARED_SECRET`)
  - `PHALA_API_URL` (optional alias)
- (Vercel Env) chain config:
  - `MORPHEUS_NETWORK` / `NEXT_PUBLIC_MORPHEUS_NETWORK` (default `mainnet`)
  - `NEO_RPC_URL`
  - `NEOX_RPC_URL`
  - `NEOX_CHAIN_ID`
- (Vercel Env) feeds:
  - `MORPHEUS_FEED_PROJECT_SLUG`
  - `MORPHEUS_FEED_PROVIDER`

### 4) Oracle: Confidential Execution Plane (TEE runtime)

The TEE runtime environment is managed outside Vercel/Cloudflare and is passed into the runtime as env.

Authoritative template:

- `deploy/phala/morpheus.env.example`

High-signal keys (non-exhaustive; see template for full list):

- Network + RPC:
  - `MORPHEUS_NETWORK` (`mainnet` / `testnet`)
  - `NEO_RPC_URL`
  - `NEO_NETWORK_MAGIC`
  - `NEOX_RPC_URL`
  - `NEOX_CHAIN_ID`
- N3 / NeoX signers (secrets):
  - `PHALA_NEO_N3_WIF` or `PHALA_NEO_N3_PRIVATE_KEY`
  - `MORPHEUS_RELAYER_NEO_N3_WIF` or `MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY`
  - `PHALA_NEOX_PRIVATE_KEY` (NeoX)
  - `MORPHEUS_RELAYER_NEOX_PRIVATE_KEY`
- Oracle verifier signer (async fulfillment signing):
  - `MORPHEUS_ORACLE_VERIFIER_WIF` / `MORPHEUS_ORACLE_VERIFIER_PRIVATE_KEY`
  - `PHALA_ORACLE_VERIFIER_WIF` / `PHALA_ORACLE_VERIFIER_PRIVATE_KEY` (aliases)
- Contract addresses/hashes:
  - `CONTRACT_MORPHEUS_ORACLE_HASH` (Neo N3)
  - `CONTRACT_ORACLE_CALLBACK_CONSUMER_HASH` (Neo N3)
  - `CONTRACT_MORPHEUS_DATAFEED_HASH` (Neo N3)
  - `CONTRACT_MORPHEUS_ORACLE_X_ADDRESS` (NeoX)
  - `CONTRACT_ORACLE_CALLBACK_CONSUMER_X_ADDRESS` (NeoX)
  - `CONTRACT_MORPHEUS_DATAFEED_X_ADDRESS` (NeoX)
- Providers:
  - `TWELVEDATA_API_KEY`
  - `WEB3AUTH_CLIENT_ID`
  - `WEB3AUTH_JWKS_URL` (defaults to Web3Auth JWKS)
- Reliability / queue guards:
  - `MORPHEUS_DURABLE_QUEUE_ENABLED`
  - `MORPHEUS_DURABLE_QUEUE_FAIL_CLOSED`
  - `MORPHEUS_DURABLE_QUEUE_SYNC_LIMIT`
  - `MORPHEUS_DURABLE_QUEUE_STALE_PROCESSING_MS`
  - `MORPHEUS_UPSTASH_GUARDS_ENABLED`
  - `MORPHEUS_UPSTASH_FAIL_CLOSED`
- Timeouts:
  - `ORACLE_TIMEOUT`
  - `ORACLE_SCRIPT_TIMEOUT_MS`
  - `ORACLE_WASM_TIMEOUT_MS`
  - `COMPUTE_SCRIPT_TIMEOUT_MS`
  - `COMPUTE_WASM_TIMEOUT_MS`
  - `MORPHEUS_WASM_TIMEOUT_MS`

### 5) Miniapps Platform (`neo-miniapps-platform`)

Primary env (host-app/admin-console):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_EDGE_URL` (Supabase edge base URL; optional)
- `NEO_RPC_URL`

Admin console auth/rate limit:

- `ADMIN_CONSOLE_API_KEY` (or `ADMIN_API_KEY`)
- `ADMIN_AUTH_RATE_LIMIT_WINDOW_SECONDS` (optional)
- `ADMIN_AUTH_MAX_REQUESTS` (optional)
- `MINIAPP_HOST_APP_BASE_URL` (or `HOST_APP_BASE_URL`)
- `NEXT_PUBLIC_ADMIN_CONSOLE_API_KEY` (or `NEXT_PUBLIC_ADMIN_API_KEY`)

Cross-repo testnet validation script (live on-chain regression):

- `AA_TEST_WIF`
- `ORACLE_TEST_WIF`
- `FLAGSHIP_LIVE_WIF`
- `NEO_TARGET_NETWORK=testnet`
- optional: `PAYMASTER_ACCOUNT_ID` (if stable allowlisted paymaster path is enabled)

If testnet GAS is insufficient, tx-based smokes will fail (this is a funded-account precondition, not a code issue).

### 6) Abstract Account (`neo-abstract-account`)

Browser/public (Vite):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_AA_RELAY_URL`
- `VITE_AA_RELAY_RPC_URL`
- `VITE_WEB3AUTH_CLIENT_ID`
- `VITE_WEB3AUTH_NETWORK` (example: `sapphire_mainnet`)

Server-only (Vercel functions or other server host):

- `SUPABASE_SERVICE_ROLE_KEY`
- `AA_RELAY_WIF`
- `AA_RELAY_RPC_URL`
- `AA_RELAY_ALLOWED_HASH` (pin to intended AA contract)
- `AA_RELAY_ALLOW_RAW_FORWARD` (default `0`)
- `AA_RELAY_INCLUDE_RAW_ERRORS` (optional)
- `WEB3AUTH_CLIENT_SECRET` (if used by your Web3Auth integration)
- durability/rate limit:
  - `UPSTASH_REDIS_REST_URL`
  - `UPSTASH_REDIS_REST_TOKEN`
- DID notifications (optional):
  - `DID_EMAIL_WEBHOOK_URL`, `DID_EMAIL_WEBHOOK_TOKEN`
  - `DID_SMS_WEBHOOK_URL`, `DID_SMS_WEBHOOK_TOKEN`
- Morpheus integration (optional; if AA talks to oracle runtime/control-plane):
  - `MORPHEUS_NETWORK` / `VITE_MORPHEUS_NETWORK`
  - `MORPHEUS_RUNTIME_URL` / `MORPHEUS_API_BASE_URL` / `MORPHEUS_EDGE_BASE_URL`
  - `MORPHEUS_RUNTIME_TOKEN` / `PHALA_API_TOKEN` / `PHALA_SHARED_SECRET`
  - `MORPHEUS_PAYMASTER_ENDPOINT` / `AA_PAYMASTER_ENDPOINT`
  - `MORPHEUS_PAYMASTER_API_TOKEN` / `AA_PAYMASTER_API_TOKEN`

SDK live validation:

- `TEST_WIF` (dedicated funded Neo testnet account)
- `TESTNET_RPC_URL` (optional; defaults to public testnet RPC)

## Secrets Checklist (Fill from Your Vault)

Cloudflare deploy:

- `CLOUDFLARE_API_TOKEN` (or equivalent `wrangler` auth)
- `CLOUDFLARE_DNS_API_TOKEN` (if you run the Phala ingress + DNS updater flows)

Supabase:

- `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY`

Upstash:

- `UPSTASH_REDIS_REST_TOKEN`

Turnstile (optional):

- `TURNSTILE_SITE_KEY` (public, used by frontends embedding the widget)
- `TURNSTILE_SECRET_KEY`

Email (optional):

- `RESEND_API_KEY`

Neo / NeoX signers:

- `NEO_TESTNET_WIF`
- `MORPHEUS_MAINNET_RELAYER_NEO_N3_WIF`
- `MORPHEUS_TESTNET_RELAYER_NEO_N3_WIF`
- `MORPHEUS_ORACLE_VERIFIER_WIF`
- `PHALA_NEOX_PRIVATE_KEY`
- `AA_RELAY_WIF`
- `AA_TEST_WIF` / `ORACLE_TEST_WIF` / `FLAGSHIP_LIVE_WIF`

TEE runtime access:

- `PHALA_API_TOKEN` / `PHALA_SHARED_SECRET` (or `MORPHEUS_RUNTIME_TOKEN`)

Feed providers:

- `TWELVEDATA_API_KEY`

## Regression / Validation Commands

### Oracle (`neo-morpheus-oracle`)

- `npm test`
- `npm run lint`
- `npm run check:control-plane`
- `npm run check:control-plane:strict`
- `npm run build` (includes web build)
- NeoX contracts:
  - `npm run test:contracts:neox` (or the repo’s Hardhat test command)

### Miniapps Platform (`neo-miniapps-platform`)

- `npm test`
- `npm run build` (host-app)
- `npm run build` (admin-console)
- `bash deploy/scripts/verify_cross_repo_testnet.sh` (live testnet regression; requires funded WIFs)

### Abstract Account (`neo-abstract-account`)

- `npm test`
- `npm run build`
- `cd sdk/js && TEST_WIF=... node tests/v3_testnet_validation_suite.mjs`
