# Monorepo review — neo-morpheus-oracle (2026-05-29)

Multi-agent review (security, refactoring, quality, frontend, backend) of the whole
repo, following the `ExpireStaleRequest` fee-accounting fix. This document records
the findings and what was actioned.

## Applied & pushed to `main` (verified)

| Commit | Change | Verification |
|--------|--------|--------------|
| `3acc72c` | fix(morpheus): refund exact fee paid on request expiry | nccs compile + 15 VM/unit tests |
| `8cb1179` | chore: stop tracking compiled example contract artifacts (`examples/build/`) | git only; unreferenced |
| `fb69bb5` | fix(web): prevent path traversal in `lib/mdx.ts` docs slug | `next build` |
| `41a6fe2` | refactor(relayer): use shared `parseTimestampMs` | relayer check + 216 tests |
| `c9b2db0` | refactor(web): remove dead `OperationsTab` | `next build` |

These were limited to **behavior-preserving** changes (or a contained, verifiable
security fix) that I could prove safe. Everything below is **NOT** pushed: each is a
behavioral change to security-critical / consensus / integration code, or sits in
`apps/web` which is under concurrent edit — these need deliberate change + tests, not
a blind push to `main`.

## P0 — Investigate first (possible functional break)

1. **Relayer ↔ contract event/digest drift.** The relayer scans for an
   `OracleRequested` event (`workers/morpheus-relayer/src/neo-n3.js:325,358`) but the
   kernel emits `MiniAppRequestQueued` (`contracts/MorpheusOracle/MorpheusOracle.cs`
   event decl ~187); and events lacking `appId` sign with a legacy digest domain
   `morpheus-fulfillment-v2` (`router.js:306`, `fulfillment.js:115`) while the contract
   only accepts `miniapp-os-fulfillment-v1` over the full envelope
   (`MorpheusOracle.cs` `ComputeFulfillmentDigest` ~1363). Net effect per the backend
   agent: only `request_cursor` mode works end-to-end; notification/block-cursor modes
   discover nothing or fail signature verification. **Verify against the live
   deployment before changing** — `request_cursor` may be the intended default.

## P1 — Security (deliberate fix + test)

2. **Cross-deployment signature replay.** `ComputeFulfillmentDigest` binds domain +
   requestId + appId + moduleId + operation + success + resultHash + errorHash but NOT
   the contract script hash or network magic, so a fulfillment signature is replayable
   against any deployment sharing the verifier key (testnet→mainnet, redeploys).
   Fix: include `Runtime.ExecutingScriptHash` (+ chain id) in the signed digest on both
   contract and worker. Consensus-affecting → coordinated change + golden-vector test.
   (`MorpheusOracle.cs:~1363`, `workers/morpheus-relayer/src/router.js:292`)

3. **Unauthenticated service-role write.** `apps/web/app/api/confidential/store/route.ts:41`
   writes `morpheus_encrypted_secrets` via the service-role client (bypasses RLS),
   rate-limited only, accepting an arbitrary `project_slug`. Require an authenticated
   user/admin and verify project ownership. (NEEDS-DISCUSSION: auth model.)

4. **SSRF in oracle fetch.** `workers/phala-worker/src/oracle/fetch.js:22` guards by
   hostname string prefix only — bypassable via DNS rebinding, decimal/hex/octal IPs,
   `127.x`/`0.x`, IPv6 ULA/mapped. Resolve the host and block private/loopback/
   link-local/ULA IPs (pin the connection to the validated IP); require
   `ORACLE_HTTP_ALLOWLIST` in production.

5. **Cron auth via User-Agent substring.** `apps/web/app/api/cron/feed/route.ts:32`
   authorizes on a `vercel-cron` UA substring with no secret — spoofable. Require
   `MORPHEUS_CRON_SECRET`/`CRON_SECRET` for all callers.

6. **Supabase RLS gaps.** (a) `morpheus_requests`/`morpheus_compute_jobs` policies allow
   `project_id IS NULL` rows for any authenticated user → cross-tenant read/insert
   (`supabase/migrations/0002_*.sql:54,63,76`); scope NULL-project rows to
   `created_by = auth.uid()`. (b) `create policy if not exists` is invalid PG DDL
   (`0002/0003/0004`); wrap in the `do $$ … pg_policies … $$` guard used in
   `0006_automation.sql` so replays are idempotent.

7. **Timing-unsafe token comparison.** `apps/web/lib/server-supabase.ts:145`,
   `lib/control-plane-auth.ts:19`, `app/api/cron/feed/route.ts:26` compare API keys with
   `===`/`includes`. Use `crypto.timingSafeEqual` over equalized-length buffers (the
   worker already does). SAFE-REFACTOR but in `apps/web` (concurrent edits) → defer/coordinate.

