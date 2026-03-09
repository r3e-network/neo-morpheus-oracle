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

## State file

The relayer stores its last processed blocks in:

- `.morpheus-relayer-state.json`

Override with:

- `MORPHEUS_RELAYER_STATE_FILE`
