# Phala CVM Deployment

This directory contains the canonical Morpheus deployment layout for the confidential execution plane.

For environment variable details, see `docs/ENVIRONMENT.md`.

## Current CVM Topology

Morpheus uses **two role-specialized CVMs**.

### Oracle CVM

- name: `oracle-morpheus-neo-r3e`
- app id: `ddff154546fe22d15b65667156dd4b7c611e6093`
- baseline size: `Large TDX`
- responsibilities:
  - request/response oracle
  - confidential compute
  - NeoDID private flows
  - confidential signing
  - attested response generation

### DataFeed CVM

- name: `datafeed-morpheus-neo-r3e`
- app id: `ac5b6886a2832df36e479294206611652400178f`
- baseline size: `Small TDX`
- responsibilities:
  - feed synchronization
  - feed publication
  - continuous market-data lane isolation

This split ensures pricefeeds keep running even when request/response traffic is bursty.

## Routing Model

- Oracle public entry:
  - `https://oracle.meshmini.app/mainnet`
  - `https://oracle.meshmini.app/testnet`
- Oracle attestation explorer:
  - `https://cloud.phala.com/explorer/app_ddff154546fe22d15b65667156dd4b7c611e6093`
- DataFeed attestation explorer:
  - `https://cloud.phala.com/explorer/app_ac5b6886a2832df36e479294206611652400178f`

Mainnet and testnet share the same Oracle and DataFeed CVMs. Network selection is path-based and config-based.

## Launcher Files

- `phala.request-hub.toml`
- `phala.feed-hub.toml`

Compose files:

- `deploy/phala/docker-compose.request-hub.yml`
- `deploy/phala/docker-compose.feed-hub.yml`
- `deploy/phala/docker-compose.ui.yml`
- `deploy/phala/docker-compose.ingress.ui.yml`

## Recommended Render Flow

```bash
npm run render:phala-env:mainnet
npm run render:phala-env:testnet
npm run render:phala-hub-env
npm run check:signers
npm run check:phala-env
```

Notes:

- `npm run render:phala-env` aliases mainnet
- signer identities are pinned in `config/signer-identities.json`
- generated env files stay local and uncommitted

## Relayer Modes

Use explicit relayer mode per CVM:

- Oracle CVM: `MORPHEUS_RELAYER_MODE=requests_only`
- DataFeed CVM: `MORPHEUS_RELAYER_MODE=feed_only`

Recommended durability settings:

- `MORPHEUS_DURABLE_QUEUE_ENABLED=true`
- `MORPHEUS_DURABLE_QUEUE_FAIL_CLOSED=true`
- `MORPHEUS_RELAYER_INSTANCE_ID=<stable-id>`

## Deployment Options

### Option A: Phala UI

Use the dashboard and deploy one compose per CVM.

Recommended:

- Oracle CVM:
  - launcher: `phala.request-hub.toml`
  - compose: `deploy/phala/docker-compose.request-hub.yml`
- DataFeed CVM:
  - launcher: `phala.feed-hub.toml`
  - compose: `deploy/phala/docker-compose.feed-hub.yml`

Prefer encrypted secrets in the dashboard over copying plaintext env files into the guest.

### Option B: CLI

```bash
phala deploy --cvm-id ac5b6886a2832df36e479294206611652400178f --compose deploy/phala/docker-compose.feed-hub.yml -e deploy/phala/morpheus.hub.env --wait
phala deploy --cvm-id ddff154546fe22d15b65667156dd4b7c611e6093 --compose deploy/phala/docker-compose.request-hub.yml -e deploy/phala/morpheus.hub.env --wait
```

## Required Runtime Capabilities

The Oracle runtime should be provisioned with:

- `MORPHEUS_RUNTIME_TOKEN` or `PHALA_API_TOKEN`
- `PHALA_SHARED_SECRET`
- `MORPHEUS_RUNTIME_CONFIG_JSON`
- Supabase server credentials
- pinned N3 signing identities
- optional Better Stack telemetry values

The DataFeed runtime should be provisioned with the same runtime config but operate in feed-only mode.

## Key Operational Notes

- keep `/var/run/dstack.sock` mounted
- keep the Oracle transport key sealed in the CVM volume
- do not rotate worker or verifier signers accidentally
- use `request_cursor` scan mode on testnet
- keep DataFeed isolated; do not merge it back into the Oracle runtime

## Post-Deploy Verification

```bash
npm run smoke:n3
npm run smoke:control-plane
npm run check:signers
MORPHEUS_NETWORK=testnet npm run verify:n3
```

If you need direct runtime confirmation inside the guest:

```bash
curl http://127.0.0.1:8080/health
docker exec -it morpheus-relayer npm --prefix workers/morpheus-relayer run metrics
```
