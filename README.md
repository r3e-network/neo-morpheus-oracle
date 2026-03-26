# neo-morpheus-oracle

`neo-morpheus-oracle` is a Neo N3-first confidential oracle stack. The current production design keeps ingress, orchestration, and durability outside the TEE, and reserves confidential VMs for execution only.

## Current Design

1. **Cloudflare edge gateway**
   - public edge entry
   - cache for safe GET routes
   - optional abuse controls
2. **Cloudflare control plane**
   - `POST /mainnet/*` and `POST /testnet/*` ingress
   - auth, validation, rate limit, recovery
   - Cloudflare Queues for `oracle_request` and `feed_tick`
   - Cloudflare Workflows for `callback_broadcast` and `automation_execute`
3. **Supabase durable state**
   - request records
   - control-plane jobs
   - relayer jobs
   - automation runs
   - feed snapshots
   - encrypted refs and operation logs
4. **Confidential execution plane**
   - **Oracle CVM**: `oracle-morpheus-neo-r3e` / `ddff154546fe22d15b65667156dd4b7c611e6093`
   - **DataFeed CVM**: `datafeed-morpheus-neo-r3e` / `28294e89d490924b79c85cdee057ce55723b3d56`
   - Oracle handles confidential request/response work for both mainnet and testnet
   - DataFeed is isolated so continuous price updates are never blocked by slower request workloads

## Canonical Endpoints

- Oracle runtime:
  - `https://oracle.meshmini.app/mainnet`
  - `https://oracle.meshmini.app/testnet`
- Edge gateway:
  - `https://edge.meshmini.app/mainnet`
  - `https://edge.meshmini.app/testnet`
- Control plane:
  - `https://control.meshmini.app/mainnet`
  - `https://control.meshmini.app/testnet`
- Oracle attestation explorer:
  - `https://cloud.phala.com/explorer/app_ddff154546fe22d15b65667156dd4b7c611e6093`
- DataFeed attestation explorer:
  - `https://cloud.phala.com/explorer/app_28294e89d490924b79c85cdee057ce55723b3d56`

## Active Scope

- Neo N3 is the active supported production path.
- Neo X code remains in-repo as archived reference material only.
- Network selection is path-based and config-based, not CVM-based.
- Pricefeeds are operator-driven and highest priority.
- Oracle and compute requests are asynchronous and callback-based.

## Network Registry

- `config/networks/mainnet.json` is the canonical mainnet registry.
- `config/networks/testnet.json` is the canonical testnet registry.
- `phala.request-hub.toml` points to the Oracle CVM launcher.
- `phala.feed-hub.toml` points to the DataFeed CVM launcher.
- `deploy/phala/morpheus.mainnet.env` and `deploy/phala/morpheus.testnet.env` are generated local env files and must remain uncommitted.

## Repository Layout

- `apps/web` — Next.js dashboard, docs, explorer, and backend routes used by the control plane
- `workers/phala-worker` — confidential execution runtime
- `workers/morpheus-relayer` — on-chain async bridge and callback relayer
- `deploy/cloudflare` — edge gateway and control-plane workers
- `contracts` — Neo N3 contracts plus Neo X reference artifacts
- `supabase/migrations` — schema, policies, control-plane jobs, relayer durability
- `docs` — canonical architecture, deployment, operations, validation, and specs
- `scripts` — deployment, verification, SaaS sync, and operator helpers

## Built-In Compute

The compute catalog currently exposes built-ins for:

- hashes and signature verification
- modular arithmetic and matrix/vector math
- Merkle helpers
- ZKP planning and Groth16 verification helpers
- FHE planning helpers
- privacy masking and noise helpers

The catalog is designed so additional runtimes can be added later without changing the on-chain request model.

## Quick Start

```bash
npm install
cp .env.development.example .env.local
npm run test:worker
npm run test:relayer
npm run dev:web
```

## Core Verification Commands

```bash
npm run test:worker
npm run test:relayer
npm run test:control-plane
npm run build:web
npm run smoke:control-plane
npm run smoke:n3
npm run check:signers
MORPHEUS_NETWORK=testnet npm run verify:n3
```

Targeted regression commands:

```bash
npm run examples:test:n3:callback-boundary
npm run examples:test:n3:neodid-registry-boundary
npm run examples:test:n3:neodid-registry-v1
npm run examples:test:n3:encrypted-ref-boundary
npm run examples:test:n3:fulfillment-replay
npm run examples:test:n3:aa-session-oracle-boundary
npm run examples:test:n3:attack-regression
```

## Documentation

- `docs/ARCHITECTURE.md`
- `docs/DEPLOYMENT.md`
- `docs/OPERATIONS.md`
- `docs/VALIDATION.md`
- `docs/ENVIRONMENT.md`
- `docs/ASYNC_PRIVACY_ORACLE_SPEC.md`
- `docs/ATTESTATION_SPEC.md`
- `docs/USER_GUIDE.md`
- `docs/RELAYER.md`
- `docs/PROVIDERS.md`
- `docs/PAYMASTER.md`
- `docs/BUILTIN_COMPUTE.md`
- `docs/EXAMPLES.md`
- `docs/SECURITY_AUDIT.md`
- `docs/SAAS_STACK_INTEGRATION.md`
- `docs/PHALA_DUAL_CVM_ATTESTATION_REGISTRY.md`
- `deploy/phala/README.md`
- verifier UI: `/verifier`
- verifier demo API: `/api/attestation/demo`
