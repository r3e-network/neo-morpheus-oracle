# Refactoring Session — Agent Audit Guide (2026-06-25)

**Scope:** Audit the 28 commits landed to `main` in range `c9cd259..cc5ee73`.
**Self-contained:** every command, every review point, every verification needed — an agent can run this end-to-end without other context.
**Author's own audit verdict:** all suites green, format/lint clean, main in sync, CI green on HEAD, cross-language parity byte-verified. This guide exists so an independent agent can reproduce that verdict and challenge it.

---

## 0. How to use this guide

```bash
git fetch origin
git log --oneline c9cd259..origin/main          # the 28 commits
git log --oneline --first-parent c9cd259..origin/main  # flat (no merges; all direct to main)
```

**Skip the noise:** 3 commits are docs/audit-only (`8b7a6b1`, `b50ea7e`, `746ea12`), 2 are roadmap docs (`8adf2fe`, round2-in-`280ede2`), 1 is a format-lapse fix (`cd6082f`). Review the **23 substantive commits** below, ordered **highest-stakes first** — stop wherever your confidence runs out.

**The four human judgments** (cannot be verified from code alone — flag for the operator, don't assert):

1. `0xf54d8584ef82315c1800373272ab08ae0db2d5ef` is the intended live mainnet oracle (the stale-address sweep `a20a9ec` assumes this).
2. The two **opt-in** backoffs (R2-0.1 `42d1045`, R2-0.2 `afe23cf`) default OFF; the operator decides whether to enable them. Verify the default is truly OFF, not the decision itself.
3. The **live submit path** is touched by `b7642ba` (probe removal) and `4c993f6` (contract dedup) — confirm the fail-fast behavior is preserved (it is, by test, but it's the live path).
4. The contract changes ship with the next contract Update (the live mainnet kernel keeps old behavior until then).

---

## 1. Verification matrix (run ALL — these are the gates)

```bash
# JS worker/shared suites
npm --prefix packages/shared test                # expect 45/45
npm --prefix workers/nitro-worker test           # expect 270/270
npm --prefix workers/morpheus-relayer test       # expect 410/410

# Web
npm --prefix apps/web run test:run               # expect 130/130 (29 files)
npm --prefix apps/web run build                  # expect exit 0

# Ops + control-plane (run by the CI matrix)
npm run test:ops                                 # expect 93/93
npm run test:control-plane                       # expect 31/31

# EVM contracts (Solidity / forge)
cd contracts-evm && forge test && cd ..          # expect 16/16

# Neo contracts (C# / dotnet — needs the env below)
export PATH="$HOME/.dotnet:$HOME/.dotnet/tools:$PATH"
export DOTNET_ROOT="$HOME/.dotnet"
export DOTNET_ROLL_FORWARD=Major
cd contracts/__tests__ && dotnet test && cd ../.. # expect 53/53

# Deploy enclave server (the trust root)
node --test deploy/nitro/enclave-server.test.mjs  # expect 37/37

# Repo-wide gates
npm run format:check                             # expect exit 0
npm run lint                                     # expect exit 0
```

**CI reproduction:** the `.github/workflows/ci.yml` matrix fans `web-and-worker` into 7 shards; `changes` job gates on paths-filter; `contracts` caches NuGet + nccs. To confirm green on HEAD:

```bash
gh run list --branch main --limit 3              # ci + deploy-web + publish-images should all be 'success'
```

**If any suite is RED:** that's the single most important finding — a regression. Stop and root-cause before reviewing anything else.

---

## 2. Review order (by stakes)

### Tier A — live on-chain contract (read closest)

- **`4c993f6`** contract storage-read dedups. Check: the 5 sites removed _truly_ redundant reads (same key, validation retained). The Neo ABI method-name set must be **byte-identical** in the regenerated artifacts (verify below). The EVM `_fulfillmentDigest` overload keeps the public view fn for off-chain pre-computation.
- **Verify the committed artifact matches the source** (the load-bearing CI check):
  ```bash
  cd contracts
  export PATH="$HOME/.dotnet:$HOME/.dotnet/tools:$PATH"
  export DOTNET_ROOT="$HOME/.dotnet"
  export DOTNET_ROLL_FORWARD=Major
  nccs MorpheusOracle/MorpheusOracle.csproj --generate-artifacts Source --output ./__tests__/Generated/
  git diff --stat __tests__/Generated/MorpheusOracle.artifacts.cs   # expect: no change
  nccs MorpheusDataFeed/MorpheusDataFeed.csproj --generate-artifacts Source --output ./__tests__/Generated/
  git diff --stat __tests__/Generated/MorpheusDataFeed.artifacts.cs # expect: no change
  ```
  If these show a diff, the committed artifacts don't match the source — a real problem.

### Tier B — security/consensus-critical

- **`26b5d6d` + `0901f2a`** COSE encoder unification. The decode was unified earlier; these unify the **encode/verify** side (3 copies → 1 in `packages/shared/src/cose-verify.js`). Check: `decodeCoseSign1` preserves the **raw** payload/header bytes (ES384 verification depends on it); the relayer now imports `buildCoseSign1SigStructure`/`coseEs384SignatureToDer` from shared; the web verifier's `buildSig1Structure` is deleted and replaced with the shared import.
- **`1da5c70`** digest parity fixture. The **highest correctness-value** item: pins a fixed golden digest on BOTH the JS relayer and the C# contract test. Verify the golden value is **byte-identical** in both files (below) — if it isn't, the parity gate is worthless.
- **`a20a9ec`** stale-address sweep. Confirm only the **historical** `claudedocs/` + `private-backups/` retain the old `0x5b49…` value; every live file (admin scripts, docs, env templates, examples, test fixtures) must be `0xf54d8584…`.

### Tier C — the live relayer submit/scan path

- **`b7642ba`** redundant `getblockcount` probe removal. The submit path's own `getblockcount` (in `buildSignAndBroadcastNeoN3Tx`) still promotes the healthy RPC URL; fail-fast is preserved. The `neo-n3.test.mjs` RPC-sequence assertion pins this (one `getblockcount`).
- **`a286327` + `f5596b6`** verifier-account memoization (Neo N3 + NeoX). Cache key includes the public key (Neo N3) / private key (NeoX); `resetLocalVerifierCacheForTests` exported for tests. A wrong-cache bug = invalid signature, which the signing tests catch.
- **`072e0a3` + `42d1045` + `afe23cf`** idle-cost trilogy. `072e0a3` (state writes) is always-on and safe; `42d1045` (chain discovery) and `afe23cf` (automation fetch) are **opt-in via env, default OFF**. For the opt-in ones, confirm the default is OFF and that `runDueRetries` always runs regardless (so due callbacks are never delayed).

### Tier D — explicit behavior calls / new module additions

- **`75e0ab2`** callback-method SSOT. New `packages/shared/src/callback-methods.js`; the relayer's 3 dispatch sites import `LEGACY_CALLBACK_METHOD`. The contracts keep their literals (golden value). Verify parity (below).
- **`ca1ce11`** RPC fallback sync. Investigation found the registry IS the SSOT (already loaded ahead of the hardcoded list); this commit only syncs the hardcoded _fallback_ list. Low value but low risk.
- **`1f1fdb6`** web operation-log deferral. Uses Next.js `after()` (the pattern already in `betterstack-log-sink.ts`). The `flushPendingOperationLogs()` test-only export exists because `after()` is non-awaitable. Verify the health-route decoupling test still passes.
- **`e670938` + `7b94a6b` + `e84fd20` + `cc5ee73`** CI efficiency (paths-filter, NuGet cache, 7-suite matrix, paths-filter v4 bump). Pure CI plumbing; verify the matrix actually fans out (the `gh run view` job list should show 7 `web-and-worker (...)` shards).

### Tier E — skim (lowest risk, behavior-preserving)

- **`6a543fc`** redundant TEE attestation (6 lanes) — `signed.tee_attestation` reused, byte-safety verified via `normalizeReportData`.
- **`aacaf84`** serial→concurrent price fetch — `Promise.allSettled`, input-order preserved.
- **`746ea12`** ZKP size-limit dedup + RPC race doc — behavior-preserving.
- **`5f090f8`** async nsm-attest — `execFileSync` → `execFile` (Promise-wrapped); produced bytes identical.
- **`cebca8c`** signer-key memoization (enclave) — cache cleared on `/provision` + KMS materialization.
- **`7b94a6b`** (enclave part) redundant PCR decode — `handleAttestation` already extracts pcrs.

---

## 3. Cross-language parity (verify byte-equality directly, not via test-pass proxy)

```bash
# Digest golden vector (R2-3.1) — these two hex strings MUST be identical:
grep 'cf2832f7e5ab9a37a6c93907be5d7762d7b6c62c256363df432adc7b2fb2192e' \
  workers/morpheus-relayer/src/identifier-hygiene.test.mjs
grep 'cf2832f7e5ab9a37a6c93907be5d7762d7b6c62c256363df432adc7b2fb2192e' \
  contracts/__tests__/MorpheusOracleGoldenDigestTests.cs
# Both must print the line; if either is missing or differs, parity is broken.

# Callback method (R2-3.2) — must be 'onOracleResult' in both:
grep "LEGACY_CALLBACK_METHOD = 'onOracleResult'" packages/shared/src/callback-methods.js
grep 'LEGACY_CALLBACK_METHOD = "onOracleResult"' contracts/MorpheusOracle/MorpheusOracle.cs
```

**Also run both golden-vector tests in isolation** to confirm they actually pass (not just that the strings match):

```bash
npm --prefix workers/morpheus-relayer test 2>&1 | grep "cross-language golden vector"   # ✔
cd contracts/__tests__ && dotnet test --filter "N3FulfillmentDigestMatchesGoldenVector" && cd ../..
```

---

## 4. The stale-address sweep (a20a9ec) — exhaustive check

The prior catalog-sweep missed 13 files. This commit swept them. Verify NOTHING live still carries the stale value:

```bash
# Should return ONLY claudedocs/ (historical records) — nothing live:
grep -rln '5b492098fc094c760402e01f7e0b631b939d2bea' \
  --include='*.json' --include='*.mjs' --include='*.ts' --include='*.tsx' \
  --include='*.md' --include='*.example' --include='*.env*' . \
  | grep -vE 'node_modules|\.next/' | sort
# Expect exactly: claudedocs/audit-2026-06-24.md + claudedocs/refactoring-roadmap-2026-06-24-round2.md
```

---

## 5. Specific things to challenge (where a green test isn't enough)

1. **The opt-in backoffs (R2-0.1 `42d1045`, R2-0.2 `afe23cf`) default OFF.** Confirm `config.discoveryIdleBackoffMs` and `config.automation.idleBackoffMs` resolve to 0 when the env vars are unset. A default-on bug would delay events on live deployments.
2. **The verifier-cache invalidation (`a286327`, `cebca8c`).** Confirm the cache is cleared on EVERY key-rotation path (`/provision` env mutation + KMS materialization). A missed invalidation = signing with a stale key after rotation = invalid signatures.
3. **The `flushPendingOperationLogs()` export (`1f1fdb6`).** It's test-only; confirm no production code path calls it (it would defeat the post-response deferral).
4. **The CI matrix `fail-fast: false` (`e84fd20`).** Intentional (so one suite failing doesn't cancel others) — but confirm it doesn't mask a consistently-failing shard.
5. **The async nsm-attest (`5f090f8`).** Both `handleAttestation` callers now `await` it; confirm neither caller forgot the `await` (a forgotten await would race the response).
6. **The `cd6082f` format-lapse.** The one CI failure this session. Confirm `format:check` passes on HEAD (it does) and that the lesson (run repo-wide format:check pre-push, not per-file) is reflected in this guide.

---

## 6. What was deliberately NOT done (flagged, not shipped)

These are documented in `claudedocs/refactoring-roadmap-2026-06-24-round2.md` as larger architectural work, recommended as dedicated reviewed PRs:

- **R2-2.5** enclave-server god-server split (1856 LOC → 7 modules) — assessed: high-effort, low incremental value per extraction (`process.env` state-bus coupling remains).
- **R2-3.3** shared `FulfillmentRequest`/`Result` schema SSOT — blast radius large.
- **R2-3.4** env-key catalog promotion to `packages/shared` — security-sensitive.
- **Tier 1.3** (round-1 roadmap) relayer cert-chain hardening — could reject a currently-accepted live attestation near cert-expiry edges.

An auditor reviewing these should treat them as **proposals**, not regressions — none are in the commit set.

---

## 7. Sign-off checklist

- [ ] All 10 verification suites pass (Section 1).
- [ ] `format:check` + `lint` exit 0 (Section 1).
- [ ] CI green on HEAD `cc5ee73` (Section 1).
- [ ] Regenerated Neo artifacts match committed (Section 2, Tier A).
- [ ] Digest golden vector byte-identical in JS + C# (Section 3).
- [ ] Callback method byte-identical in JS + C# (Section 3).
- [ ] No live file carries the stale `0x5b49…` address (Section 4).
- [ ] The 6 "challenge" items in Section 5 inspected (not just test-pass proxy).
- [ ] The 4 human judgments (Section 0) flagged to the operator.

**If all boxes check:** the session work is verified sound. If any fails: that's the finding — root-cause before merging anything further.
