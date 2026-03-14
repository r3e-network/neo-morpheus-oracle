# Testing Ledger

Last updated: 2026-03-14

This document is the canonical test ledger for the current Neo Morpheus Oracle repository state.

It answers four questions:

1. What code was used for validation?
2. What network / contracts / TEE deployment were tested?
3. Which on-chain transactions were produced by the tests?
4. What exact results were accepted?

Use this document together with:

- `docs/ACCEPTANCE_REPORT_2026-03-10.md`
- `docs/MAINNET_PRIVACY_VALIDATION_2026-03-11.md`
- `docs/NEODID_WEB3AUTH_RUNTIME_MAINNET_2026-03-12.md`
- `docs/AA_V3_TESTNET_VALIDATION_SUITE_2026-03-14.md`
- `docs/PAYMASTER_AA_TESTNET_VALIDATION_2026-03-14.md`
- `docs/AA_NEODID_ORACLE_INTEGRATED_ATTACK_MATRIX_2026-03-13.md`
- `examples/deployments/mainnet-privacy-validation.latest.json`

## 0. Environment Split

Canonical environment descriptors are now separated explicitly:

- mainnet registry: `config/networks/mainnet.json`
- testnet registry: `config/networks/testnet.json`
- mainnet Phala descriptor: `phala.mainnet.toml`
- testnet Phala descriptor: `phala.testnet.toml`
- generated mainnet runtime env: `deploy/phala/morpheus.mainnet.env`
- generated testnet runtime env: `deploy/phala/morpheus.testnet.env`

Operational rule:

- do not reuse signers, RPC endpoints, contract hashes, or generated env files across networks
- the small testnet CVM and the medium mainnet CVM are intentionally separated to prevent mixed-runtime evidence

## 1. Canonical Environment

### Neo N3 Mainnet

- Oracle contract: `0x017520f068fd602082fe5572596185e62a4ad991`
- Oracle NeoNS: `oracle.morpheus.neo`
- Datafeed contract: `0x03013f49c42a14546c8bbe58f9d434c3517fccab`
- Datafeed NeoNS: `pricefeed.morpheus.neo`
- Callback consumer: `0xe1226268f2fe08bea67fb29e1c8fda0d7c8e9844`
- Example validation consumer: `0x89b05cac00804648c666b47ecb1c57bc185821b7`
- Example reader: `0x11e454261c21a32f1c9262472ca72a3156f9051f`
- Request fee: `1000000` datoshi = `0.01 GAS`
- Public confidential payload algorithm: `X25519-HKDF-SHA256-AES-256-GCM`
- Oracle encryption metadata publish tx: `0xb68299bbc0aa1b8529acdcda3877378ded1f0f29500a2e13f5638e3ec081bd2a`

### Phala Runtime

- App id: `966f16610bdfe1794a503e16c5ae0bc69a1d92f1`
- Public endpoint: `https://966f16610bdfe1794a503e16c5ae0bc69a1d92f1-80.dstack-pha-prod9.phala.network`
- Verified `/oracle/public-key` response:
  - `algorithm = X25519-HKDF-SHA256-AES-256-GCM`
  - `public_key_format = raw`
  - `key_source = dstack-sealed`
- Current validated compose hash from the latest mainnet privacy matrix:
  - `0529396fc1e09cbb7b0078ef960a0d26d2cf4a04550378057702026de7423615`
- Current validated NeoDID Web3Auth runtime state after the 2026-03-12 production rollout:
  - `audience_configured = true`
  - `derives_provider_uid_in_tee = true`
  - `jwks_url = https://api-auth.web3auth.io/.well-known/jwks.json`
  - `verification_public_key = 030f53dc945897a361b2044aed742cc0bdd42f87f0df5783c4c1344875ee52bcf7`
  - positive live Web3Auth JWT validation completed
  - large JWT Oracle requests now require `encrypted_params_ref` short-reference mode to stay within Neo N3 notification limits

## 2. Code Under Test

