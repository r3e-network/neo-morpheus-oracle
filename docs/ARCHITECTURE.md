# Morpheus Oracle Architecture

## Topology

```text
[ Developer / User / Oracle Client ]
        |
        | 1. encrypts optional secret with Oracle public key
        v
[ Neo N3 / Neo X Contract ]
        |
        | 2. Request(... payload, callbackContract, callbackMethod)
        v
[ MorpheusOracle Event ]
        |
        | 3. dispatcher listens for OracleRequested
        v
[ Morpheus Dispatcher ]
        |
        | 4. forwards request to Phala worker
        v
[ Morpheus Phala Worker ]
  - privacy oracle
  - privacy compute
  - datafeed
  - vrf
  - signing / relay
        |
        | 5. returns derived result
        v
[ Dispatcher fulfills callback ]
        |
        | 6. fulfillRequest(...)
        v
[ User Contract Callback ]
```

## Modules

### 1. Privacy Oracle
- plain fetch
- private fetch with encrypted secret
- programmable fetch + compute
- Neo N3 + Neo X result envelopes

### 2. Privacy Compute
- built-in compute registry
- script execution for custom workloads
- intended extension point for ZKP and FHE backends

### 3. Datafeed
- signed price quote APIs
- Neo N3 and Neo X feed contract storage
- feed snapshots and telemetry stored in Supabase

### 4. Relay / Signing
- Neo N3 message signing and tx relay
- Neo X message signing and tx relay
- chain-aware output envelopes for callback use

## Deployment Model

- `apps/web` -> Vercel
- Supabase -> hosted Postgres / Auth / Storage
- `workers/phala-worker` -> Phala TEE
- `contracts` -> Morpheus gateway and callback consumer contracts for Neo deployment

## Design Rules

- secrets are encrypted before leaving the client boundary
- dispatcher never decrypts secrets
- Phala returns derived results only
- privacy oracle and privacy compute share one trusted runtime
- Neo N3 + Neo X are both first-class targets


## Provider Registry

Morpheus exposes a shared built-in provider registry used by both Privacy Oracle and DataFeed.
The first built-in source is `twelvedata`, and the model remains extensible for more providers or user-supplied URLs.
