# Morpheus Edge Gateway

Cloudflare Worker gateway for the public Morpheus execution surface.

## Responsibilities

- front public Oracle runtime endpoints
- publish the canonical public runtime catalog and runtime status contract on /api/runtime/catalog and /api/runtime/status
- apply Cloudflare-native rate limiting before origin traffic reaches the CVM
- optionally verify Turnstile on abuse-prone endpoints
- cache safe GET responses such as:
  - `/health`
  - `/providers`
  - `/feeds/catalog`
  - `/feeds/price/*`
  - `/oracle/public-key`

## Required bindings / vars

- `MORPHEUS_ORIGIN_URL`
- `MORPHEUS_MAINNET_ORIGIN_URL`
- `MORPHEUS_TESTNET_ORIGIN_URL`
- `MORPHEUS_ORIGIN_TOKEN`
- optional `TURNSTILE_SECRET_KEY`
- optional `MORPHEUS_RATE_LIMITER` native binding

## Recommended route placement

- public oracle / feed / vrf / paymaster / relay endpoints
- do not expose direct worker management endpoints publicly
- keep internal maintenance/admin surfaces behind Cloudflare Access or private origin networking

## Unified network routing

The gateway now supports a single public hostname with explicit network prefixes:

- `/mainnet/...`
- `/testnet/...`

Example:

- `/mainnet/health`
- `/testnet/health`
- `/mainnet/oracle/query`
- `/testnet/paymaster/authorize`
- `/mainnet/api/runtime/catalog`
- `/testnet/api/runtime/status`

Current public runtime domains:

- `oracle.meshmini.app/*`
- `edge.meshmini.app/*`

## Account / zone discovery

The current provided Cloudflare token was verified as active and can at minimum:

- read zones
- read workers
- edit workers

Observed accessible account id:

- `bf0d7e814f69945157f30505e9fba9fe`

Observed accessible zones:

- `meshmini.app`
- `n3index.dev`
