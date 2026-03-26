# Morpheus Oracle Architecture

## Production Topology

```text
[ dApp / operator / automation client ]
        |
        | encrypt optional secrets locally
        v
[ Neo N3 contracts ] -----------------------------+
        |                                         |
        | async request / feed read               | callback fulfillment
        v                                         |
[ relayer durable intake ]                        |
        |                                         |
        | persist + retry + recover               |
        v                                         |
[ Cloudflare control plane ]                      |
  - auth / validation                             |
  - rate limiting                                 |
  - job persistence                               |
  - queue / workflow dispatch                     |
        |                                         |
        +--------------------------+--------------+
                                   |
                                   v
                       [ confidential execution plane ]
                       - Oracle CVM: request / response / compute / NeoDID
                       - DataFeed CVM: continuous feed publication
                                   |
                                   v
                           [ signed / attested result ]
                                   |
                                   v
                        [ relayer broadcast + contract callback ]
```

## Four Layers

### 1. Serverless ingress and control

Cloudflare Workers provide:

- `/mainnet/*` and `/testnet/*` API ingress
- request authentication and validation
- per-lane throttling and recovery endpoints
- operator-facing health and job status routes

This layer is intentionally stateless except for the job records it writes to Supabase.

### 2. Durable orchestration

Morpheus uses managed Cloudflare primitives instead of custom in-TEE schedulers:

- **Queues**
  - `oracle_request`
  - `feed_tick`
- **Workflows**
  - `callback_broadcast`
  - `automation_execute`

This keeps orchestration outside the TEE while still preserving retry and recovery semantics.

### 3. Durable state

Supabase is the durable source of truth for:

- request records
- encrypted refs and secret metadata
- control-plane jobs
- relayer jobs
- automation jobs and runs
- feed snapshots
- operation logs

Durability lives here, not in transient worker memory.

### 4. Confidential execution

The confidential boundary is intentionally narrow.

Only these operations enter the TEE:

- decrypting sealed payloads
- private HTTP fetches
- private compute and JS/WASM execution
- NeoDID private ticket flows
- confidential signing and attested result creation

Everything else stays outside.

## Runtime Roles

### Oracle CVM

- name: `oracle-morpheus-neo-r3e`
- app id: `ddff154546fe22d15b65667156dd4b7c611e6093`
- role: request/response oracle, compute, NeoDID, paymaster-related confidential logic
- public paths:
  - `https://oracle.meshmini.app/mainnet`
  - `https://oracle.meshmini.app/testnet`

### DataFeed CVM

- name: `datafeed-morpheus-neo-r3e`
- app id: `28294e89d490924b79c85cdee057ce55723b3d56`
- role: isolated feed publication lane
- priority: highest; feed publication must not be starved by interactive workloads

## Request/Response Flow

1. The client seals optional confidential fields with the Oracle X25519 public key.
2. A Neo N3 contract submits an async Morpheus request.
3. The relayer persists the event before it advances checkpoints.
4. The Oracle runtime executes the confidential job.
5. The runtime returns a signed result envelope and optional attestation metadata.
6. The relayer submits the callback transaction on-chain.

## DataFeed Flow

1. A control-plane or operator tick enters the `feed_tick` lane.
2. The DataFeed CVM fetches and normalizes source data.
3. Only materially changed quantized prices are prepared for publication.
4. The relayer publishes the update to `MorpheusDataFeed`.
5. Feed snapshots and operational telemetry are recorded in Supabase.

## Network Model

- Mainnet and testnet share the same Oracle CVM.
- Mainnet and testnet share the same DataFeed CVM.
- Network selection is passed as runtime metadata and path prefix, not by provisioning separate CVMs per network.
- The Oracle execution plane is network-aware but topology-neutral.

This keeps runtime behavior consistent and reduces operational drift.

## Trust Boundaries

- secrets are encrypted before leaving the client boundary
- control plane, edge gateway, and relayer never decrypt payloads
- TEE outputs derived results only
- pricefeed publishing is isolated from request/response execution
- signer identities are pinned and checked before deployment
- public attestation anchors are the published Oracle and DataFeed Phala explorer pages

## Support Stance

- Neo N3 is the active supported path.
- Neo X code remains in-repo only as reference material.
- New documentation, examples, and validation flows should treat Neo N3 as canonical.
