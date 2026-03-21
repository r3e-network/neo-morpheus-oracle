# Deployment Capacity Profiles 2026-03-20

This file captures the current recommended runtime protection profiles derived from the latest lower-impact stress probes.

These are operational starting points, not permanent ceilings.

## Profile Separation

### Testnet

- CVM: `28294e89d490924b79c85cdee057ce55723b3d56`
- Purpose: correctness, recovery, adversarial validation, queue behavior
- Interpretation: lower-bound safety floor

### Mainnet

- CVM: `ddff154546fe22d15b65667156dd4b7c611e6093`
- Purpose: production traffic
- Interpretation: higher-capacity profile, must be tuned independently of testnet

## Measured Lower-Impact Samples

The raw stress-probe report artifacts were intentionally pruned from the repository to keep the codebase clean.
Only the resulting operational recommendations are kept here.

## Recommended Testnet Starting Profile

These values are intentionally conservative and match the current generated `morpheus.testnet.env`.

- `MORPHEUS_MAX_INFLIGHT_ORACLE_QUERY=4`
- `MORPHEUS_MAX_INFLIGHT_ORACLE_SMART_FETCH=2`
- `MORPHEUS_MAX_INFLIGHT_COMPUTE_EXECUTE=2`
- `MORPHEUS_MAX_INFLIGHT_VRF_RANDOM=2`
- `MORPHEUS_MAX_INFLIGHT_PAYMASTER_AUTHORIZE=4`
- `MORPHEUS_MAX_INFLIGHT_RELAY_TRANSACTION=4`
- `MORPHEUS_MAX_INFLIGHT_NEODID_BIND=3`
- `MORPHEUS_MAX_INFLIGHT_NEODID_ACTION_TICKET=3`
- `MORPHEUS_MAX_INFLIGHT_NEODID_RECOVERY_TICKET=2`
- `MORPHEUS_RELAYER_MAX_FRESH_EVENTS_PER_TICK=16`
- `MORPHEUS_RELAYER_MAX_RETRY_EVENTS_PER_TICK=8`
- `MORPHEUS_RELAYER_DEFER_DELAY_MS=5000`

Rationale:

- `oracle_smart_fetch` is the earliest route to degrade on testnet because script timeout is the limiting factor.
- `compute_builtin` is stronger than `oracle_smart_fetch`, but still should not consume the full runtime budget.
- pricefeed stays on its own high-priority lane and is not rate-gated by the worker inflight guard.

## Recommended Mainnet Starting Profile

These values are the current generated `morpheus.mainnet.env` defaults and should be treated as an initial production baseline, not a proven ceiling.

- `MORPHEUS_MAX_INFLIGHT_ORACLE_QUERY=16`
- `MORPHEUS_MAX_INFLIGHT_ORACLE_SMART_FETCH=8`
- `MORPHEUS_MAX_INFLIGHT_COMPUTE_EXECUTE=6`
- `MORPHEUS_MAX_INFLIGHT_VRF_RANDOM=6`
- `MORPHEUS_MAX_INFLIGHT_PAYMASTER_AUTHORIZE=12`
- `MORPHEUS_MAX_INFLIGHT_RELAY_TRANSACTION=10`
- `MORPHEUS_MAX_INFLIGHT_NEODID_BIND=8`
- `MORPHEUS_MAX_INFLIGHT_NEODID_ACTION_TICKET=8`
- `MORPHEUS_MAX_INFLIGHT_NEODID_RECOVERY_TICKET=4`
- `MORPHEUS_RELAYER_MAX_FRESH_EVENTS_PER_TICK=64`
- `MORPHEUS_RELAYER_MAX_RETRY_EVENTS_PER_TICK=32`
- `MORPHEUS_RELAYER_DEFER_DELAY_MS=3000`

Observed lower-impact hints:

- mainnet `feeds_price` lossless concurrency: at least `4`
- mainnet `oracle_query` lossless concurrency: at least `4`
- mainnet `oracle_smart_fetch` lossless concurrency: at least `2`
- mainnet `compute_builtin` lossless concurrency: at least `4`

## Priority Policy

### Highest priority

- `oracle_feed`
- relayer `feedSync`

These must keep running even when user-triggered workloads are delayed.

### Medium priority

- `oracle_query`
- `paymaster_authorize`
- `relay_transaction`
- `neodid_bind`
- `neodid_action_ticket`
- `neodid_recovery_ticket`

### Lowest priority

- `oracle_smart_fetch`
- `compute_execute`
- `vrf_random`

These are the first lanes that should be deferred or constrained harder under pressure.

## Next Step

The next useful step is not simply "more concurrency". It is:

1. run longer soak tests at the current recommended inflight levels
2. run higher-concurrency mainnet read-only probes off-peak
3. measure queue growth and retry stability while feedSync remains healthy
4. then raise mainnet limits gradually only if:
   - pricefeed remains stable
   - no dead-letter growth appears
   - no retry storm emerges