| Area | Primary code | Supporting code | What it validates |
| --- | --- | --- | --- |
| N3 Oracle callback example | `examples/scripts/test-n3-examples.mjs` | `examples/contracts/n3/UserConsumerN3.cs`, `examples/contracts/n3/FeedReaderN3.cs` | Provider callback, encrypted compute callback, sponsored callback, custom URL callback, on-chain feed read |
| Mainnet privacy matrix | `examples/scripts/test-n3-privacy-matrix.mjs` | `examples/scripts/common.mjs` | Public params, encrypted params, encrypted payloads, custom URL, custom JS, callback verification envelope |
| N3 builtin suite | `examples/scripts/test-n3-builtins.mjs` | `examples/scripts/lib-builtins.mjs` | All builtin compute families and expected outputs |
| N3 automation | `examples/scripts/test-n3-automation.mjs` | Supabase-backed automation tables | One-shot registration, queued execution, interval registration, cancellation, Supabase persistence |
| Worker runtime | `workers/phala-worker/worker.test.mjs` | worker runtime modules under `workers/phala-worker/src/` | X25519 transport, timeouts, script isolation, WASM runtime, feed batching, relayer helpers |
| Frontend / docs consistency | `scripts/check-web-consistency.mjs` | `apps/web/`, `workers/phala-worker/src/`, `config/networks/mainnet.json` | Builtin catalog parity, feed pair parity, mainnet address parity, stale-doc regression detection |
| Frontend production build | `npm run build:web` | `apps/web/` | Type-safe production frontend build and route generation |
| AA V3 validation baseline | external AA testnet suite | `../neo-abstract-account/docs/reports/2026-03-14-v3-testnet-validation-suite.md` | Smoke, verifier / hook primitives, paymaster policy abuse checks, and sponsored relay execution before cross-system NeoDID + Oracle integration |

### AA V3 Testnet Baseline

The standalone AA V3 baseline was refreshed on 2026-03-14 and now covers more than the earlier plugin-only matrix.

Reference:

- `docs/AA_V3_TESTNET_VALIDATION_SUITE_2026-03-14.md`

What is now covered upstream before Morpheus-side integrated testing:

- V3 smoke execution
- verifier / hook primitive matrix
- paymaster policy deny-path matrix
- paymaster-sponsored relay success path

## 3. Artifact Index

| Artifact | Kind | Network | Notes |
| --- | --- | --- | --- |
| `docs/MAINNET_PRIVACY_VALIDATION_2026-03-11.md` | Human report | Neo N3 mainnet | Full 7-case confidential Oracle / compute matrix |
| `docs/NEODID_WEB3AUTH_RUNTIME_MAINNET_2026-03-12.md` | Human report | NeoDID Web3Auth runtime | Production rollout, backup, direct live Web3Auth validation, encrypted validation, and Oracle callback validation via `encrypted_params_ref` |
| `examples/deployments/mainnet-privacy-validation.latest.json` | Machine-readable report | Neo N3 mainnet | Same matrix as JSON |
| `docs/N3_EXAMPLES_VALIDATION_MAINNET_2026-03-11.md` | Human report | Neo N3 mainnet | Latest mainnet example-consumer provider / compute / sponsored / custom URL / feed read run |
| `examples/deployments/n3-examples-validation.mainnet.latest.json` | Machine-readable report | Neo N3 mainnet | Same latest example-consumer run as JSON |
| `docs/FEED_SOURCE_VALIDATION_MAINNET_2026-03-11.md` | Human report | TwelveData source validation | Verifies current canonical feed catalog mappings against the live source API |
| `examples/deployments/feed-source-validation.mainnet.latest.json` | Machine-readable report | TwelveData source validation | Same source-validation run as JSON |
| `docs/ACCEPTANCE_REPORT_2026-03-10.md` | Acceptance report | Neo N3 mainnet | Smoke, example consumer, builtins, automation, feed sync, operational fixes |
| `examples/deployments/test-n3.latest.json` | Machine-readable sample report | Neo N3 testnet | Provider / compute / custom URL / on-chain feed read |
| `examples/deployments/test-neox.latest.json` | Partial log only | Neo X testnet | Not a canonical structured validation artifact |

Current report generator outputs after the latest script upgrade:

- `examples/scripts/test-n3-examples.mjs`
  - JSON latest: `examples/deployments/n3-examples-validation.<network>.latest.json`
  - Markdown: `docs/N3_EXAMPLES_VALIDATION_<NETWORK>_<DATE>.md`
- `examples/scripts/test-n3-builtins.mjs`
  - JSON latest: `examples/deployments/n3-builtins-validation.<network>.latest.json`
  - Markdown: `docs/N3_BUILTINS_VALIDATION_<NETWORK>_<DATE>.md`
