# Session Handoff — Multi-chain Oracle + Dice + Dependency Hardening (2026-06-07)

This document is a self-contained brief for a **reviewing/validating agent**. It lists every
task requested, what was changed, where it lives, and exactly how to verify each claim.

## Repos & current state

| Repo     | Path                              | Default branch | HEAD        | Notes                                                             |
| -------- | --------------------------------- | -------------- | ----------- | ----------------------------------------------------------------- |
| Oracle   | `~/git/r3e/neo-morpheus-oracle`   | `main`         | `13ad739`   | also on branch `security/audit-remediation-2026-06` (same commit) |
| Platform | `~/git/r3e/neo-miniapps-platform` | `master`       | `26da53649` | branch tracks master                                              |

Both default branches were updated via clean fast-forward; working trees clean; no secrets in git
(scanned — see "Security").

## Tasks requested (chronological) and what was delivered

1. **"update the pricefeed to also support neox … solidity pricefeed deployed to neox … sync data … refactor the oracle underlying system to support multiple chains (neo n3 + neo x)"**
   - `contracts-evm/MorpheusPriceFeed.sol` deployed to **Neo X mainnet `0x38DD6BCEBDD47f4234AE11760CEFB58f9ae6a3bB`** (DECIMALS=6, matches Neo N3).
   - `deploy/feed-pusher/feed-pusher.mjs` refactored to a multi-chain `CHAINS` array (Neo N3 via NeoVM/8787-enclave + Neo X via ethers key-sign), one TwelveData fetch per cycle.

2. **Full multi-chain ORACLE (request/VRF), not just the feed**
   - `contracts-evm/MorpheusOracleEVM.sol` (Solidity request kernel) deployed to **Neo X mainnet `0xeCFC1C652B5cCdBfe3E9314a83156787D92a3fD2`**: registerModule/registerMiniApp/grantModule/submitRequest/requestFromCallback; `fulfillRequest` verified by secp256k1 EIP-191 `ecrecover` bound to chainId+contract; best-effort `onOracleResult` callback.
   - Unified the relayer (`workers/morpheus-relayer`) into a multi-chain engine: `src/neox.js` (EVM adapter, request-cursor discovery, keccak digest, ethers fulfil with a shared NonceManager + gas buffer for the kernel callback), `config.js`/`state.js`/`fulfillment.js`/`relayer.js` made chain-aware. Neo N3 path untouched.
   - The Nitro worker (`workers/nitro-worker`) accepts `neox` as an oracle target chain (HTTP/compute lanes).

3. **Per-chain feed cadence: "neo x every 2 minutes, keep 5 minutes for n3"**
   - `FEED_CHAINS` env scopes the pusher; split into two systemd timers on the box: `morpheus-feed-pusher` (Neo N3, 5 min) + `morpheus-feed-pusher-neox` (Neo X, 2 min).

4. **"update dice game to support both neo n3 and neo x, auto-detect by wallet network; the miniapp OS supports multi-chain"**
   - Backend: `contracts-evm/MiniAppDiceGameEVM.sol` on **Neo X mainnet `0xFA795F814d38F218153d21838360096f3F5cb774`** — payable `placeBet(face)` → VRF → `onOracleResult` settle (win 5.7× from bankroll, loss keeps, VRF-fail refunds); bankroll reservation, pull-payment safety, trustless `settleFromKernel(id)` recovery.
   - OS frontend (platform): `apps/shared/utils/evm-chain.ts` (dependency-free EIP-1193 EVM wallet/chain helpers), additive EVM methods on `apps/shared/services/ChainService.ts` (`detectNetwork`/`isEvmNetwork`/`ensureEvmWallet`/`invokeEvmWithValue`), Neo N3 path unchanged. `apps/dice-game` branches by detected network.

5. **"polish frontend for user-friendliness, correctness, beauty"** (dice)
   - Result reveal (was missing): rolling state → settled roll + Won/Lost/Refunded + payout, on both chains (Neo X polls `getBet`; Neo N3 polls `DiceBetResolved`/`DiceBetRefunded`). Win fires host fireworks.
   - Chain badge (Neo N3/Neo X), correct per-chain stake cap (Neo X max 2 GAS vs 20), honest "rolling" status.

6. **"check and fix everything, test everything, validate everything"** — full QA pass (see Test status). Fixed one real failure: the platform's generated Morpheus registry snapshot was stale after the Phala→Nitro change (`node deploy/scripts/sync_morpheus_registry.mjs`).

