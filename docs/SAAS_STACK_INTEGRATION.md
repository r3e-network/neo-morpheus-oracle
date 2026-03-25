# SaaS Stack Integration

This repository already uses or is prepared to use the following managed services:

1. Cloudflare Workers + Queues
2. Upstash Redis
3. Sentry
4. Checkly

## What Is Already Wired

### Cloudflare

- Edge gateway worker:
  - [deploy/cloudflare/morpheus-edge-gateway/worker.mjs](/Users/jinghuiliao/git/neo-morpheus-oracle/deploy/cloudflare/morpheus-edge-gateway/worker.mjs)
- Control plane worker:
  - [deploy/cloudflare/morpheus-control-plane/worker.mjs](/Users/jinghuiliao/git/neo-morpheus-oracle/deploy/cloudflare/morpheus-control-plane/worker.mjs)
- Queue bindings:
  - `morpheus-oracle-request`
  - `morpheus-feed-tick`
  - `morpheus-callback-broadcast`
  - `morpheus-automation-execute`
- Example Wrangler config:
  - [deploy/cloudflare/morpheus-control-plane/wrangler.example.toml](/Users/jinghuiliao/git/neo-morpheus-oracle/deploy/cloudflare/morpheus-control-plane/wrangler.example.toml)
  - [deploy/cloudflare/morpheus-edge-gateway/wrangler.example.toml](/Users/jinghuiliao/git/neo-morpheus-oracle/deploy/cloudflare/morpheus-edge-gateway/wrangler.example.toml)

### Upstash

- Phala worker request guards:
  - [workers/phala-worker/src/platform/upstash.js](/Users/jinghuiliao/git/neo-morpheus-oracle/workers/phala-worker/src/platform/upstash.js)
  - [workers/phala-worker/src/platform/request-guards.js](/Users/jinghuiliao/git/neo-morpheus-oracle/workers/phala-worker/src/platform/request-guards.js)
- Web app shared rate limit fallback:
  - [apps/web/lib/upstash.ts](/Users/jinghuiliao/git/neo-morpheus-oracle/apps/web/lib/upstash.ts)
  - [apps/web/lib/rate-limit.ts](/Users/jinghuiliao/git/neo-morpheus-oracle/apps/web/lib/rate-limit.ts)
- Cloudflare control plane env template already includes Upstash:
  - [deploy/cloudflare/morpheus-control-plane/vars.example.env](/Users/jinghuiliao/git/neo-morpheus-oracle/deploy/cloudflare/morpheus-control-plane/vars.example.env)

### Sentry

- Next.js web app instrumentation:
  - [apps/web/instrumentation.ts](/Users/jinghuiliao/git/neo-morpheus-oracle/apps/web/instrumentation.ts)
  - [apps/web/instrumentation-client.ts](/Users/jinghuiliao/git/neo-morpheus-oracle/apps/web/instrumentation-client.ts)
  - [apps/web/sentry.server.config.ts](/Users/jinghuiliao/git/neo-morpheus-oracle/apps/web/sentry.server.config.ts)
  - [apps/web/sentry.edge.config.ts](/Users/jinghuiliao/git/neo-morpheus-oracle/apps/web/sentry.edge.config.ts)
  - [apps/web/.env.example](/Users/jinghuiliao/git/neo-morpheus-oracle/apps/web/.env.example)

## What You Still Need To Provide

### Cloudflare

Required if you want Codex to finish worker deployment and route binding:

- `CLOUDFLARE_API_TOKEN`
  - Needs permissions for Workers, Queues, Routes, and Zone DNS updates for the target zone.
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_ZONE_ID`
- The target hostname plan:
  - `control.meshmini.app`
  - `edge.meshmini.app`
  - any additional `*.meshmini.app` worker routes you want bound

Optional but recommended:

- Separate deploy token for production
- Separate deploy token for test environment

### Upstash Redis

Required if you want shared cross-instance rate limits, idempotency, or cached request guards:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Current code paths that use it:

- Phala worker request guards
- fixed-window rate limit
- idempotent response cache
- replay lock suppression

### Sentry

Required for runtime error + tracing collection:

- `NEXT_PUBLIC_SENTRY_DSN`
  - browser events
- `SENTRY_DSN`
  - server / route handler / edge events

Recommended for sourcemaps and release management:

- `SENTRY_ORG`
- `SENTRY_PROJECT`
- `SENTRY_AUTH_TOKEN`
- `SENTRY_ENVIRONMENT`
- `SENTRY_TRACES_SAMPLE_RATE`

### Checkly

Scaffolded monitoring definitions live in:

- [monitoring/checkly/README.md](/Users/jinghuiliao/git/neo-morpheus-oracle/monitoring/checkly/README.md)
- [monitoring/checkly/checks.example.json](/Users/jinghuiliao/git/neo-morpheus-oracle/monitoring/checkly/checks.example.json)
- current account introspection script:
  - [scripts/checkly-list-checks.mjs](/Users/jinghuiliao/git/neo-morpheus-oracle/scripts/checkly-list-checks.mjs)
- current API check seeding script:
  - [scripts/checkly-sync-api-checks.mjs](/Users/jinghuiliao/git/neo-morpheus-oracle/scripts/checkly-sync-api-checks.mjs)

Needed if you want Codex to wire deployment automation for browser/API checks:

- `CHECKLY_API_KEY`
- `CHECKLY_ACCOUNT_ID`
- `CHECKLY_PROJECT_NAME`
- target URLs for:
  - AA frontend
  - oracle web frontend
  - control plane health
  - edge gateway health

## Recommended Rollout Order

1. Cloudflare Workers + Queues
2. Upstash Redis
3. Sentry
4. Checkly

## Official References

- Cloudflare Queues: https://developers.cloudflare.com/queues/
- Cloudflare Durable Objects: https://developers.cloudflare.com/durable-objects/
- Upstash Redis: https://upstash.com/docs/redis/overall/getstarted
- Sentry for Next.js: https://docs.sentry.io/platforms/javascript/guides/nextjs/
- Checkly docs: https://www.checklyhq.com/docs/
