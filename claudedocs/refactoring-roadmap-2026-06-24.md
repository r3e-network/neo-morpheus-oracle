# Refactoring Roadmap — Performance / Architecture / System-Design

**Repo:** `~/git/r3e/neo-morpheus-oracle` · **Date:** 2026-06-24
**Method:** 5 parallel read-only architecture audits across independent domains (relayer, nitro-worker, web, shared/crypto core, contracts), each returning evidence-cited findings. This doc synthesizes ~50 raw findings into a de-duplicated, ranked roadmap.

**Headline:** No correctness regressions exist (the prior 9-PR audit was 9/9 PASS). The opportunities here are **performance wins, god-object decomposition, and cross-boundary single-sourcing**. The single largest theme: the **decode side of COSE was unified (PR #10) but the encode/verify side triplicated**, and it's drifting.

---

## Tier 0 — Do first (high impact, low risk, concrete)

These are isolated, behavior-preserving, and have the best impact-to-risk ratio. Safe to take immediately.

### 0.1 — Eliminate the redundant TEE-attestation HTTP round-trip on every fulfillment lane

**Domain:** nitro-worker · **Category:** Perf · **Risk:** Low-Med
`buildSignedResultEnvelope` (`chain/signing.js:226`) _already_ calls `maybeBuildDstackAttestation` and stores it as `signed.tee_attestation`. But `compute/index.js:725-738`, `paymaster/index.js:333`, `neodid/index.js:581`, and `oracle/fetch.js:427&444` each call `maybeBuildDstackAttestation` **again** and pass the second result to `buildLaneSignedEnvelope`, discarding the first. Each is a `fetch(POST /attest)` to the 8787 enclave (10s timeout).
**Fix:** drop the second call; `buildLaneSignedEnvelope(signed)` reads `signed.tee_attestation`. Standardize the attested `report_data` to be exactly `output_hash`.
**Impact:** removes 1 enclave HTTP round-trip per request on 4 lanes — the dominant per-request latency.

### 0.2 — Concurrent (not serial) multi-provider price fetch

**Domain:** nitro-worker · **Category:** Perf · **Risk:** Low
`oracle/feeds.js:432-438` loops `for (const provider of providers) { await resolveQuoteForProvider(...) }` — serial. Multi-provider aggregate latency = **sum** of provider RTTs.
**Fix:** `Promise.allSettled(providers.map(...))`. The providers layer already has per-provider circuit breakers, response cache, and in-flight dedup (`providers.js:583-714`), so concurrent fan-out is safe.
**Impact:** ~2×–N× feed latency reduction (tail provider no longer blocks).

### 0.3 — Free gas/perf wins on contracts (Neo + EVM), all internal, no storage break

**Domain:** contracts · **Category:** Perf (gas) · **Risk:** Low
Four near-identical "re-read what you just read" patterns, all removable by passing the already-fetched value into the helper:
| Where | Pattern | Save |
|-------|---------|------|
| `MorpheusOracle.Storage.cs:226→:174` | `PutMiniApp` reads `GetMiniApp`, then `IndexMiniAppIfNeeded` reads it again | 1 SLOAD + 1 deserialize |
| `MorpheusOracle.Storage.cs:283→:183` | `PutSystemModule` → `IndexSystemModuleIfNeeded` (same) | 1 SLOAD + 1 deserialize |
| `MorpheusDataFeed.cs:246→:249→:396` | `UpdateFeedInternal` reads pair, then `GetLatest` re-reads it | 1 SLOAD + 1 deserialize (×batch size) |
| `MorpheusDataFeed.cs:171` (called :254,:336) | `IndexPairIfNeeded` re-reads pair the caller just fetched | 1 SLOAD per feed write |
| `MorpheusOracleEVM.sol:236-243` | `fulfillmentDigest` re-SLOADs the Request `fulfillRequest` already bound (`:248`) | 3 SLOADs per fulfillment (appId/moduleId/operation) |

EVM one needs an `internal _fulfillmentDigest(Request storage r,…)` overload so the hot path passes the bound pointer; keep the public view fn for off-chain pre-computation.

### 0.4 — Make per-request operation logging non-blocking in web routes

**Domain:** web · **Category:** Perf · **Risk:** Low-Med
Every proxied/oracle/sign/relay route `await`s `recordOperationLog` (a Supabase INSERT + BetterStack HTTP post, sometimes ×2 for encrypted fields) **inline before responding** (`lib/operation-logs.ts:249-312`, 20 call sites). The control-plane fail-open path logs twice serialized.
**Fix:** compose the `Response` first, `return` it, then `void recordOperationLog(...)` (or `waitUntil`). Keep error-path logging awaited if forensics needs it.
**Impact:** saves 50–300ms of serialized DB+HTTP per proxied request (p99 win).

---

## Tier 1 — High-leverage architecture (the "unify the encode/verify side" theme)

This is the highest-value architecture work. It's one coherent refactor that touches 3 audits.

### 1.1 — Consolidate the triplicated COSE-Sign1 verify suite into `packages/shared`

**Domains:** shared + relayer + web · **Category:** Architecture · **Risk:** Med

The **decode** was unified in PR #10 (`packages/shared/src/cbor.js`). The **encode/verify** was left local and is now triplicated, **and already diverging**:

- `workers/morpheus-relayer/src/attestation.js:25-161` — `cborEncodeSigStructure` (tops out at 32-bit length head), `coseEs384SignatureToDer`, `verifyCoseSign1Crypto` (cert chain = name/sig only).
- `apps/web/lib/nitro-attestation.ts:391-583` — `encodeCborHead` (has a 64-bit branch the relayer lacks), `buildSig1Structure`, `verifyCoseEs384` (WebCrypto raw r‖s, not DER), stricter cert-chain check.
- `packages/shared/src/cbor.test.mjs:131-152` — a **third** re-implementation of the encoder (see 1.2).

**Fix:** move the full verify suite (Sig_structure encoder + ES384 verify in both DER & raw forms + cert-chain check) into `packages/shared/src/cose-verify.js`. The relayer's attestation policy layer stays local (trust semantics). Web's TS verifier imports the same suite. Keep the DER-vs-WebCrypto split (load-bearing) behind one suite.

**Also (1.1a):** export `cbor.js` from the shared barrel (`index.ts:176-207` doesn't); delete web's 200-LOC `CborDecoder` (`nitro-attestation.ts:174-373`) — the **4th** decode copy.

### 1.2 — Pin the byte-exactness invariant against the _real_ encoder, not a mirror

**Domain:** shared/test · **Category:** Correctness-adjacent · **Risk:** Low
The headline ES384 test (added in the recent audit) asserts `deepEqual(rebuilt, sigStructure)` where `rebuilt` uses a **locally reinlined** encoder (`cbor.test.mjs:131-152`, comment: _"Mirrors cborEncodeSigStructure"_) — it proves the test's copy agrees with itself, not that production does. If production's length-class thresholds drift, this test stays green while a real attestation breaks.
**Fix:** import the encoder from its real home (post-1.1, from shared). Turns a green-tests-broken-prod gap into a real regression gate.

### 1.3 — Adopt the web verifier's stricter cert-chain check on the relayer submit path

**Domain:** crypto · **Category:** System-design/correctness · **Risk:** Med
Relayer `verifyCoseSign1Crypto` (`attestation.js:120-139`) checks only each cert is signed by the next + top→root by public key. Web (`nitro-attestation.ts:644-701`) **also** checks validity windows, `checkIssued`, CA `basicConstraints`, and pins root by exact DER SHA-256. The relayer is the path that actually submits on-chain — it should be **at least** as strong.
**Fix:** lift web's `verifyCertChain` (+ fingerprint-pinned root) into the shared suite (1.1); relayer uses it when a root is pinned. Keep the relayer's `checked:false` (no hard-fail) backward-compat when no root is set.

---

## Tier 2 — Hot-path performance in the relayer

### 2.1 — Deduplicate per-event Supabase writes (N+1 on the fulfillment hot path)

**Domain:** relayer · **Category:** Perf · **Risk:** Low
A single successful fresh fulfillment triggers `maybeUpsertJob('processing')` (`fulfillment.js:1632`) → `maybeUpsertJob('fulfilled')` (`:1700`); the retry path upserts at up to 4 more sync points (`:1240,1338,1420,1533`). Each is a fresh `fetch` to Supabase REST with full `buildRelayerJobRecord` rebuilt, serially awaited.
**Fix:** (a) skip the intermediate `processing` write when a terminal write follows in the same tick; (b) coalesce through the existing `createPersistor` trailing-write pattern (`queue.js:27-65` already coalesces _file_ writes — extend to queue one trailing PATCH).
**Impact:** removes 1–3 synchronous HTTP round-trips per event — the dominant tail latency under `concurrency:8` block bursts.

### 2.2 — Drop the redundant `getblockcount` health probe before every on-chain submit

**Domain:** relayer · **Category:** Perf · **Risk:** Med
`fulfillNeoN3Request` opens with `ensureHealthyNeoN3Rpc` → a full `getblockcount` RPC, then `buildSignAndBroadcastNeoN3Tx` does **its own** `getblockcount` (`neo-n3.js:700`) for `validUntilBlock`. So each submit does 2× `getblockcount`.
**Fix:** drop the standalone probe from the submit path; fold URL promotion (`promoteNeoN3RpcUrl`) into the first `getblockcount` inside `buildSignAndBroadcastNeoN3Tx`.
**Impact:** 1 fewer RPC round-trip (up to 30s timeout) per Neo N3 submission.

### 2.3 — Make the request-cursor scan use the indexer REST path by default

**Domain:** relayer · **Category:** Perf · **Risk:** Low
`scanNeoN3OracleRequestsById` (`neo-n3.js:530-561`) does one `invokefunction getRequest` **per request id** — up to `maxBlocksPerTick` serial-ish RPCs. The indexer REST path (`scanNeoN3OracleRequestsViaN3Index`, `:469`) already exists and returns notifications in one paginated call.
**Fix:** when `indexerUrl` is configured (already checked at config build), make the indexer path the default for request-cursor reconciliation too. Cold-start catch-up goes from minutes to sub-second.

### 2.4 — Memoize the resolved local verifier account per network

**Domain:** relayer · **Category:** Perf · **Risk:** Low
`resolveLocalVerifierAccount` (`fulfillment.js:321-350`) runs on every `signFulfillmentPayload` for neo_n3: it scans all ~45 `NEO_N3_SIGNER_ENV_KEYS`, derives up to 6 `neonWallet.Account` objects, finds the match — all deterministic from `(network, env)` which are immutable for the process.
**Fix:** memoize per `config.network` at module/config-build time.
**Impact:** removes ~45 env lookups + up to 6 EC key derivations per signed callback.

---

## Tier 3 — God-object decomposition (maintainability, lower risk)

### 3.1 — Split `processEvent` (385-LOC god-function)

**Domain:** relayer · **Category:** Architecture · **Risk:** Med
`fulfillment.js:1557-1942` orchestrates claim + 3 dispatch lanes + retry/exhaust across 4 arms + local-state mutation + durable-queue mirror + metrics + 4 log sites in one function; the catch alone is ~200 LOC.
**Fix:** extract `handleFreshRequest` / `handleRedelivery` / `handleFinalizeOnly` lane handlers + reuse the existing `resolveDeliveryRetryOrExhaust`. `processEvent` keeps only claim/try/catch framing (~60 LOC). Makes the 3 lanes independently testable.

### 3.2 — Split `feeds.js` (974-LOC god-module) and extract orchestrator

**Domain:** nitro-worker · **Category:** Architecture · **Risk:** Low-Med
`handleOracleFeed` (`oracle/feeds.js:626-941`) is a ~315-LOC inline orchestrator mixing record-merge + submission + state mutation + scheduling.
**Fix:** extract per-symbol processing + post-submission state reconciliation into `feeds/orchestrator.js`; move the ~30 `__...ForTests` re-exports into one harness file. Target `feeds.js` < ~300 LOC.

### 3.3 — Finish the half-done utility consolidation

**Domain:** cross-cutting · **Category:** Architecture · **Risk:** Low
The lib/ extraction centralized `trimString`/`normalizeRequestType`/secret-redaction/retry but stopped halfway. Still duplicated (with **divergent contracts** — a latent bug source):

- `normalizePublicKey` ×3 (`attestation.js:9` returns `''` on invalid; `neo-n3.js:575` **throws**; `lib/neo-signers.js:210`) — _same name, opposite error contract._
- `snapshotSignerEnv` ×3 (nitro-worker), `getSupabaseRestConfig` ×3, `isPlainObject` ×4, `normalizeBoolean` ×3 (despite a canonical one in `core.js:121`).
- `uniqueOrdered` ×3, `strip0x` ×2, `sha256Hex` ×2, `resolveSupabaseNetwork` ×2.

**Fix:** hoist into `lib/neo-keys.js`, `lib/objects.js`, `lib/supabase.js`, `platform/supabase.js`. Preserve the throwing variant behind a flag. ~80 LOC deduped + removes the `normalizePublicKey` divergence.

---

## Tier 4 — Consistency / correctness-adjacent (prevents future bugs)

### 4.1 — Centralize error classification (transient vs permanent)

**Domain:** relayer · **Category:** System-design · **Risk:** Med
Transient-vs-permanent classification is scattered across 3 divergent keyword sets: `classifyError` (`fulfillment.js:178` `\b(429|408|425|500|502|503|504)\b`), `isTransientDurableQueueError` (`queue.js:263` substring `'503'` — over-matches), `isSupabaseConnectivityError` (`persistence.js:112`). They decide retry vs on-chain dead-letter and **can disagree on the same error**.
**Fix:** one `lib/error-classify.js` `classifyTransient(message)`; domain predicates compose on it. Net: a callback retried via the fulfillment path but dead-lettered via the queue path becomes consistent.

### 4.2 — Single state-machine for automation claim/reclaim decisions

**Domain:** relayer · **Category:** System-design · **Risk:** Med
The "is this a reclaim of an in-flight vs fresh claim" decision is encoded 3× with subtle variations (`automation.js:641`, `:739-742` inline, `:220`). All test `status==='processing' || (status==='paused' && …===CLAIM_MARKER)` but diverge on edge cases.
**Fix:** extract `automationJobStateMachine` with `isInFlight/isReclaimable/nextExecution`. Prevents a future drift bug double-queueing an execution (durability-critical; covered by `automation-idempotency.test.mjs`).

### 4.3 — Standardize error status codes across worker lanes

**Domain:** nitro-worker · **Category:** Design · **Risk:** Med
The compute lane collapses upstream/script failures to `400` (`compute/index.js:740`); the oracle lane carefully distinguishes `502/504` with a `kind` (`fetch.js:262-292`). A relayer retrying on gateway errors won't retry a compute script-timeout. Promote the typed-error pattern worker-wide so retry policy is uniform.

### 4.4 — Resolve the N3↔EVM callback parity drift

**Domain:** contracts · **Category:** Design · **Risk:** Med
N3 fulfillment now does rich `onMiniAppResult` → legacy `onOracleResult` fallback. The **EVM mirror only calls the 5-arg `onOracleResult`** with no rich path (`MorpheusOracleEVM.sol:268-275`). A consumer migrated to the rich callback on N3 gets no equivalent on Neo X — a silent consumer-compat trap (the repo explicitly tracks N3/EVM parity).
**Fix:** decide which is canonical; mirror it on both chains. Adding the EVM method is additive (no break).

---

## Tier 5 — Larger / next-deployment only (document, don't rush)

### 5.1 — Stop storing the full result bytes twice per fulfillment (Neo)

`FulfillRequest` writes serialized `KernelRequest` (contains `Result`, ≤4096B) **and** `InboxItem` (also contains `Result`) — the heaviest per-request storage write, doubled (`MorpheusOracle.cs:1130 & :1152`). Option: keep `KernelRequest` authoritative, store only a flag/size in `InboxItem`, have inbox consumers read via `GetRequest`. **Med risk** — `InboxItem.Result` is in the public `GetInboxItem` ABI; gate behind a new prefix so old items stay readable.

### 5.2 — Split hot struct fields out of `MiniAppRecord`/`SystemModuleRecord`

Every `GetMiniApp` deserializes the full record even when one field is needed. Split hot fields (`CallbackContract`, `Active`, `Admin`) into own prefixed keys (O(1) single-field reads). **High risk — storage break; next-deployment only.**

### 5.3 — Extract the generic app-state KV into a sibling contract

`PutMiniAppState*`/`GetMiniAppState` shares zero state with the request lifecycle and is the most independent concern in the 1229-LOC kernel. Moveable to a new contract (appendable, no frozen-prefix break). Reduces the kernel's update blast radius and permission surface (`[ContractPermission("*","*")]` today).

---

## Suspected issues that turned out FINE (verified, no action)

- **Digest binding / `resolveDigestBinding`:** genuinely single-sourced; the sign/cross-check double-compute is intentional defense-in-depth (load-bearing comment `fulfillment.js:561-572`). Digest is byte-concat sha256, does **not** go through `stableStringify`/ICU collator — locale hazard correctly confined to advisory metadata.
- **No decode→re-encode forgery path:** `decodeCoseSign1` returns faithful raw-byte copies; `buildCoseSign1SigStructure` only prepends a length head. Verified sound.
- **`createPersistor` atomic-write / `saveRelayerState` rename / `relayNeoN3Invocation` replay-window:** all correct.
- **`fetchProviderJSON`:** well-designed (cache + dedup + circuit breaker + Retry-After). No change.
- **OracleTab / StarterStudio client-side crypto:** legitimately client-side (wallet + browser encryption). No server-only work misplaced.
- **`neodid/*` POST routes missing auth gate:** flagged for **verification** (could be a real authz gap if the enclave trusts the apps/web origin), but hinges on enclave-side policy — needs a human check, not asserted as a vuln.

---

## Suggested execution order

1. **Tier 0** (0.1–0.4) — isolated perf wins, do now, each independently shippable.
2. **Tier 1** (1.1→1.2→1.3) — one coherent COSE-verify unification; the highest architecture ROI.
3. **Tier 2** (2.1, 2.2, 2.4 low-risk first; 2.3) — relayer hot-path.
4. **Tier 3** (3.3 first — unblocks 3.1/3.2) — decomposition.
5. **Tier 4** — consistency (prevents bugs; pair each with its existing characterization tests).
6. **Tier 5** — document for next contract deployment.

_All findings above are evidence-cited in the 5 domain audit transcripts. Read-only analysis; no source modified._