- `examples/scripts/test-n3-automation.mjs`
  - JSON latest: `examples/deployments/n3-automation-validation.<network>.latest.json`
  - Markdown: `docs/N3_AUTOMATION_VALIDATION_<NETWORK>_<DATE>.md`

Catalog note:

- The historical mainnet acceptance evidence in this ledger still reflects the 14-pair synchronized catalog that was live during the recorded validation window.
- The repository default feed catalog may be expanded further in code and env configuration after that point; treat new configured pairs as pending sync until a fresh deployment / validation report records them on-chain.

## 4. Neo N3 Mainnet Transaction Ledger

### 4.1 Mainnet Privacy Matrix

Source:

- Script: `examples/scripts/test-n3-privacy-matrix.mjs`
- JSON: `examples/deployments/mainnet-privacy-validation.latest.json`
- Markdown: `docs/MAINNET_PRIVACY_VALIDATION_2026-03-11.md`

| Case id | Request type | Code path | Txid | Request id | Result | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `provider_plain` | `privacy_oracle` | builtin provider, public params | `0x4fb49cff2356fa7b0bb378c294aa0eeac1ddc07b5791ebe7b4c36bd4223bc984` | `108` | `"2.503"` | pass |
| `provider_encrypted_params` | `privacy_oracle` | builtin provider, encrypted `json_path` | `0xb23f818efa9a792ecda0e5ee7c6fdea6cbbe2b63a8d2e0462e8227e900dde9cc` | `109` | `"2.503"` | pass |
| `compute_builtin_encrypted` | `compute` | encrypted builtin payload | `0x6785367384bba7f398a9cdcf3170c702df7cb5b67dbac8d781397bd773d10f85` | `110` | `{"value":"4"}` | pass |
| `compute_custom_script_encrypted` | `compute` | encrypted custom JS compute | `0xb4ba994236103643d7610ca7b9b7366ee134c65d87fc09fe0ad89603bff0ad14` | `111` | `42` | pass |
| `oracle_custom_url_encrypted_params` | `oracle` | custom URL + encrypted params | `0x731f9061e56509a795082f4575cf1636bb1c902d628b75186ff6d7e12feed956` | `112` | `"neo-morpheus"` | pass |
| `oracle_custom_url_encrypted_script` | `oracle` | custom URL + encrypted params + custom JS | `0x57b9618406863a1ed15c6e660900228c40ed695d3dff8de9807b2894171c2d7e` | `113` | `"neo-morpheus-script"` | pass |
| `provider_encrypted_script` | `privacy_oracle` | builtin provider + encrypted custom JS | `0x4393b903844d51822f28192937652bcc0eb63d400824f3b9bfb34a9e24045d83` | `114` | `true` | pass |

Operational notes from the same run:

- `request_fee = 1000000`
- `request_credit_deposited = 7000000`
- `request_credit_remaining = 0`
- All 7 requests produced successful callback envelopes with verification metadata.

### 4.2 Mainnet Smoke And Example Consumer

Source:

- `docs/ACCEPTANCE_REPORT_2026-03-10.md`
- `examples/scripts/test-n3-examples.mjs`

#### Initial live mainnet smoke

| Case | Txid | Request id | Result |
| --- | --- | --- | --- |
| Fresh smoke request | `0xa7552a5f315caca6ecb1739e9213733cbd0087297173301350123ddacf958759` | `32` | `privacy_oracle`, callback success, extracted value `2.509` |

#### Mainnet example consumer cases

| Case | Txid | Request id | Result |
| --- | --- | --- | --- |
| Provider callback | `0x3aacbf7e12e87c73a9d983bf9d2d44fe0de2d2b5df8507df3ee3b825c88bfe8f` | `8` | success |
| Hybrid encrypted compute callback | `0x8c08206a10bbfe35eb5cf2319adc4294f32b0266dd4cd727047dd464fe746702` | `9` | success |
| Sponsored provider callback | `0x04e3050db92046b623d8d7634a876b81f28b1b967a4eff75311e443437097e87` | `10` | success |
| Custom URL oracle callback | `0x16ef1e5be1bea2c6c325ceede7aec0397f5b01eb0f7eab35db4f3d94e3da8a1b` | `11` | success |
| On-chain feed read | N/A | N/A | `TWELVEDATA:NEO-USD`, stored integer price `252`, display `2.52` |

