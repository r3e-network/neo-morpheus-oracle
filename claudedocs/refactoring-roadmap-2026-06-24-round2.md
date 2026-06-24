# Refactoring Roadmap — Round 2 Addendum (2026-06-24)

**Method:** 4 parallel read-only audits targeting the gaps Round 1's siloed (per-domain) agents could not assemble: deploy/scripts/CI, the two big monoliths (enclave-server.mjs + router.js), cross-cutting single-source-of-truth (SSOT) debt across all layers, and test-infra + worker startup/steady-state costs.
**Headline:** Round 2 surfaced **one live defect** (stale oracle address still in 14 files — the Round 1 "fix" only swept the catalog) and **a class of steady-state/idle-runtime costs** Round 1 missed entirely (the relayer fires RPC + Supabase queries + disk writes every 5s even when idle).

---

## 🔴 LIVE DEFECT (fix first)

### D1 — Mainnet oracle address: stale `0x5b49` persists in 14 files

Round 1's catalog-sweep (`cd6082f`) fixed only the generated `morpheus-runtime-catalog.json`. The cross-cutting audit found the stale value `0x5b492098fc094c760402e01f7e0b631b939d2bea` is still live in **14 files**, including admin tooling that would hit the _wrong contract_ if run:

- **Admin scripts (would break if executed):** `scripts/call-oracle-admin.mjs:23`, `scripts/recover-and-rotate-admin.mjs:17`
- **Integrator-facing:** `apps/web/lib/docs-data.ts:222` (rendered contract hash shown to integrators)
- **Config/examples:** `examples/deployments/mainnet.json`, `examples/deployments/n3-builtins-validation.mainnet.latest.json`, `.env.production.example:87`, `deploy/nitro/morpheus.env.example:71`
- **Docs:** `docs/USER_GUIDE.md`, `docs/ASYNC_PRIVACY_ORACLE_SPEC.md`
- **Test fixtures (may be intentionally historical):** `workers/*/...test.mjs` (3 files), `scripts/check-env-signers.test.mjs`
- **Records (do NOT touch — historical):** `claudedocs/audit-2026-06-24.md`, `private-backups/*`

**Fix:** Per-file judgment sweep — update admin tools + integrator docs + examples to `0xf54d8584…`; verify the test fixtures aren't pinning intended old behavior; leave `claudedocs`/`private-backups` as historical record. This is the root cause the Round 1 catalog fix papered over (see SSOT-S1).

---

## Tier R2-0 — Steady-state / idle runtime costs (Round 1's blind spot)

Round 1 audited only the _hot fulfillment path_. Round 2 found the relayer burns resources **every 5s even when idle**.

### R2-0.1 — Idle scan loop fires a Neo-RPC discovery call every tick, no adaptive backoff

