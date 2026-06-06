# Morpheus DataFeed price pusher — deployment & recovery runbook

Standalone price-feed writer that replaced the dead Phala compute worker for the
**price feed only**. It does NOT need the compute worker. Runs on the Nitro oracle
host (`i-0c52851f134db20ee`) as a systemd timer.

## Architecture
- On-chain contract: **MorpheusDataFeed** mainnet `0x03013f49c42a14546c8bbe58f9d434c3517fccab`.
  `UpdateFeeds(...)` only requires the tx be witnessed by the contract **updater** —
  there is NO on-chain attestation/signature check beyond the witness.
- On-chain updater = **NN8tbpgAx8zm5BNJZEqvi71Rj2Z8LX2RHh** (`0x9fb28bdacfaa7fcc0a4d660d0dc990b0e7d46118`),
  which is the Nitro enclave's `updater` role key. Admin = deployer (can `SetUpdater`).
- `feed-pusher.mjs` builds the `UpdateFeeds` tx with neon-js, gets the message via
  `getMessageForSigning()`, signs it through the **enclave** `POST 127.0.0.1:8787/sign/payload`
  (`role: updater`) — **no private key on disk** — attaches the witness, and submits.
- 18 symbols (TwelveData "grow" plan; stocks/most commodities/GLD 404 on that plan).
  Threshold-gated (0.1%) + 30-min heartbeat so stable assets still refresh their `roundId`.
- Multi-RPC failover (n3index / nspcc / coz). `roundId` and `timestamp` are set to `now`
  and must be strictly > / ≥ the on-chain values.

## Files
| repo file | box path |
|---|---|
| `feed-pusher.mjs` | `/opt/morpheus/neo-morpheus-oracle/feed-pusher.mjs` |
| `feed-monitor.mjs` | `/opt/morpheus/neo-morpheus-oracle/feed-monitor.mjs` |
| `db-prune.mjs` | `/opt/morpheus/neo-morpheus-oracle/db-prune.mjs` |
| `morpheus-feed-pusher.{service,timer}` | `/etc/systemd/system/` (every 5 min) |
| `morpheus-feed-monitor.{service,timer}` | `/etc/systemd/system/` (every 15 min; fails visibly if feed stale or GAS low) |
| `morpheus-db-prune.{service,timer}` | `/etc/systemd/system/` (daily 03:30 UTC; retain 30d) |
| `feed-pusher.env.example` | template for `/opt/morpheus/nitro/feed-pusher.env` (chmod 600) |

## Recover from a host loss
1. Provision the host; install Node 20+ and the `neo-morpheus-oracle` repo at `/opt/morpheus/neo-morpheus-oracle` (provides `node_modules/@cityofzion/neon-js`).
2. Restore the Nitro enclave signer (serves `127.0.0.1:8787`) — see `deploy/nitro/`.
3. Copy `*.mjs` to `/opt/morpheus/neo-morpheus-oracle/`, the `*.service/*.timer` to `/etc/systemd/system/`.
4. Create `/opt/morpheus/nitro/feed-pusher.env` from `feed-pusher.env.example` (chmod 600):
   `TD_KEY` (TwelveData), `RUNTIME_TOKEN` = `MORPHEUS_RUNTIME_TOKEN` from `morpheus-relayer.env`.
5. `systemctl daemon-reload && systemctl enable --now morpheus-feed-pusher.timer morpheus-feed-monitor.timer morpheus-db-prune.timer`.
6. Verify: `node feed-pusher.mjs` once; check `getLatest("TWELVEDATA:NEO-USD")` roundId is fresh.

## Operations
- **GAS:** updater burns ~4 GAS/day. Refund `0x9fb28bdacfaa7fcc0a4d660d0dc990b0e7d46118` when the
  monitor warns (`<12 GAS`). Top up from the deployer (it is the contract admin). Recommended
  next step: a dedicated low-value funding key + a 6-hourly auto-topup timer (do NOT put the
  pool-controlling deployer WIF on the box).
- **Monitor:** `systemctl is-failed morpheus-feed-monitor` / `cat /opt/morpheus/nitro/feed-status.json`.
- **Health checks:** `tail /opt/morpheus/nitro/feed-pusher.log`, `journalctl -u morpheus-feed-pusher`.
- **DB:** `morpheus-db-prune` keeps the relayer's Supabase tables bounded (the original 402 outage cause).

## Known limitations
- Single enclave signer on one box (SPOF). `/sign/payload` blind-signs for a bearer token — scope/rate-limit/replay-guard it.
- Worker-dependent oracle lanes (VRF/HTTP/compute/privacy/DID/paymaster) remain 404 until `workers/phala-worker` is redeployed on Nitro. VRF alone is restorable relayer-locally (32 random bytes + oracle_verifier signature).