#### Latest regenerated mainnet example consumer run

Source:

- `docs/N3_EXAMPLES_VALIDATION_MAINNET_2026-03-11.md`
- `examples/deployments/n3-examples-validation.mainnet.latest.json`

| Case | Txid | Request id | Result |
| --- | --- | --- | --- |
| Provider callback | `0x44041c38781f89abbf8ccbaceb6289c00ce23e858272b330fe72be1c6592ba5f` | `115` | extracted value `2.517` |
| Encrypted compute callback | `0xb39d14fd8b6fbc4f1adfd9c06de57f7ed83859c58e563088bb5f5081b5375e78` | `116` | builtin result `4` |
| Sponsored provider callback | `0x7a9ad19ef845787e4039d25f445fde8773f0b0ce96575bf3d20e81a4adcbfce6` | `117` | extracted value `2.51` |
| Custom URL oracle callback | `0x138715d83bf16ecddc3fc94a30c15ee09652f9f8e6fd579a239c72121e195e76` | `118` | result `neo-morpheus` |
| On-chain feed read | N/A | N/A | reader observed 14 currently synced pairs at report time |

#### Additional mainnet Oracle validation after live hot patch

| Case | Txid | Request id | Result |
| --- | --- | --- | --- |
| Smoke request | `0xc58a40a1c0153678b6f11d738bb954d11465a2c695fadd5ccd871eceea731b26` | `59` | success |
| Provider callback | `0xee45e7769dbd148ae461ce7a5441d7a3a8805a9d976878d84ab60a3bb3227994` | `62` | success |
| Hybrid encrypted compute callback | `0xc82ad15daee3a3a9311b7c675c242856ae2bd121b915bb8f60268bc7742509a0` | `63` | success |
| Sponsored provider callback | `0x3ef5fd24800e7fb66baffe249c3c217057d31828c0b5f346211f707b35640a07` | `64` | success |
| Custom URL + encrypted params | `0x070858b7a8802daa4ded16fc85dfde429a6efdb799c27d412fbd3fa0b5c1b1d5` | `65` | extracted value `neo-morpheus` |
| Custom URL + encrypted params + custom JS | `0xbd90265c6d881856d16184359afc5cc3aedc93f03ba213e33a5d90834a303289` | `68` | final result `neo-morpheus-script` |

### 4.3 Mainnet Builtin Compute Suite

Source:

- `examples/scripts/test-n3-builtins.mjs`
- `examples/scripts/lib-builtins.mjs`
- `docs/ACCEPTANCE_REPORT_2026-03-10.md`

Accepted result:

- `18 / 18` builtins succeeded on Neo N3 mainnet
- Request ids covered: `12` through `29`

Validated builtins:

- `hash.sha256`
- `hash.keccak256`
- `crypto.rsa_verify`
- `math.modexp`
- `math.polynomial`
- `matrix.multiply`
- `vector.cosine_similarity`
- `merkle.root`
- `zkp.public_signal_hash`
- `zkp.proof_digest`
- `zkp.witness_digest`
- `zkp.groth16.prove.plan`
- `zkp.plonk.prove.plan`
- `fhe.batch_plan`
- `fhe.noise_budget_estimate`
- `fhe.rotation_plan`
- `privacy.mask`
- `privacy.add_noise`

Expected values are encoded directly in `examples/scripts/lib-builtins.mjs`.

### 4.4 Mainnet Automation Ledger

Source:

- `examples/scripts/test-n3-automation.mjs`
- `docs/ACCEPTANCE_REPORT_2026-03-10.md`

| Case | Txid | Request id | Additional result |
| --- | --- | --- | --- |
| One-shot register callback | `0x63c4758212bbe78433180d4c3ee0e486b4fece7129c93b061ee7a547f0602563` | `51` | `automation_id = automation:neo_n3:1a0ffc4e-7b9d-4599-91f1-45e214b0176f` |
| One-shot queued execution | N/A (queued by scheduler) | `52` | `request_type = privacy_oracle`, extracted value `2.52`, Supabase status `completed` |
| Interval register callback | `0x66d08cb3a8a022d3cbe826c8a6697b8b215b9ced889eff332df0f4c3f03140eb` | `53` | `automation_id = automation:neo_n3:683de849-3bd8-4b90-b0de-956777cf1bfa` |
| Automation cancel callback | `0xea2494c59ee6408475e7b89a60ddf09e80a2c000cab8a28bd87e44086271e62d` | `54` | Supabase status `cancelled` |

