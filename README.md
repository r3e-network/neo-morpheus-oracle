# neo-morpheus-oracle

**Morpheus Oracle / 墨菲斯网络** is a standalone privacy Oracle network for the Neo ecosystem.

Morpheus is the mentor who gives Neo the truth pill in *The Matrix*.
This project gives the Neo blockchain the same thing: **truth**.

## Core Modules

- **Privacy Oracle** — fetches private or public external data inside Phala TEE
- **Privacy Compute** — runs built-in high-cost compute functions and programmable scripts
- **Datafeed** — operator-synchronized on-chain market data stored as integer cents
- **Paymaster** — policy-gated sponsorship authorization for AA / relayer / bundler integrations
- **Relay + Signing** — currently productionized for **Neo N3**

## Runtime Model

- **Frontend / control plane**: Next.js, deployable to Vercel
- **State / auth / encrypted secret storage**: Supabase
- **Trusted execution**: Phala TEE worker
  - **Mainnet CVM**: `966f16610bdfe1794a503e16c5ae0bc69a1d92f1`
  - **Mainnet endpoint**: [https://966f16610bdfe1794a503e16c5ae0bc69a1d92f1-80.dstack-pha-prod9.phala.network](https://966f16610bdfe1794a503e16c5ae0bc69a1d92f1-80.dstack-pha-prod9.phala.network)
  - **Testnet CVM**: `28294e89d490924b79c85cdee057ce55723b3d56`
  - **Testnet endpoint**: [https://28294e89d490924b79c85cdee057ce55723b3d56-3000.dstack-pha-prod9.phala.network](https://28294e89d490924b79c85cdee057ce55723b3d56-3000.dstack-pha-prod9.phala.network)
- **Chains**: Neo N3 is the active supported runtime path right now. Neo X artifacts remain in-repo but are not the active production target.

## Network Registry

- `config/networks/mainnet.json` is the canonical mainnet registry.
- `config/networks/testnet.json` is the canonical testnet registry.
- `phala.mainnet.toml` targets the mainnet Phala CVM.
- `phala.testnet.toml` targets the testnet Phala CVM.
- `deploy/phala/morpheus.mainnet.env` and `deploy/phala/morpheus.testnet.env` are generated ignored local runtime env files.

## Production Usage Model

- End users use Oracle and Compute through on-chain requests plus callback fulfillment.
- Datafeed sync is operator-only. User contracts read the synchronized on-chain feed state directly.
- Request fee is `0.01 GAS`-equivalent per request.
- Neo N3 supports prepaid request credits, including contract-sponsored fee payment.
- Neo X requires the exact request fee in `msg.value`.

## Project Layout

- `apps/web` — Vercel-ready Next.js frontend and API proxy layer
- `workers/phala-worker` — Phala TEE worker runtime
- `workers/morpheus-relayer` — async chain listener and callback relayer for Neo N3 + Neo X
- `contracts` — Neo N3 and Neo X Morpheus oracle + callback + datafeed contracts
- `packages/shared` — shared types and chain metadata
- `supabase/migrations` — schema, RLS policies, and built-in compute catalog seeds
- `docs` — architecture, async privacy Oracle spec, and deployment notes
- `scripts` — operational helpers such as publishing Oracle public keys on-chain

## Built-in Compute Functions

The Morpheus compute module ships with a built-in catalog that users can call directly through `/compute/functions` and `/compute/execute`.
It covers hashes, RSA verification, modular arithmetic, matrix/vector operations, Merkle roots, ZKP planning/digests, FHE planning, and privacy helpers.
It now also includes Groth16 verification helpers plus a dedicated `zkp.zerc20.single_withdraw.verify` preflight helper for privacy-transaction circuits.

These are intended as the first layer of built-ins; you can later plug in external ZKP/FHE runtimes behind the same function registry.

Paymaster note:

- `paymaster/authorize` is a separate sponsorship service.
- It is not tied to any specific ZKP circuit.
- zERC20 proof verification is available as a standalone compute builtin and can be composed into app-specific sponsorship policy outside the paymaster core.

Built-in providers now include `twelvedata`, `binance-spot`, and `coinbase-spot`.

## Quick Start

```bash
npm install
cp .env.development.example .env.local
npm --prefix workers/phala-worker test
npm --prefix workers/morpheus-relayer test
npm --prefix apps/web run dev
```

## Docs

- `docs/ARCHITECTURE.md`
- `docs/USER_GUIDE.md`
- `docs/ASYNC_PRIVACY_ORACLE_SPEC.md`
- `docs/BUILTIN_COMPUTE.md`
- `docs/PAYMASTER.md`
- `docs/EXAMPLES.md` — bilingual end-to-end calling patterns for Oracle, Compute, encrypted params, WASM, and pricefeeds
- `docs/PROVIDERS.md`
- `docs/RELAYER.md`
- `docs/DEPLOYMENT.md`
- `docs/ENVIRONMENT.md`
- `docs/ACCEPTANCE_REPORT_2026-03-10.md`
- `docs/TESTNET_RUNBOOK.md`
- `docs/SECURITY_AUDIT.md`
- `docs/ATTESTATION_SPEC.md`
- `docs/HPKE_X25519_MIGRATION.md`
- `deploy/phala/README.md`
- verifier page: `/verifier`
- verifier demo API: `/api/attestation/demo`
