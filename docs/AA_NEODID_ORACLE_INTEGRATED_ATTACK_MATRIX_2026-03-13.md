# AA + NeoDID + Oracle Integrated Attack Matrix

Date: 2026-03-13
Status: baseline refreshed; integrated adversarial execution still pending

This document defines the cross-system security matrix that should be executed after the standalone AA V3 plugin matrix.

It covers the interaction boundary between:

- `neo-abstract-account` V3 verifier / hook plugins
- Morpheus NeoDID identity and recovery flows
- Morpheus Oracle / confidential compute / callback pipeline

## 1. Dependency Baseline

The standalone AA V3 baseline was already validated separately on Neo N3 testnet.

Reference:

- `../neo-abstract-account/docs/reports/2026-03-14-v3-testnet-validation-suite.md`
- `docs/AA_V3_TESTNET_VALIDATION_SUITE_2026-03-14.md`
- `docs/AA_NEODID_ORACLE_INTEGRATED_BASELINE_2026-03-14.md`

That report establishes the baseline behavior of:

- Web3Auth / TEE / WebAuthn / SessionKey / MultiSig / Subscription verifier paths
- Whitelist / DailyLimit / TokenRestricted / MultiHook / NeoDIDCredentialHook policy paths
- live paymaster policy deny-path enforcement
- live paymaster-sponsored `executeUserOp` success

The integrated matrix below focuses on attacks that only appear when these primitives are combined with NeoDID and Oracle flows.

## 2. Main Integrated Threats

### A. DID-to-AA takeover abuse

Goal:

- use a valid Web3Auth identity proof, recovery request, or NeoDID credential event to seize or misuse the wrong AA account

Test cases:

- recovery ticket for account A submitted against account B
- valid Web3Auth proof replayed against a different `accountId`
- expired recovery / session ticket accepted after timeout
- revoked NeoDID credential still usable through `NeoDIDCredentialHook`

Expected:

- all cross-account misuse faults
- all expired / revoked state faults

Executed boundary evidence now available:

- `docs/N3_NEODID_REGISTRY_BOUNDARY_TESTNET_2026-03-14.md`

What it proves:

- `NeoDIDRegistry.UseActionTicket(...)` rejects a caller that is not the declared disposable account
- the current Oracle callback output still does not expose a ticket-level signature that `NeoDIDRegistry.UseActionTicket(...)` can consume directly, so attempting to use the envelope-level verification signature faults with `invalid verification signature`

Still pending:

- live cross-account misuse against an AA recovery verifier that already consumes NeoDID recovery tickets on-chain

### B. Oracle callback envelope mismatch

Goal:

- feed an AA-bound callback with mismatched `requestId`, `requestType`, `success`, `error`, or callback target

Test cases:

- valid worker signature over one result replayed into another callback envelope
- callback routed to a different consumer contract
- callback result reused with a different request id
- callback success/error mismatch presented to the AA-bound consumer

Expected:

- contracts and relayer reject mismatched fulfillment envelopes

Note:

- this depends on the open Morpheus fulfillment-signature hardening item remaining in `docs/SECURITY_AUDIT.md`

Executed baseline already available:

- direct external callback injection into the testnet callback consumer now faults with `unauthorized caller`
- reference artifact: `docs/N3_CALLBACK_BOUNDARY_TESTNET_2026-03-14.md`

Still pending:

- replay of a valid Oracle-originated callback envelope into a different AA-bound consumer context

### C. Confidential payload replay and reference abuse

Goal:

- replay encrypted Oracle / compute inputs, or reuse `encrypted_params_ref` / secret references across requests

Test cases:

- identical encrypted payload replayed to trigger duplicate privileged action
- `encrypted_params_ref` from user A reused in user B request
- stale ciphertext replayed after key rotation
- malicious callback tries to treat ciphertext metadata as plaintext config

Expected:

- replay-safe request accounting at the Oracle layer
- secret reference ownership checks
- no plaintext leakage into logs or callback data

### D. Session-key + Oracle escalation

Goal:

- use a narrow AA session key to trigger broader Oracle or compute authority than intended

Test cases:

- session key bound to one callback target reused for another callback target
- session key bound to one method reused to register automation or recovery
- session key used after expiry to initiate Oracle-backed privileged action

Expected:

- method and target scoping remain enforced even when Oracle / compute is the downstream business action

### E. Automation billing and periodic execution abuse

Goal:

- overrun the 0.01 GAS-per-callback model through replay, duplicate scheduler triggers, or cancellation races

Test cases:

- one automation execution billed twice
- cancelled automation still executes once more
- interval automation executes after deposit exhaustion
- scheduler sends two callbacks for one eligible interval window

Expected:

- exactly-once callback accounting
- cancellation races fail closed
- exhausted deposit blocks execution

### F. Pricefeed / Oracle trust-boundary confusion

Goal:

- misuse Oracle flows where only on-chain synchronized pricefeed data should be used, or vice versa

Test cases:

- user contract tries to simulate pricefeed updates through Oracle request path
- automation tries to write pricefeed-like values through callback path
- AA hook or verifier treats user-triggered Oracle result as canonical pricefeed state

Expected:

- pricefeed remains sync-only and operator-owned
- Oracle remains request/callback-only
- the two surfaces do not silently substitute for each other

## 3. Recommended Execution Order

1. Re-run the standalone AA V3 validation suite if the verifier / hook / paymaster integration code changed.
2. Run NeoDID recovery / credential tests without Oracle.
3. Run Oracle / confidential compute / callback tests without AA.
4. Run AA + NeoDID integration tests.
5. Run AA + Oracle integration tests.
6. Run NeoDID + Oracle integration tests.
7. Run full AA + NeoDID + Oracle end-to-end adversarial sequences.

## 4. Evidence Requirements

Each integrated test should record:

- code revision / branch
- network and deployed contract hashes
- app / worker / relayer endpoint versions
- request ids
- on-chain txids
- expected result
- actual result
- whether the case is positive or adversarial negative

## 5. Exit Criteria

The integrated matrix is only complete when:

- every positive case produces the expected on-chain result
- every adversarial negative case faults for the intended reason
- no secret plaintext is written to Supabase logs
- no callback or recovery replay succeeds
- AA account ownership, session scope, NeoDID credential state, and Oracle fulfillment context all stay correctly bound