What this validated:

- Oracle-gateway registration path
- Queued execution path
- Callback delivery path
- Supabase job / run persistence
- Cancellation semantics for interval jobs

### 4.5 Mainnet Pricefeed Sync Ledger

Source:

- `docs/ACCEPTANCE_REPORT_2026-03-10.md`
- live relayer / worker validation during acceptance

Configured policy:

- `MORPHEUS_FEED_CHANGE_THRESHOLD_BPS = 10`
- `MORPHEUS_FEED_MIN_UPDATE_INTERVAL_MS = 60000`
- `MORPHEUS_FEED_SYNC_INTERVAL_MS = 60000`

Accepted observations:

- Current production scans the configured catalog once per minute.
- When no pair exceeded `0.1%` versus the current on-chain stored value, no chain transaction was sent.
- When multiple pairs exceeded threshold, they were grouped into one batch `updateFeeds` transaction.
- Threshold comparison is now evaluated against the quantized on-chain `1 USD = 1,000,000` integer value, not raw unbounded source decimals.
- Very small source moves that remain below the `0.1%` chain-relative threshold do not emit redundant feed update transactions, even when the quantized integer changes.

Follow-up verification on 2026-03-11:

- Added regression coverage for a `1.000000 -> 1.000900` quote move, confirming that a raw `0.09%` move still does not publish under the current `1 USD = 1,000,000` scale.
- Added application-level attestation verification updates so `report_data[0:32]`, `output_hash`, and `attestation_hash` are checked consistently in the web verifier and API.

Precision migration verification on 2026-03-11:

- Global datafeed price precision was migrated from integer cents to `1 USD = 1,000,000` units.
- Canonical pairs now use direct names `FLM-USD` and `JPY-USD`.
- Historical basket keys `TWELVEDATA:1000FLM-USD` and `TWELVEDATA:1000JPY-USD` remain on-chain as deprecated append-only records.
- Production frontend `/api/feeds/status` reported `configured_pair_count = 34`, `synced_configured_pair_count = 34`, and `deprecated_chain_record_count = 2` after migration.
- Forced full-batch migration sync transaction:
  - `0x6ef958bcfba49ae9ca631cca4f58fbc090627b4d2df5b5b0c39443fcac70b035`
- Sample migrated on-chain values:
  - `TWELVEDATA:NEO-USD = 2577000` -> `2.577000`
  - `TWELVEDATA:FLM-USD = 2467` -> `0.002467`
  - `TWELVEDATA:JPY-USD = 6308` -> `0.006308`

Recorded transactions:

| Validation step | Txid | Result |
| --- | --- | --- |
| Forced full-batch feed sync | `0xa34fe7c5bfff65d1ead1d9e6be12458dfdcf76253e5694dc24c4b30b42fd1204` | single `updateFeeds` transaction containing all 14 pairs |
| Direct operator-triggered single-symbol publish | `0x39c1a67e5d5ca47728bda6798b17191adfee862a660ac4f317f8f40e492d800c` | updated `TWELVEDATA:NEO-USD`, round `1773053364`, integer price `251` |
| Forced full-batch sync after catalog expansion to 34 canonical pairs | `0x8a1da3325466bc54839dd0e52016192752ceeec9df827ba79e920a0abc58ebfa` | single `updateFeeds` transaction containing all 34 configured pairs including equities, ETFs, commodities, FX, `1000FLM-USD`, and `1000JPY-USD` |

Latest reader confirmation recorded in acceptance:

- pair: `TWELVEDATA:NEO-USD`
- round id: `1773053390`
- integer price: `253`
- timestamp: `1773158674`

Latest post-expansion confirmation:

- runtime config inside the live relayer container now includes all 34 configured canonical pairs
- the chain still returns one historical legacy key, `TWELVEDATA:FLM-USD`, in addition to the new canonical set
- integration guidance is therefore:
  - deprecated: `TWELVEDATA:FLM-USD`
  - canonical replacement: `TWELVEDATA:1000FLM-USD`