`workers/morpheus-relayer/src/relayer.js:229-263` — `runRelayerLoop` calls `runRelayerOnce` → `processChain` → `getLatestBlock`/`getLatestRequestId` (real RPCs) **every tick** even when the cursor matches the tip. Sleep is a flat `config.pollIntervalMs` (5s) — no `consecutiveIdleTicks` growth. **Fix:** adaptive backoff (cap `maxIdleMs`), reset on activity. **Risk:** Med (must reset eagerly so fresh events aren't delayed). **Impact:** cuts steady-state RPC load on idle deployments.

### R2-0.2 — `processAutomationJobs` Supabase fetch every tick, no due-gate

`workers/morpheus-relayer/src/automation.js:696-719` — unlike `processFeedSync` (which gates via `getFeedSyncDelayMs`), automation fetches `fetchActiveAutomationJobs` every 5s even with zero/future-dated jobs. **Fix:** cache earliest `next_run_at`, skip fetch until due; back off to 60s when no jobs. **Risk:** Med (invalidate on external job insert). **Impact:** removes per-5s Supabase query on idle boxes.

### R2-0.3 — Tick-boundary `saveRelayerState` bypasses coalescing — 2 full-JSON disk writes per idle tick

`workers/morpheus-relayer/src/relayer.js:142,186` — these direct `saveRelayerState` calls are **outside** the `createPersistor` coalescing (`queue.js:27-65`). Even on a fully-idle tick, 2 full-state serializations + atomic renames (large `processed_records` + `retry_queue`) hit disk. **Fix:** route through the coalesced persistor, or skip when `!resultHasPersistableActivity` and `updated_at` is fresh. **Risk:** Low-Med (crash-recovery snapshot freshness). **Impact:** eliminates redundant fsyncs at 5s cadence.

### R2-0.4 — `createRelayerConfig()` not memoized; loop/once default re-parses ~146 env vars

`workers/morpheus-relayer/src/relayer.js:136,216` default to `createRelayerConfig()` if `options.config` absent — and it's not memoized (`config.js:253`). Production (`cli.js:24`) passes config once so the live loop is fine, but any future caller invoking `runRelayerOnce()` per-invocation silently re-parses everything. **Fix:** memoize + `resetConfigCacheForTests()` (mirrors `resetLocalVerifierCacheForTests`). **Risk:** Low.

---

## Tier R2-1 — Test-coverage gaps on Round-1 changes (lock in the wins)

### R2-1.1 — Verifier-account memoization (Round 1 `a286327`) has NO direct test

`resetLocalVerifierCacheForTests` is exported but referenced **only at its definition** — no test imports it. Nothing asserts a second call returns the cached account, or that a network/env change re-resolves. A wrong-cache bug (the exact risk memoization introduces) would not be caught. **Fix:** add a test spying on `reportPinnedNeoN3Role`/`buildLocalNeoN3Account`, assert single derivation across two calls + fresh derivation after reset. **Risk:** Low (additive test).

### R2-1.2 — getblockcount-probe removal (Round 1 `b7642ba`) covered only incidentally

The neo-n3 test asserts the exact RPC sequence on `buildSignAndBroadcastNeoN3Tx` — but the probe was removed from `fulfillNeoN3Request` (the _outer_ wrapper), which has **no test**. A re-added probe in the outer wrapper wouldn't be caught. **Fix:** add a `fulfillNeoN3Request`-level RPC-sequence test. **Risk:** Low.

### R2-1.3 — apps/web `vi.resetModules` boilerplate duplicated across 12 test files, no harness

No `__tests__/helpers/` exists; 12 files re-implement the same `beforeEach` (resetModules + stubEnv + stubGlobals). **Fix:** extract a `useRelayerEnv()` harness. **Risk:** Low.

---

## Tier R2-2 — Trust-root (enclave-server.mjs) performance + structure

### R2-2.1 — Per-request signer-key re-derivation in the TEE (no caching) — HIGH perf

`deploy/nitro/enclave-server.mjs:493-515` — every signed response calls `reportPinnedNeoN3Role` → `buildRoleReport` → `collectSecrets`, re-materializing up to ~12 `new neon.Account` (WIF decode + secp256r1 pubkey + script-hash) per call. A single `/oracle/fulfill` (neo_n3) triggers it **twice** (`signNeoN3OracleVerifier` + `resolveAttestationPublicKey`). Plus `signNeoN3OracleVerifier:503` re-wraps the already-materialized secret into a **second** `new neonWallet.Account`. **Fix:** memoize the materialized role report per `(network, role)`; invalidate on `/provision`. **Risk:** Low-Med. **Impact:** eliminates ~12-24 secp256r1 derivations per request on the trust-root hot path.

### R2-2.2 — `execFileSync` for `nsm-attest` blocks the event loop — HIGH concurrency

`deploy/nitro/enclave-server.mjs:1266-1298` — attestation production shells out via **synchronous** `execFileSync`, blocking the single-threaded Node event loop for the NSM ioctl. Two simultaneous fulfills serialize on this. **Fix:** `execFile` (async) so the loop serves other requests during the NSM round-trip. **Risk:** Med (must preserve args/stdio/timeout/diag). **Impact:** unblocks concurrency — single biggest throughput win for the enclave server.

### R2-2.3 — Attestation PCR double-decode in `/oracle/fulfill` — free redundancy

`enclave-server.mjs:741-753` — `handleAttestation` already extracts `attestation.pcrs` (line 1578), but the fulfill handler re-runs `extractAttestationPcrs(attestation.attestation_document)` (line 751). Full second base64-decode + CBOR parse. **Fix:** prefer `attestation.pcrs`, fall back only when absent. **Risk:** Very low.

### R2-2.4 — `verifierWallet` (neox) not cached while `updaterSigner` is — inverted priorities

`workers/morpheus-relayer/src/neox.js:173-179` — `verifierWallet` does `new ethers.Wallet(pk)` per request; the sibling `updaterSigner` (line 160) IS cached via `signerCache`. The hot attest-and-sign EVM path is uncached. **Fix:** mirror `signerCache`. **Risk:** Low.

### R2-2.5 — God-server: 1856 LOC mixing 7 concerns (architecture)

`deploy/nitro/enclave-server.mjs` — HTTP + auth/provision + KMS-decrypt (5 keys) + Neo N3 sign + EVM sign + feed-compute (a 470-LOC mirror of feed-pusher) + attestation. `process.env` is the sole state bus. **Fix:** split along natural seams (auth/provision/keys/signers/feed/attestation). **Risk:** Med (consensus-critical bytes must stay identical; the feed-pusher mirror is riskiest).

### R2-2.6 — Feed path duplicates feed-pusher.mjs constants/tx-build — drift risk

`enclave-server.mjs:103-112` copy-pastes `FEED_N3_MAGIC`/`FEED_N3_CONTRACT`/`NEOX_FEED_ABI` etc with comments "MUST stay identical to feed-pusher.mjs" — enforced only by humans. `planFeedUpdate` IS already imported from feed-pusher (proving it's importable); the tx-build isn't. **Fix:** export `buildUpdateFeedsTxMessage` + constants from feed-pusher, import here. **Risk:** Med (consensus-drift class). **Impact:** removes a class of feed-tx drift bugs at the trust root.

---

## Tier R2-3 — Cross-cutting SSOT debt (only visible across layers)

### R2-3.1 — Fulfillment-digest algorithm re-implemented 4× across the trust boundary — CRITICAL correctness

The digest (field tuple `domain, requestId, sha256(appId), sha256(moduleId), …`) is independently implemented in: C# kernel (`MorpheusOracle.Fulfillment.cs:45-60`), relayer N3 (`router.js:298-371`), relayer NeoX (`neox.js:347-378`), EVM kernel (`MorpheusOracleEVM.sol:244-249`), + 2 deploy re-implementations. Domain strings copy-pasted 6× (`miniapp-os-fulfillment-v1`, `morpheus-evm-fulfillment-v1`). This was ALREADY broken before (`morpheus-fulfillment-v2` vs `miniapp-os-fulfillment-v1`). **No golden-vector parity test pins JS to BOTH contracts.** **Fix:** centralize domain strings + field tuple in `packages/shared`; add ONE cross-language parity fixture checked into C#, Solidity, and relayer test suites. **Risk:** Med. **Impact:** turns a silent signature-rejection-across-a-chain bug into a CI failure.

### R2-3.2 — Callback method name `onOracleResult`/`onMiniAppResult` is a magic string in ~48 files

91 occurrences / 48 files, no shared constant. Web defaults a user-editable input to it (`OracleTab.tsx:63`) — a typo produces an un-fulfillable request. A rename is an unbounded multi-layer edit. **Fix:** define `CALLBACK_METHOD` once in `packages/shared`; web/relayer import it. **Risk:** Low.

### R2-3.3 — Request/Result shape has N independent type defs + camelCase/snake_case ambiguity

Within the relayer alone, the same field is `callbackMethod` (`fulfillment.js:1150`) vs `callback_method` (`router.js:283`), bridged by `||` fallbacks. EVM Request struct has internal SSOT but nothing ties it to N3 or JS. **Fix:** canonical `FulfillmentRequest`/`Result` schema in `packages/shared`; standardize one key convention; kill fallbacks. **Risk:** Med (must preserve wire format + identifier-hygiene "no trim" rule).

### R2-3.4 — Env-var alias set (45-entry `NEO_N3_SIGNER_ENV_KEYS`) duplicated across layers + a layering inversion

Canonical list in `workers/morpheus-relayer/src/lib/neo-signers.js:13-58`, but nitro-worker **cross-imports it** (`workers/nitro-worker/src/chain/signing.js:17` → `../../morpheus-relayer/src/lib/neo-signers.js`) — a layering inversion that breaks if the relayer is extracted. `MORPHEUS_NETWORK`/`NEO_NETWORK_MAGIC` re-resolved independently in 4 layers. **Fix:** promote the env-key catalog into `packages/shared` (it already reads `config/signer-identities.json`, the true SSOT). **Risk:** Med (env resolution is security-sensitive).

### R2-3.5 — RPC URL lists duplicated between config JSON and relayer defaults

`config/networks/mainnet.json:16-22` (6 URLs) vs `workers/morpheus-relayer/src/config.js:19-35` (6 mainnet + 5 testnet, different order). Already diverged in count (testnet: 10 vs 5). **Fix:** relayer loads from `config/networks/*.json`, hardcoded list only as fallback. **Risk:** Low.

### R2-3.6 — Generated catalog has no CI gate (the D1 root cause)

`apps/web/public/morpheus-runtime-catalog.json` is committed AND generated; `check-web-consistency.mjs` never compares catalog↔generated. This is precisely why D1 happened. **Fix:** CI step that runs `export-public-runtime-catalog.mjs` and diffs against committed (fail on diff). **Risk:** Low. **Impact:** makes the SSOT mechanical, not editorial.

---

## Tier R2-4 — CI + deploy-tooling efficiency

### R2-4.1 — CI runs full pipeline on every change (no paths-filter)

`.github/workflows/ci.yml:3-7` — no `paths`/`paths-ignore`; a docs-only PR runs all 3 jobs incl. dotnet×4 + web build. **Fix:** `dorny/paths-filter` gate; ignore `**/*.md`/`docs/**`/`claudedocs/**` for heavy jobs. **Risk:** Low. **Impact:** minutes saved on most PRs.

### R2-4.2 — CI `contracts` job reinstalls nccs + restores NuGet every run (no cache)

`ci.yml:49-59` — no `actions/cache` for `~/.dotnet/tools` or `~/.nuget/packages`. **Fix:** cache keyed on pinned `3.9.1` + `hashFiles(contracts/**/*.csproj)`. **Risk:** Low. **Impact:** 30-60s/run.

### R2-4.3 — CI `web-and-worker` runs 7 independent suites sequentially

`ci.yml:37-43` — 7 `run:` steps in one job (shared, nitro, relayer, ops, control-plane, web test, web build). **Fix:** job matrix / 2-3 parallel jobs. **Risk:** Low-Med (hermeticity). **Impact:** wall-clock → max(suite times).

### R2-4.4 — neox-fulfiller: N+1 getRequest + abort-on-first-error rescans the chunk

`deploy/evm/neox-fulfiller.mjs:174-202` — `getRequest` per log (after read), sequential fulfill, and a single failure `return state` BEFORE cursor advance → next poll re-reads the whole chunk + re-issues all getRequests. **Fix:** decouple scan from fulfill (always advance cursor; recover missed via pending-queue), bounded-concurrency fulfill. **Risk:** Med.

### R2-4.5 — callback-monitor: no per-chunk error isolation → one flaky eth_getLogs aborts + forces full rescan

`deploy/evm/callback-monitor.mjs:181-190` — no try/catch per chunk; cursor only persists on full success. **Fix:** per-chunk try/catch, advance cursor per success. **Risk:** Low.

### R2-4.6 — feed-pusher `pushNeoN3` fallback does per-pair `getLatest` sequentially (pushNeoX already parallel)

`deploy/feed-pusher/feed-pusher.mjs:390-397` — serial `await n3cur(s)` in a loop; the sibling pushNeoX uses `Promise.all`. **Fix:** mirror pushNeoX. **Risk:** Low.

### R2-4.7 — Misc: neox-fulfiller hardcoded 2000-block window (not tunable, vs callback-monitor's env-overridable 25000); audit-feed-freshness builds networks sequentially

Low-impact consistency fixes. **Risk:** Low.

---

## router.js micro-optimizations (Round 2 confirmed Round 1 flags)

### R2-5.1 — `buildFulfillmentDigestBytes`: 6× createHash + 1 Buffer.concat → streaming

`workers/morpheus-relayer/src/router.js:298-371` — the 5 inner sha256s are structurally required (on-chain hashes each identifier independently), BUT the `Buffer.concat` intermediate is avoidable: feed each part to the outer hash via `hash.update(part)` directly. **Fix:** streaming. **Risk:** Low (byte-identical output; covered by digest characterization tests). **Impact:** removes ~200-500B alloc+copy on the consensus-critical path.

### R2-5.2 — `buildOnchainResultEnvelope`: 3-candidate eager build + 3× JSON.stringify → lazy

`router.js:558-603` — builds all 3 envelope variants eagerly then measures each. **Fix:** lazy first-fit. **Risk:** Low (preserve selection logic; covered by envelope tests).

### R2-5.3 — Envelope built twice per fulfill (encodeFulfillmentResult + buildOnchainResultEnvelope)

`router.js:605-627` + `enclave-server.mjs:662-663` — same `workerResponse` envelope constructed twice. **Fix:** have `encodeFulfillmentResult` return the envelope for reuse. **Risk:** Low.

---

## Recommended execution order

1. **D1** (stale address sweep) — live defect, per-file judgment. Immediate.
2. **R2-1.1 / R2-1.2** — test-coverage gaps on Round-1 perf changes. Lock in the wins; Low risk.
3. **R2-3.6** — CI catalog-diff gate. Mechanical; kills the D1 drift class permanently.
4. **R2-0.3 / R2-0.1** — idle-cost reductions (state-write coalescing, adaptive backoff). Med risk; biggest steady-state wins.
5. **R2-2.1 / R2-2.2** — trust-root key memoization + async nsm-attest. High perf; Med risk (signature path + consensus-neutral bytes).
6. **R2-3.1** — digest parity fixture. Highest correctness value; Med risk.
7. The rest (god-server split, schema SSOT, CI matrix) — larger architectural work, deliberate cadence.

_All findings evidence-cited in the 4 Round-2 audit transcripts. Read-only analysis; no source modified._
