# Relayer

`workers/morpheus-relayer` is the async request/response bridge for Morpheus Oracle.

It closes the loop:

1. Oracle request is emitted on-chain
2. Relayer detects the event
3. Relayer forwards the payload to the Phala worker
4. Relayer calls `fulfillRequest(...)` back on the Oracle contract
5. Callback consumer receives the result

## Supported chains

- Neo N3
- Neo X

## Request routing

The relayer maps `requestType` plus payload shape to worker routes:

- `compute` → `/compute/execute`
- `datafeed` / `pricefeed` / `feed` → `/oracle/feed`
- `vrf` / `random` → `/vrf/random`
- `privacy_oracle` and other Oracle requests → `/oracle/smart-fetch`
- The relayer prefers the compact smart-fetch response over raw query output

## Commands

```bash
npm --prefix workers/morpheus-relayer test
npm --prefix workers/morpheus-relayer run once
npm --prefix workers/morpheus-relayer run start
npm --prefix workers/morpheus-relayer run metrics
```

## Required env

- `PHALA_API_URL`
- `PHALA_API_TOKEN` or `PHALA_SHARED_SECRET`
- `MORPHEUS_NETWORK` (`testnet` or `mainnet`)
- `NEO_RPC_URL`
- `NEOX_RPC_URL` or `NEO_X_RPC_URL`
- `CONTRACT_MORPHEUS_ORACLE_HASH`
- `CONTRACT_MORPHEUS_ORACLE_X_ADDRESS`
- `MORPHEUS_RELAYER_NEO_N3_WIF` or `MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY`
- `MORPHEUS_RELAYER_NEOX_PRIVATE_KEY`

If direct worker-side provider default resolution is needed during relayer processing, also set:

- `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Reliability Model

The relayer persists:

- per-chain last scanned block checkpoints
- processed-event records for dedupe
- retry queue entries with exponential backoff
- dead-letter history for exhausted requests
- aggregate metrics for the latest runs

Config knobs:

- `MORPHEUS_RELAYER_CONCURRENCY`
- `MORPHEUS_RELAYER_MAX_BLOCKS_PER_TICK`
- `MORPHEUS_RELAYER_MAX_RETRIES`
- `MORPHEUS_RELAYER_RETRY_BASE_DELAY_MS`
- `MORPHEUS_RELAYER_RETRY_MAX_DELAY_MS`
- `MORPHEUS_RELAYER_PROCESSED_CACHE_SIZE`
- `MORPHEUS_RELAYER_DEAD_LETTER_LIMIT`
- `MORPHEUS_RELAYER_LOG_FORMAT`
- `MORPHEUS_RELAYER_LOG_LEVEL`

## Supabase Persistence

If `SUPABASE_URL` plus a service key are configured, the relayer also persists:

- run snapshots to `morpheus_relayer_runs`
- job lifecycle records to `morpheus_relayer_jobs`

The dashboard can read these through:

- `/api/relayer/metrics`
- `/api/relayer/jobs`
- `/api/relayer/dead-letters`

Manual operator actions:

- `POST /api/relayer/jobs/retry`
- `POST /api/relayer/jobs/replay`

These enqueue the stored event back into the relayer for manual retry / dead-letter replay.

## State file

The relayer stores its durable runtime state in:

- `.morpheus-relayer-state.json`

Override with:

- `MORPHEUS_RELAYER_STATE_FILE`

## Docker

Build and run:

```bash
docker build -f workers/morpheus-relayer/Dockerfile -t morpheus-relayer .
docker run --env-file .env morpheus-relayer
```

## systemd

Example unit file:

- `deploy/systemd/morpheus-relayer.service`

Typical install:

```bash
sudo cp deploy/systemd/morpheus-relayer.service /etc/systemd/system/morpheus-relayer.service
sudo systemctl daemon-reload
sudo systemctl enable morpheus-relayer
sudo systemctl start morpheus-relayer
```

## Phala Sidecar Pattern

A simple production pattern is:

- deploy `workers/phala-worker` to Phala
- run `workers/morpheus-relayer` as a sidecar process on a small VM or container
- point `PHALA_API_URL` at the public Phala worker endpoint
- keep chain updater keys and Supabase service credentials only in the sidecar env