- live relayer logs after redeploy continued to show feed sync loops completing roughly every 15 to 17 seconds:
  - `2026-03-11T09:19:18.945Z`
  - `2026-03-11T09:19:36.007Z`
  - `2026-03-11T09:19:52.145Z`
  - `2026-03-11T09:20:09.385Z`
  - `2026-03-11T09:20:27.904Z`
  - `2026-03-11T09:20:45.611Z`
  - `2026-03-11T09:21:02.455Z`
  - `2026-03-11T09:21:18.542Z`

## 5. Neo N3 Testnet Sample Artifact

Source:

- `examples/deployments/test-n3.latest.json`

This is a structured sample artifact for the same example-consumer flow on testnet.

| Case | Txid | Request id | Result |
| --- | --- | --- | --- |
| Provider callback | `0x24bd11e908a20deaa028c4711daa0d81f14ac66fa6cadae051f21ad6baa0041a` | `72` | extracted value `2.49` |
| Encrypted compute callback | `0x17733321509c69527e760394b96153fb872f08d041c83334de4c8d93c572a2b4` | `73` | builtin result `4` |
| Custom URL oracle callback | `0x17b760fc02dd8b70065d745c4ffd63f4c353fbec18a7b3622fd21e94d5dcb52e` | `74` | result `neo-morpheus` |

Recorded testnet feed snapshot:

- pair: `TWELVEDATA:NEO-USD`
- round id: `1773053257`
- stored integer price: `249200000`
- timestamp: `1773076253`
- source set id: `1`

## 6. Neo X Artifact Status

`examples/deployments/test-neox.latest.json` is currently only a partial log:

- `Testing Neo X provider callback flow...`
- `Testing Neo X encrypted compute flow...`
- `Testing Neo X custom URL oracle flow...`
- `Testing Neo X datafeed publish flow...`

It is **not** a canonical structured validation artifact and should not be treated as an acceptance report.

Current repo position:

- Neo X contracts, interfaces, and example consumers exist in source.
- Neo X frontend documentation is reference-only.
- Canonical production acceptance today is Neo N3 mainnet.

## 7. Local Quality Gates

The following repository-level checks were run after the latest frontend / documentation alignment work:

| Command | Result | What it covers |
| --- | --- | --- |
| `npm run check:web-content` | pass | Frontend builtin parity, feed parity, mainnet address parity, stale-doc regression checks |
| `npm run build:web` | pass | Production frontend build, route generation, type checks |
| `npm run test:worker` | pass | 38 worker runtime tests including X25519 transport, timeouts, WASM, feed batching, and signing |

## 8. Source Reachability Validation

Source:

- `examples/scripts/validate-feed-source-mappings.mjs`
- `docs/FEED_SOURCE_VALIDATION_MAINNET_2026-03-11.md`
- `examples/deployments/feed-source-validation.mainnet.latest.json`

Result:

- Provider checked: `twelvedata`
- Canonical pair catalog checked: `34`
- Success count: `34`
- Failure count: `0`

Representative validated mappings:

- `AAPL-USD` -> TwelveData symbol `AAPL`
- `SPY-USD` -> `SPY`
- `BRENT-USD` -> `XBR/USD`
- `NATGAS-USD` -> `NG/USD`
- `COPPER-USD` -> `HG1`
- `WHEAT-USD` -> `W_1`
- `CORN-USD` -> `C_1`
- `SOY-USD` -> `S_1`
- `1000JPY-USD` -> `USD/JPY` with inverse transform and `1000 JPY` unit scaling
- `1000FLM-USD` -> `FLM/USD` with `1000 FLM` unit scaling

## 9. What To Read Next

If you need the raw case-by-case payloads and callback verification blobs, read:

- `docs/MAINNET_PRIVACY_VALIDATION_2026-03-11.md`
- `examples/deployments/mainnet-privacy-validation.latest.json`

If you need the operational narrative and the historical recovery steps, read:

- `docs/ACCEPTANCE_REPORT_2026-03-10.md`

If you need the exact example payload combinations and consumer contract patterns, read:

- `docs/EXAMPLES.md`
- `examples/contracts/n3/UserConsumerN3.cs`
- `examples/contracts/n3/FeedReaderN3.cs`
- `examples/contracts/neox/UserConsumerX.sol`
