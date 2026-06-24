# Review guide — refactoring session (PRs #8–#16)

All 9 PRs are **already merged to `main`** (`fc049c3..c9cd259`). This guide is for a
post-merge human review. It is ordered **by risk, highest first** — review top-down and
stop wherever your confidence runs out. Each item says *what changed*, *the one thing to
scrutinize*, and *how to verify*.

## How to see the changes

```bash
git fetch origin && git log --oneline --first-parent fc049c3..origin/main   # the 9 merges
git diff fc049c3..origin/main -- <path>                                      # a specific area
```

**Skip in review:** PR #9 includes a repo-wide `prettier --write` (~84 files, whitespace
only). To exclude the formatting noise and see only logic:

```bash
git log -p fc049c3..origin/main -- <path> | grep -v '^[+-]\s*$'   # or review per-PR below
```

Per-PR diffs: `gh pr diff <N>` for N in 8..16.

---

## Tier 1 — Highest stakes: live on-chain contract (PRs #15, #16)

These change the **deployed Neo N3 kernel** (`0xf54d8584…`). Verified locally with the Neo
VM test suite *and* CI's `contracts` job, but they warrant the closest human read.

### PR #16 — `feat(contracts)`: dispatch `onMiniAppResult` with `onOracleResult` fallback
- **What:** `FulfillRequest` now calls the rich 8-arg `onMiniAppResult` (appId + requester)
  first, falling back to the legacy 5-arg `onOracleResult` for consumers that only implement
  the adapter. Previously only `onOracleResult` ever fired (consumers recorded
  `appId="legacy"`/`requester=null`). This is a **behavior change to cross-contract dispatch**
  and was a tracked next-upgrade item (`contracts/README.md`).
