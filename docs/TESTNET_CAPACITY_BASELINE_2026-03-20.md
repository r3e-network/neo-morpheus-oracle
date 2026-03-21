# Testnet Capacity Baseline 2026-03-20

This document records the current lower-bound capacity observations for the testnet Oracle runtime.

Important:

- testnet CVM: `28294e89d490924b79c85cdee057ce55723b3d56`
- capacity profile: lower-capacity validation floor
- these results are not the production ceiling
- mainnet must be profiled separately on `ddff154546fe22d15b65667156dd4b7c611e6093`

## Route Profiles

### Pricefeed Read Lane

Source:

- raw probe artifact pruned from repository after baseline extraction

Observed:

- `1/2/4/8` concurrency all returned `100% 200`
- latency rose sharply by `8` concurrency
- this is a read-lane observation only, not write-lane feed publication throughput

Interpretation:

- keep read availability high
- do not bind `feeds_price` to the same protective envelope as low-priority user routes

### Oracle Query

Source:

- raw probe artifact pruned from repository after baseline extraction

Observed:

- `1/2/4/8` concurrency all returned `100% 200`
- p95/p99 increased substantially as concurrency rose

Interpretation:

- lossless handling remained intact
- latency comfort degraded early on the testnet profile
- this route should remain protected by inflight caps and relayer backpressure

### Oracle Smart Fetch

Source:

- raw probe artifact pruned from repository after baseline extraction

Observed:

- `1` concurrency succeeded
- `2+` concurrency failed due to `script execution timed out after 2000ms`

Interpretation:

- the limiting factor is script timeout budget before transport saturation
- script-bearing routes must be budgeted separately from simple fetch/query routes

### Compute Builtin

Source:

- raw probe artifact pruned from repository after baseline extraction

Observed:

- `1/2/4` concurrency returned `100% 200`
- short-run recommendation currently points to `MORPHEUS_MAX_INFLIGHT_COMPUTE_EXECUTE=4`

Interpretation:

- this is the strongest current lower-bound signal for a nontrivial workload lane
- it is still only a short validation run, not a long soak

## Current Testnet Defaults

From [morpheus.testnet.env](/Users/jinghuiliao/git/neo-morpheus-oracle/deploy/phala/morpheus.testnet.env):

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

These are intentionally conservative because the testnet CVM is the lower-bound profile.

## Next Step

Run the same presets against mainnet custom domain and mainnet Large TDX capacity profile, then derive:

- a production lossless envelope
- a production latency-comfort envelope
- separate pricefeed, query, script, and compute budgets
