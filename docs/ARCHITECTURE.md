# Morpheus Oracle Architecture

## Topology

```text
[ Developer / User / Oracle Client ]
        |
        | 1. encrypts optional secret with Oracle public key
        v
[ Neo N3 Contract ]
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
  - neodid / did resolver metadata
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
- Neo N3 result envelopes

### 2. Privacy Compute

- built-in compute registry
- script execution for custom workloads
- intended extension point for ZKP and FHE backends

### 3. Datafeed

- signed price quote APIs
- Neo N3 feed contract storage
- feed snapshots and telemetry stored in Supabase

### 4. Relay / Signing

- Neo N3 message signing and tx relay
- chain-aware output envelopes for callback use

### 5. NeoDID

- independent `NeoDIDRegistry` contract on Neo N3
- Oracle-routed request types: `neodid_bind`, `neodid_action_ticket`, `neodid_recovery_ticket`
- Web3Auth JWT verification happens inside the TEE
- public W3C DID resolver exposes service topology and verifier key without disclosing private claims

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
- NeoDID public DID resolution stays separate from private bind / ticket issuance
- Neo N3 is the only active supported execution target right now
- Neo X artifacts remain in-repo as legacy/reference code, but they are not the current production path

## Provider Registry

Morpheus exposes a shared built-in provider registry used by both Privacy Oracle and DataFeed.
The first built-in source is `twelvedata`, and the model remains extensible for more providers or user-supplied URLs.