- **Scrutinize:**
  1. Arg order in the `Contract.Call` (`MorpheusOracle.cs`, FulfillRequest) matches the
     consumer's `OnMiniAppResult(requestId, appId, moduleId, operation, requester, success,
     result, error)`.
  2. The double `try/catch`: a reverting `onMiniAppResult` rolls back, then `onOracleResult`
     runs — confirm you're comfortable a consumer implementing **both** now receives
     `onMiniAppResult` instead of `onOracleResult` (semantic change for them).
  3. Manifest already permits both (`[ContractPermission("*", "onMiniAppResult")]`) — no
     manifest change, confirm that's correct for your deployment.
  4. **The regenerated artifact** `contracts/__tests__/Generated/MorpheusOracle.artifacts.cs`
     must match the source (it's what CI VM-tests). Diff should be the 2 embedded NEF/manifest
     lines only.
- **Decision needed:** this ships with the next `ContractManagement.Update`. Confirm that's
  intended now (the live kernel keeps old behavior until then).

### PR #15 — `perf(contracts)`: eliminate the double `MiniAppRecord` read on submit
- **What:** `ValidateRequestInputs` now *returns* the validated record; `SubmitMiniAppRequestInternal`
  reuses it instead of re-reading. Dropped two **unreachable** duplicate `Active` asserts.
- **Scrutinize:** confirm the dropped asserts were truly unreachable (RequireActiveMiniApp /
  RequireActiveModule already assert `Active` *earlier* with the same revert messages), so revert
  ordering for every reachable check is unchanged. Behavior-preserving optimization.

### Verify Tier 1 locally
```bash
export PATH="$HOME/.dotnet:$HOME/.dotnet/tools:$PATH"; export DOTNET_ROOT="$HOME/.dotnet"; export DOTNET_ROLL_FORWARD=Major
cd contracts && bash build.sh && cd __tests__ && dotnet test          # expect 51/51
# Confirm the committed artifact matches the source:
nccs ../MorpheusOracle/MorpheusOracle.csproj --generate-artifacts Source --output ./Generated/
git diff --stat Generated/MorpheusOracle.artifacts.cs                  # expect: no change
```

---

## Tier 2 — Consensus / security-critical (off-chain)

### PR #10 — `fix(attestation)`: shared CBOR/COSE codec + indefinite-length fix
- **What:** Extracted one decoder into `packages/shared/src/cbor.js`, used by both the relayer
  (verifier) and `deploy/nitro/enclave-server.mjs` (producer). Fixes a real divergence: the
  relayer *threw* on indefinite-length CBOR while the enclave decoded it to *empty*.
- **Scrutinize:** the relayer reconstructs the ES384 `Sig_structure` over the **raw**
  protected-header + payload bytes — confirm `decodeCoseSign1` preserves those bytes exactly
  (it returns `payloadBytes`/`protectedHeaderBytes` verbatim; the fixture test asserts this).
  Confirm the indefinite-length parsing (BREAK sentinel) is spec-correct.
- **Verify:** `node --test packages/shared/src/cbor.test.mjs` (12 fixtures, incl. the exact
  previously-broken case) + `npm --prefix workers/morpheus-relayer test`.

### PR #12 — `refactor(relayer)`: single-source the neo_n3 digest-binding
- **What:** `signFulfillmentPayload` (signs) and `recomputeFulfillmentDigestHex` (cross-checks)
  shared byte-identical digest-binding code; extracted `resolveDigestBinding`.
- **Scrutinize:** it's the **signing digest** — confirm the extracted helper is a literal move
  (digest bytes unchanged). The 23 digest/sign tests in the relayer suite cover it.

### PR #8 — `refactor`: 6 single-sourcing wins
- **What:** EVM `IMorpheusOracleEVM` shared interface/struct + `_grantKey`; relayer retry,
  `normalizeRequestType`, and **secret-redaction** unification; nitro signed-envelope; script
  parsers.
- **Scrutinize, in order of stakes:**
  - **EVM `Request` struct / `_grantKey`** (`contracts-evm/`): tuple layout must stay
    byte-identical (enum encodes as `uint8`). `forge test` (16) covers it. Note: `_grantKey`
    adds ~600–1200 gas/grant (not inlined) — flagged in the PR, acceptable for single-sourcing.
  - **Secret-redaction union** (`lib/secret-redaction.js`): broadened to the union of both
    sinks (closed real leaks: `API_KEY` in config dump, `service_role_key` in logs). It only
    ever *broadens* redaction — confirm no legitimate value you expect logged is now redacted.
  - The rest are mechanical single-sourcing; the PR body documents the deliberate per-item deltas.

---

## Tier 3 — Behavior changes worth an explicit look

### PR #9 — `fix(ci)`: green the CI jobs (4 root causes)
Three are mechanical (lockfile, prettier, neox `unref` deadline-timer bug). **One needs a look:**
- **Stale runtime catalog** (`apps/web/public/morpheus-runtime-catalog.json` + `config/networks/*.json`):
  the web app's displayed mainnet oracle address changed `0x5b492098… → 0xf54d8584…`.
  **Confirm `0xf54d8584…` is the intended live mainnet oracle** (it matches the repo's repoint
  commit + `mainnet.json`). The Phala explorer URLs were *preserved* (moved into config).

### PR #14 — `perf(relayer)`: batch block-scan `getapplicationlog` (N+1 → bounded concurrency)
- **What:** per-tx reads now run under `mapWithConcurrency` (inner width 4).
- **Scrutinize:** ordering + fail-fast are preserved (covered by the batched-vs-sequential
  equivalence test). The only env-dependent risk is **RPC rate-limiting** (total in-flight =
  block-width × 4); not locally testable — the conservative bound is the mitigation, and
  `config.concurrency` tunes it down.

---

## Tier 4 — Low-risk single-sourcing / perf (skim)

- **PR #11** web Neo N3 snippet builders (byte-identity test + adversarial check; user-pasted
  on-chain strings).
- **PR #13** groth16 double-eval removed (behavior-preserving; `normalizePublicSignals` is pure).

---

## One-shot verification (all green at merge)

```bash
# EVM
(cd contracts-evm && forge test)                              # 16
# Relayer + shared + nitro + ops + web
npm --prefix packages/shared test                             # 42
npm --prefix workers/morpheus-relayer test                    # 406
npm --prefix workers/nitro-worker test                        # 270
npm run test:ops && npm run test:control-plane                # 93 + 31
npm --prefix apps/web run test:run && npm --prefix apps/web run build  # 130 + build
# Contracts (needs the dotnet env exports above)
cd contracts/__tests__ && dotnet test                         # 51
# Repo gates
npm run lint && npm run format:check
```

CI (`ci` workflow) is green on `lint-and-format`, `web-and-worker`, `contracts`. The **Vercel**
check is red and **not repo-fixable** — the every-minute cron in `apps/web/vercel.json` exceeds
the Hobby-plan limit; ignore it (it is not part of the `ci` workflow).

## Sign-off checklist
- [ ] PR #16: comfortable changing live `onMiniAppResult` dispatch now (ships next Update).
- [ ] PR #9: `0xf54d8584…` is the correct live mainnet oracle for the web catalog.
- [ ] PR #14: RPC node tolerates up to `block-width × 4` concurrent `getapplicationlog` (or lower `config.concurrency`).
- [ ] PR #8 EVM: the ~600–1200 gas/grant from the non-inlined `_grantKey` is acceptable.

## Deliberately NOT done (deferred — see `claudedocs/refactoring-report-2026-06-23.md`)
Low-value/high-caveat tail only: small C# refactors (witness-guard/counter idioms,
`NetworkMagicLe4` sharing), small web dedups (`TabHeader`, `useWalletSubmit`), and the large
`OracleResponseViewer`/`ComputeOutput` web dedup (the audit's "riskiest web item").
