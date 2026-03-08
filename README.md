# neo-morpheus-oracle

**Morpheus Oracle / 墨菲斯网络** is a standalone privacy Oracle network for the Neo ecosystem.

Morpheus is the mentor who gives Neo the truth pill in *The Matrix*.
This project gives the Neo blockchain the same thing: **truth**.

## Core Modules

- **Privacy Oracle** — fetches private or public external data inside Phala TEE
- **Privacy Compute** — runs built-in high-cost compute functions and programmable scripts
- **Datafeed** — publishes signed market data and feed snapshots
- **Relay + Signing** — signs and relays responses for both **Neo N3** and **Neo X**

## Runtime Model

- **Frontend / control plane**: Next.js, deployable to Vercel
- **State / auth / encrypted secret storage**: Supabase
- **Trusted execution**: Phala TEE worker
- **Chains**: Neo N3 + Neo X

## Project Layout

- `apps/web` — Vercel-ready Next.js frontend and API proxy layer
- `workers/phala-worker` — Phala TEE worker runtime
- `contracts` — Neo N3 and Neo X Morpheus oracle + callback + datafeed contracts
- `packages/shared` — shared types and chain metadata
- `supabase/migrations` — schema, RLS policies, and built-in compute catalog seeds
- `docs` — architecture, async privacy Oracle spec, and deployment notes
- `scripts` — operational helpers such as publishing Oracle public keys on-chain

## Built-in Compute Functions

The Morpheus compute module ships with built-in functions that users can call directly:

- `hash.sha256`
- `math.modexp`
- `matrix.multiply`
- `vector.cosine_similarity`
- `zkp.public_signal_hash`
- `zkp.proof_digest`
- `fhe.batch_plan`
- `fhe.noise_budget_estimate`

These are intended as the first layer of built-ins; you can later plug in external ZKP/FHE runtimes behind the same function registry.

## Quick Start

```bash
npm install
cp .env.development.example .env.local
npm --prefix workers/phala-worker test
npm --prefix apps/web run dev
```

## Docs

- `docs/ARCHITECTURE.md`
- `docs/ASYNC_PRIVACY_ORACLE_SPEC.md`
- `docs/BUILTIN_COMPUTE.md`
- `docs/DEPLOYMENT.md`
- `docs/TESTNET_RUNBOOK.md`