8. **Open NEP-17 beneficiary.** `OnNEP17Payment` lets the GAS sender credit an arbitrary
   beneficiary via 20-byte `data` (`MorpheusOracle.cs:~848`); combined with sponsor
   auto-spend this is an accounting-integrity surface. Either credit only `from` or
   require `CheckWitness(beneficiary)`. (NEEDS-DISCUSSION.)

## P2 — Correctness

9. **Expiry double-counts fulfilled.** `ExpireStaleRequest` calls
   `IncrementTotalFulfilled()`/`IncrementMiniAppFulfilled()`
   (`MorpheusOracle.cs:~642`), so expirations inflate "fulfilled" SLA metrics. Use a
   separate expired counter or skip the increment. (Contract change → recompile+test.)

10. **Cross-network `event_key` collision.** `morpheus_relayer_jobs.event_key` is globally
    unique (`supabase/migrations/0004_relayer_ops.sql:14`) but the key omits network in
    request_cursor mode → testnet/mainnet same requestId collide and the second job is
    dropped. Make the unique/conflict key `(network, event_key)`.

11. **Fulfill broadcast not confirmed.** `fulfillNeoN3Request` returns after
    `sendRawTransaction` and swallows the app-log "not found" as `vm_state:UNKNOWN`
    success (`workers/morpheus-relayer/src/neo-n3.js:807`), so a later on-chain FAULT is
    recorded as fulfilled. Poll app log to HALT/FAULT with backoff before settling.

12. **DataFeed has no monotonicity guard.** `UpdateFeedInternal` accepts any
    `roundId`/`timestamp` (`contracts/MorpheusDataFeed/MorpheusDataFeed.cs:120`); a buggy/
    compromised updater can overwrite fresh data with stale. Enforce
    `roundId > existing` and non-decreasing timestamp.

13. **Aggregation bias.** Two-source divergence returns the *lower* price
    (`workers/phala-worker/src/oracle/aggregation.js:61`), and `minProviders` isn't
    re-checked after outlier rejection (`:86`). Decide fail-closed vs median and test.

14. **"VRF" is signed CSPRNG.** `workers/phala-worker/src/oracle/vrf.js:5` returns
    `crypto.getRandomValues` with a signature but no VRF proof. Rename/document to avoid
    a verifiable-randomness expectation, or implement a real VRF.

## P3 — Test coverage (highest-value gaps)

- **VM tests** (port the `MorpheusOracleFeeAccountingTests` harness): `FulfillRequest`
  signature verification (valid/forged/unset-verifier/already-fulfilled); NeoDID
  nullifier double-spend revert; DataFeed/Consumer non-authorized-caller revert.
- **Cross-language golden vector** pinning the JS `buildFulfillmentDigestBytes` to the
  C# `ComputeFulfillmentDigest` so digest drift fails a test (relates to P0/P1#2).
- **Relayer** `processEvent` retry-exhaustion / double-finalize branches
  (`fulfillment.js:960-1057`).
- **Web**: add vitest coverage thresholds; cover `control-plane-auth`, `onchain-state`,
  `feed-sync`.

## P3 — Quality / tech-debt (safe, mechanical, deferred)

- **ESLint ignores `workers/**`, `scripts/**`, `contracts/**`** (`.eslintrc.json:30`) —
  root cause of accumulated duplication; narrow the ignore (start with `no-unused-vars`).
- **`trimString` duplicated ~29×** across workers/web; canonical export exists in
  `packages/shared`. Also `strip0x`, `uniqueOrdered`, `normalizeHash160/PublicKey/Signature`,
  Neo stack-item decoders, the GAS contract-hash literal, and the price-decimals constant
  are duplicated — consolidate into `packages/shared` (verify byte-identical; signing-
  adjacent ones need tests).
- **`workers/phala-worker/src/oracle/feeds.js`** is 1513 LOC / ~80 functions — split into
  cohesive modules (behavior-preserving).
- **Frontend**: 12 static docs pages are needless `'use client'`; full `highlight.js`
  imported into client bundles; unused `ethers` dep; pervasive `any` at `/api/*`
  boundaries; a typed `fetchJSON<T>` helper sits unused. (All in `apps/web` — coordinate
  with the active UI work.)

## Notes

- `apps/web` is under **concurrent edit** by the repo owner (commit `57bfce9` and current
  uncommitted changes). I deliberately avoided further `apps/web` edits to prevent
  collisions; the two web changes already pushed were surgical and verified.
- Toolchain to build/test contracts: see memory `neo-contracts-build-test-toolchain`.
