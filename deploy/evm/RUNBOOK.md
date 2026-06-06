# Neo X (EVM) Oracle — Runbook

The oracle request/VRF lane on **Neo X mainnet** (EVM, chainId 47763), mirroring the
Neo N3 `MorpheusOracle` kernel. Price feeds are a separate concern — see
`../feed-pusher/RUNBOOK.md` (the feed pusher already pushes to both Neo N3 and Neo X).

## Components

| Piece | Where | What |
|---|---|---|
| `MorpheusOracleEVM` | NeoX mainnet `0xeCFC1C652B5cCdBfe3E9314a83156787D92a3fD2` | request lifecycle + ecrecover-verified fulfilment + callbacks |
| `neox-fulfiller.mjs` | box `morpheus-neox-fulfiller.service` | watches `RequestQueued` → does work → signs → `fulfillRequest` |
| `MorpheusPriceFeed` | NeoX mainnet `0x38DD6BCEBDD47f4234AE11760CEFB58f9ae6a3bB` | price feed (fed by the multi-chain feed pusher) |

Keys (all currently the single deployer `0x622ae03BDB6d7E2A29BE853c75d625bB25c0139C`):
- **owner** — admin (register modules/apps, set updater/verifier, fees).
- **updater** — sends `fulfillRequest` (gas payer / witness).
- **oracle verifier** — secp256k1 key whose signature over the fulfilment digest the
  kernel checks with `ecrecover`. The Nitro enclave can't sign secp256k1 (it's
  secp256r1 / Neo only), so the EVM verifier is a raw key held by the fulfiller.

## Request lifecycle

1. A miniapp calls `submitRequest(appId, moduleId, operation, payload)` (or a
   registered callback contract calls `requestFromCallback(requester, operation, payload)`).
   The app must be registered and the module granted. → `RequestQueued` event.
2. The fulfiller sees the event, runs the lane (VRF locally; HTTP/compute via the
   Nitro worker when `NEOX_WORKER_URL` is set), and signs
   `digest = keccak(abi.encode("morpheus-evm-fulfillment-v1", chainId, oracle, id,
   keccak(appId), keccak(moduleId), keccak(operation), success, keccak(result), keccak(error)))`
   with the verifier key (EIP-191 personal-sign over the 32-byte digest).
3. `fulfillRequest(id, success, result, error, signature)` — `onlyUpdater`; the kernel
   recomputes the digest and requires `ecrecover == oracleVerifier`, stores the result,
   and best-effort-calls `onOracleResult(uint256,string,bool,bytes,string)` on the
   app's callback contract (a failing callback never reverts the fulfilment).

## Build / deploy / bootstrap (local)

```bash
# compile (solc 0.8.24, evmVersion=paris for NeoX)
node deploy/evm/compile.mjs MorpheusOracleEVM

# deploy (dual-gated)
NEOX_DEPLOY_PK=0x.. DEPLOY_APPLY=1 \
  node deploy/evm/deploy.mjs MorpheusOracleEVM '["0x0","0x0"]'   # 0x0 => default updater/verifier to deployer

# inspect + bootstrap a module/app
node deploy/evm/oracle-admin.mjs info
NEOX_ADMIN_PK=0x.. node deploy/evm/oracle-admin.mjs register-module random.generate
NEOX_ADMIN_PK=0x.. node deploy/evm/oracle-admin.mjs register-app <appId> <admin> [callback]
NEOX_ADMIN_PK=0x.. node deploy/evm/oracle-admin.mjs grant <appId> <moduleId>
node deploy/evm/oracle-admin.mjs request <id>

# end-to-end check (needs the fulfiller running)
NEOX_REQUESTER_PK=0x.. node deploy/evm/validate-vrf.mjs
```

## Fulfiller service (box)

- Unit: `deploy/evm/morpheus-neox-fulfiller.service` → `/etc/systemd/system/`.
  Runs `node deploy/evm/neox-fulfiller.mjs` from `/opt/morpheus/neo-morpheus-oracle`
  (so ethers resolves from the repo `node_modules`), `Restart=always`, poll 5 s.
- Env: `/opt/morpheus/nitro/neox-fulfiller.env` (600). The updater key is sourced
  from `feed-pusher.env`'s `NEOX_FEED_PK` at deploy time (same key — not re-transmitted).
- State cursor: `/opt/morpheus/nitro/neox-fulfiller-state.json` (last scanned block).
- Operate: `systemctl status|restart morpheus-neox-fulfiller`,
  `journalctl -u morpheus-neox-fulfiller -f`.

## Adding a lane / app

- New work lane: extend `doWork()` in `neox-fulfiller.mjs` (route by `moduleId`/`operation`),
  then `register-module` + `grant` it to the app. HTTP/compute reuse the Nitro worker —
  set `NEOX_WORKER_URL`/`NEOX_WORKER_TOKEN` in the env.
- New app: `register-app <appId> <admin> [callbackContract]` then `grant` each module.
  Callback contracts implement `onOracleResult(uint256 id, string operation, bool success, bytes result, string error)`.

## Security notes

- Single key is owner+updater+verifier. **Rotate** to separate cold-owner / hot-updater /
  verifier keys for production; `setUpdater` / `setOracleVerifier` / `setOwner` are owner-gated.
- `requestFee` defaults to 0 (free). Set via `setRequestFee` (wei) + `withdrawFees` to monetize.
- The verifier key lives on the box (raw secp256k1) — same trust model as the NeoX feed key.