7. **"push all correct changes to main/master without revealing secrets"** — fast-forwarded oracle→main, platform→master after an exhaustive secret scan (0 findings).

8. **"fix the 24 Dependabot vulnerabilities"** — `21→6` (the 6 are the unfixable `elliptic` build chain). Via `overrides` (lodash 4.18.1, ws 8.21.0, postcss 8.5.15) + vitest/turbo bumps; removed the std-env override (incompatible with vitest 4.1); updated two guard tests. Commit `26da53649`.

## On-chain deployments to validate

Owner/deployer/updater for all Neo X contracts: `0x622ae03BDB6d7E2A29BE853c75d625bB25c0139C`.

- Neo X (chainId 47763, RPC https://mainnet-1.rpc.banelabs.org): PriceFeed `0x38DD6BCE…`, OracleEVM `0xeCFC1C65…`, DiceEVM `0xFA795F81…`.
- Neo N3 (mainnet): MorpheusOracle `0xf54d8584…`, MorpheusDataFeed `0x03013f49…` (script-hash form), Dice `0xa7840a8d…`.

## AWS Nitro infra (box i-0c52851f, region us-east-1; access via SSM `_ssm_run.mjs`, AWS_PROFILE=morpheus)

Services (systemd): `morpheus-nitro-signer` (8787, secp256r1 enclave), `morpheus-nitro-worker` (8788, HTTP/compute/VRF), `morpheus-relayer-nitro` (multi-chain, `MORPHEUS_ACTIVE_CHAINS=neo_n3,neox`), `morpheus-feed-pusher.timer` (N3 5m), `morpheus-feed-pusher-neox.timer` (Neo X 2m). `morpheus-neox-fulfiller` is **disabled** (the relayer owns Neo X now).

## How to validate (from `neo-morpheus-oracle`)

- Price feeds (both chains, fresh + in-parity): the validators print on-chain `getLatest` for N3 + Neo X.
- VRF lane: `NEOX_REQUESTER_PK=… node deploy/evm/validate-vrf.mjs` (submit→relayer→fulfil).
- HTTP lane: `… node deploy/evm/validate-http.mjs`.
- Dice e2e: `… node deploy/evm/validate-dice.mjs <count> <face> <stake>` (place→VRF→settle; win pays 5.7×).
- Oracle admin/read: `node deploy/evm/oracle-admin.mjs info|request <id>`.
- Box health: `AWS_PROFILE=morpheus node _ssm_run.mjs <script.sh>` (systemctl is-active, journalctl).

## Test status (all green at handoff)

Oracle: relayer **224/224**, nitro-worker **191/191**, scripts **69/69** (needs `DOTNET_ROOT=$HOME/.dotnet`), C# contracts **16/16**, EVM contracts compile.
Platform: shared **973/973**, host-app **810/810**, admin-console **353/353**, deploy-scripts **100/100**, C# contracts **81/81**, dice + representative app builds OK. `npm audit` = 6 low.

## Known caveats / what a reviewer should scrutinize

1. **MetaMask wallet UI is NOT browser-e2e-tested** — the EVM contracts are validated on-chain and the logic is unit-tested, but the actual connect/switch/sign flow needs a real browser+MetaMask pass. (Validate the dice frontend manually on Neo X.)
2. **Dice WIN payout** validated on-chain (bet rolled 6 → 0.285 GAS = 0.05×5.7); accounting clean.
3. **6 low `elliptic` advisories** remain (build-time polyfill; `elliptic` has no patched release > 6.6.1). `npm audit fix --force` would break the build — do not run.
4. **N3 dice refund reveal** uses `DiceBetRefunded` event index 3 (verified on-chain); the rest of the N3 result reveal uses `DiceBetResolved`.
5. The platform dependency lockfile was broadly refreshed by the security fix (large diff) — all suites pass, but reviewers may want to spot-check additional app builds.
6. Single key (`0x622ae03B`) is owner+updater+verifier of all Neo X contracts + the feed + the dice bankroll — single point of compromise.

## Security (must rotate — appeared in the working session, never committed to git)

- Neo X private key `0x0b8584…` (owns all Neo X contracts/feed/oracle/bankroll).
- Neo N3 testnet WIF `NR3E4D8N` (owns the testnet→mainnet self-contained contracts).
- Cloudflare API token `LwOeK…`, Vercel token (jim8y) — used for the edge/deploys.
  These live only in transcripts + the box's 0600 env files; secret scans of all pushed ranges = 0 findings.
