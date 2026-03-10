# Acceptance Report

Date: 2026-03-10

## Scope

This report covers the Neo N3 mainnet deployment, runtime reconfiguration, and end-to-end validation of Morpheus Oracle after:

- `0.01 GAS` Neo N3 request-fee hardening
- contract-sponsored Neo N3 fee payment support
- operator-only integer-cents datafeed publication
- WASM execution timeout controls
- hybrid confidential payload encryption rollout

## Live Deployment

- Phala app id: `966f16610bdfe1794a503e16c5ae0bc69a1d92f1`
- Public worker endpoint:
  - `https://966f16610bdfe1794a503e16c5ae0bc69a1d92f1-80.dstack-pha-prod9.phala.network`
- Current worker image:
  - `ghcr.io/r3e-network/neo-morpheus-oracle-phala-worker:sha-d7f3499`
- Current relayer image:
  - `ghcr.io/r3e-network/neo-morpheus-oracle-relayer:sha-d7f3499`
- Runtime network:
  - `mainnet`

## On-Chain Contracts

### Neo N3 Mainnet

- Oracle: `0x017520f068fd602082fe5572596185e62a4ad991`
- Callback consumer: `0xe1226268f2fe08bea67fb29e1c8fda0d7c8e9844`
- Datafeed: `0x03013f49c42a14546c8bbe58f9d434c3517fccab`
- Example consumer: `0x89b05cac00804648c666b47ecb1c57bc185821b7`
- Example reader: `0x11e454261c21a32f1c9262472ca72a3156f9051f`
- Request fee: `1000000` datoshi = `0.01 GAS`

Deployment transactions:

- Oracle deploy: `0x3685a3b05a1fa9cbce51bf8655832d898585b4e2140cbc4f679948ed08eb4446`
- Callback deploy: `0xe73402d970cbb0fefa114c78e0ca0e74c5a018f930aa6bb9682fb305d0760731`
- Datafeed deploy: `0x610837696844b032be087619086dbfd07656502a7da21e38003aa9201858b64d`
- Oracle encryption key publish: `0xb68f81bde7d2159d5b8ca16fa028023203ad620153a046e424b618e4c3b5c0b4`
- Oracle verifier key publish: `0xa2ecc660f8e503d49e4865fcde49b73cf593f2fb94972878de7173df106ad5a2`
- Datafeed updater set: `0xe97498c9cfe3ab4e05d823679ce948dcb11c35bcdbc2f66b209f67576906d69e`
- Example consumer deploy: `0x572b38fb211dff47d909124002deba5c9697315c367e5cb53419ab0f549573b0`
- Example reader deploy: `0xa565e89aa20ddeba81a68c08bc83311ab3a82c82b0dcfa7df62c7f4d535923d2`

### Neo X Mainnet

Current status:

- canonical mainnet RPC corrected to `https://mainnet-2.rpc.banelabs.org`
- chain id confirmed as `47763`
- mainnet contract addresses are still not deployed / assigned in this repo

Deployment blocker confirmed during validation:

- user-provided Neo X EOA `0xE864216cdE1390FF3D52d2784BF965AC6e74ae99` currently has `0` balance on Neo X mainnet
- without Neo X mainnet gas funding, Oracle / Callback / DataFeed mainnet deployment cannot be completed safely

## Runtime Verification

- `GET /health` returned `status=ok`
- `GET /oracle/public-key` returned:
  - `key_source=dstack-sealed`
  - `recommended_payload_encryption=RSA-OAEP-AES-256-GCM`
  - `supported_payload_encryption=[RSA-OAEP-SHA256, RSA-OAEP-AES-256-GCM]`
- `npm run verify:n3` passed against Neo N3 mainnet:
  - registry Oracle hash matched
  - registry callback hash matched
  - callback allowlist matched
  - callback consumer Oracle reference matched
  - updater matched `NR3E4D8NUXh3zhbf5ZkAp3rTxWbQqNih32`
  - on-chain verifier public key matched the live worker signing public key

## End-to-End Validation

### Live Mainnet Smoke

Validated after the Phala app was reconfigured to mainnet and the live relayer checkpoint was reset.

- Fresh smoke request succeeded:
  - txid: `0xa7552a5f315caca6ecb1739e9213733cbd0087297173301350123ddacf958759`
  - request_id: `32`
  - request_type: `privacy_oracle`
  - callback success: `true`
  - extracted value: `2.509`

### Neo N3 Mainnet Example Consumer

Validated with `npm run examples:test:n3`.

- Provider callback succeeded:
  - txid: `0x3aacbf7e12e87c73a9d983bf9d2d44fe0de2d2b5df8507df3ee3b825c88bfe8f`
  - request_id: `8`
- Hybrid encrypted compute callback succeeded:
  - txid: `0x8c08206a10bbfe35eb5cf2319adc4294f32b0266dd4cd727047dd464fe746702`
  - request_id: `9`
- Sponsored provider callback succeeded:
  - txid: `0x04e3050db92046b623d8d7634a876b81f28b1b967a4eff75311e443437097e87`
  - request_id: `10`
- Custom URL oracle callback succeeded:
  - txid: `0x16ef1e5be1bea2c6c325ceede7aec0397f5b01eb0f7eab35db4f3d94e3da8a1b`
  - request_id: `11`
- On-chain feed read succeeded:
  - pair: `TWELVEDATA:NEO-USD`
  - stored price: `252`
  - display value: `2.52`

### Neo N3 Mainnet Builtin Compute Suite

Validated with `npm run examples:test:n3:builtins`.

- Builtins executed successfully: `18 / 18`
- Request ids covered: `12` through `29`
- Validated builtin families:
  - hashing: `hash.sha256`, `hash.keccak256`
  - crypto: `crypto.rsa_verify`
  - math: `math.modexp`, `math.polynomial`
  - matrix/vector: `matrix.multiply`, `vector.cosine_similarity`
  - Merkle: `merkle.root`
  - ZKP planning and digests:
    - `zkp.public_signal_hash`
    - `zkp.proof_digest`
    - `zkp.witness_digest`
    - `zkp.groth16.prove.plan`
    - `zkp.plonk.prove.plan`
  - FHE planning:
    - `fhe.batch_plan`
    - `fhe.noise_budget_estimate`
    - `fhe.rotation_plan`
  - privacy helpers:
    - `privacy.mask`
    - `privacy.add_noise`

### Neo N3 Mainnet Automation

Validated on mainnet against the live Phala app and example consumer.

One-shot automation:

- registration callback succeeded:
  - txid: `0x63c4758212bbe78433180d4c3ee0e486b4fece7129c93b061ee7a547f0602563`
  - request_id: `51`
  - automation_id: `automation:neo_n3:1a0ffc4e-7b9d-4599-91f1-45e214b0176f`
- queued execution callback succeeded:
  - request_id: `52`
  - request_type: `privacy_oracle`
  - extracted value: `2.52`
- Supabase automation job status:
  - `completed`

Interval automation plus cancellation:

- interval registration callback succeeded:
  - txid: `0x66d08cb3a8a022d3cbe826c8a6697b8b215b9ced889eff332df0f4c3f03140eb`
  - request_id: `53`
  - automation_id: `automation:neo_n3:683de849-3bd8-4b90-b0de-956777cf1bfa`
- cancellation callback succeeded:
  - txid: `0xea2494c59ee6408475e7b89a60ddf09e80a2c000cab8a28bd87e44086271e62d`
  - request_id: `54`
- Supabase automation job status:
  - `cancelled`

## Live Relayer Recovery

During the Phala mainnet cutover, the live relayer reused a stale persisted checkpoint:

- stale `neo_n3.last_block`: `14258261`
- actual Neo N3 mainnet height during validation: `8996621`

This prevented new mainnet Oracle requests from being scanned.

Remediation performed:

- added `MORPHEUS_RELAYER_NEO_N3_START_BLOCK` to generated Phala runtime config
- removed the stale `/data/.morpheus-relayer-state.json` file from the live relayer container
- restarted the live relayer container

Post-fix live relayer confirmation:

- first recovered checkpoint: `8996637`
- subsequent checkpoint advance observed:
  - `8996660`
  - `8996666`
- live requests `31` and `32` were fulfilled successfully after recovery

## Automation Fixes

Two production automation defects were discovered and fixed during mainnet validation:

- Neo N3 txproxy allowlist originally permitted `fulfillRequest` but not `queueAutomationRequest`
- Neo N3 event decoding originally treated 20-byte `requester` / `callbackContract` values as UTF-8 instead of `Hash160`

Repo fixes landed in:

- `workers/phala-worker/src/platform/allowlist.js`
- `workers/morpheus-relayer/src/neo-n3.js`
- `workers/phala-worker/worker.test.mjs`
- `workers/morpheus-relayer/relayer.test.mjs`
- `examples/scripts/test-n3-automation.mjs`

Live relayer was hot-patched so automation validation could complete immediately.

These automation fixes were then rolled into the official mainline images:

- PR: `#3`
- merge commit: `d7f34996301a0a610df8b8c8fce6333a4fb4c2f5`

## Datafeed Rules Confirmed

- Datafeed publication is operator-only
- Neo N3 user requests must pay or pre-fund the `0.01 GAS` request fee
- Neo N3 sponsored fee payment works through contract-held fee credit
- Prices are stored as integer cents with two decimals
- Provider-scoped storage pairs are preserved, for example `TWELVEDATA:NEO-USD`

## Post-Validation Mainnet Addendum

Additional live validation and runtime remediation were performed on 2026-03-10 after the initial acceptance pass.

### Live Runtime Rekey And Hybrid Encryption Recovery

Issue discovered:

- the live worker image `sha-d7f3499` did not fully match the current repository runtime behavior for hybrid confidential payload decryption
- a fresh encrypted compute request failed with:
  - `error:0200006C:rsa routines::data greater than mod len`

Remediation performed:

- backed up live `.env`, packed Phala runtime config, and the sealed Oracle keystore into:
  - `private-backups/966f16610bdfe1794a503e16c5ae0bc69a1d92f1/2026-03-10T13-11-20-465Z`
- inserted those backup records into Supabase `morpheus_system_backups`
- rotated the live Oracle RSA key inside the CVM and republished the new public key on Neo N3:
  - `setOracleEncryptionKey` tx: `0xb278241f7978f1cc91023ecefe5d1cfa608b23f3f45913715f8197da8a91de5b`
- hot-patched the live worker runtime to the current mainline implementations of:
  - `workers/phala-worker/src/oracle/crypto.js`
  - `workers/phala-worker/src/worker.js`
  - `workers/phala-worker/src/platform/core.js`
  - `workers/phala-worker/src/oracle/feeds.js`
  - `workers/phala-worker/src/platform/allowlist.js`
  - `workers/phala-worker/src/chain/neo-n3.js`
- hot-patched the live relayer runtime to the current mainline `workers/morpheus-relayer/src/relayer.js`

Post-fix confirmation:

- direct live `POST /compute/execute` with `RSA-OAEP-AES-256-GCM` confidential payload succeeded
- direct live `POST /oracle/public-key` again reported:
  - `recommended_payload_encryption=RSA-OAEP-AES-256-GCM`
  - `supported_payload_encryption=[RSA-OAEP-SHA256, RSA-OAEP-AES-256-GCM]`

### Additional Mainnet Oracle Validation

Validated again against Neo N3 mainnet after the live runtime hot-patch:

- smoke request succeeded:
  - txid: `0xc58a40a1c0153678b6f11d738bb954d11465a2c695fadd5ccd871eceea731b26`
  - request_id: `59`
- provider callback succeeded:
  - txid: `0xee45e7769dbd148ae461ce7a5441d7a3a8805a9d976878d84ab60a3bb3227994`
  - request_id: `62`
- hybrid encrypted compute callback succeeded:
  - txid: `0xc82ad15daee3a3a9311b7c675c242856ae2bd121b915bb8f60268bc7742509a0`
  - request_id: `63`
- sponsored provider callback succeeded:
  - txid: `0x3ef5fd24800e7fb66baffe249c3c217057d31828c0b5f346211f707b35640a07`
  - request_id: `64`
- custom URL plus encrypted params callback succeeded:
  - txid: `0x070858b7a8802daa4ded16fc85dfde429a6efdb799c27d412fbd3fa0b5c1b1d5`
  - request_id: `65`
  - extracted value: `neo-morpheus`
- custom URL plus encrypted params plus custom JS callback succeeded:
  - txid: `0xbd90265c6d881856d16184359afc5cc3aedc93f03ba213e33a5d90834a303289`
  - request_id: `68`
  - final result: `neo-morpheus-script`

### Automatic Feed Scan And Batch Sync Confirmation

The automatic PriceFeed scan-and-sync loop was revalidated directly on the live relayer and worker.

Current configured policy remained:

- `MORPHEUS_FEED_CHANGE_THRESHOLD_BPS=10`
- `MORPHEUS_FEED_MIN_UPDATE_INTERVAL_MS=15000`
- `MORPHEUS_FEED_SYNC_INTERVAL_MS=15000`

Live relayer log evidence showed repeated automatic feed-sync starts at approximately 15-second cadence, for example:

- `2026-03-10T16:04:23.706Z`
- `2026-03-10T16:04:39.995Z`
- `2026-03-10T16:04:55.670Z`
- `2026-03-10T16:05:11.178Z`

The full 14-pair live catalog was confirmed:

- `TWELVEDATA:NEO-USD`
- `TWELVEDATA:GAS-USD`
- `TWELVEDATA:FLM-USD`
- `TWELVEDATA:BTC-USD`
- `TWELVEDATA:ETH-USD`
- `TWELVEDATA:SOL-USD`
- `TWELVEDATA:TRX-USD`
- `TWELVEDATA:PAXG-USD`
- `TWELVEDATA:WTI-USD`
- `TWELVEDATA:USDT-USD`
- `TWELVEDATA:USDC-USD`
- `TWELVEDATA:BNB-USD`
- `TWELVEDATA:XRP-USD`
- `TWELVEDATA:DOGE-USD`

Two live worker validations were performed:

- normal threshold scan:
  - `symbols_count=14`
  - `sync_results_count=14`
  - `submitted_count=0`
  - `skipped_count=14`
  - interpretation: all 14 pairs were scanned; none exceeded the configured `0.1%` threshold at that moment, so no chain transaction was sent
- forced full-batch scan:
  - `symbols_count=14`
  - `sync_results_count=14`
  - `submitted_count=14`
  - `batch_submitted=true`
  - `batch_count=14`
  - single batch tx: `0xa34fe7c5bfff65d1ead1d9e6be12458dfdcf76253e5694dc24c4b30b42fd1204`
  - all 14 pairs were emitted inside the same `updateFeeds` transaction

Direct live operator-triggered single-symbol batch publication also succeeded:

- tx: `0x39c1a67e5d5ca47728bda6798b17191adfee862a660ac4f317f8f40e492d800c`
- notification pair: `TWELVEDATA:NEO-USD`
- new round id: `1773053364`
- new integer price: `251`
- new timestamp: `1773149864`

Latest on-chain reader confirmation after the automatic-scan validation window:

- pair: `TWELVEDATA:NEO-USD`
- round id: `1773053390`
- integer price: `253`
- timestamp: `1773158674`

Operational conclusion:

- automatic feed scanning is running
- all 14 configured pairs are included in scans
- only pairs that exceed `0.1%` should be queued for submission during normal operation
- all pairs that do exceed the threshold are submitted in one batch transaction via `updateFeeds`

### Remaining Operational Packaging Risk

The live CVM now reflects the corrected runtime behavior, but part of this recovery was applied through in-container hot patches.

Therefore:

- the live service is functioning correctly now
- a full worker / relayer image rebuild and Phala redeploy are still required to make these runtime fixes immutable across future container recreation

## Local Verification Performed

- `npm --prefix workers/phala-worker test`
- `npm --prefix workers/morpheus-relayer test`
- `npm --prefix apps/web run build`
- `npm run verify:n3`
- `npm run examples:test:n3`
- `npm run examples:test:n3:builtins`
- `npm run smoke:n3`

## Supabase Persistence Status

Confirmed:

- encrypted request fields remain stored as ciphertext
- operation logs and relayer runs remain enabled

Open operational issue discovered during live mainnet backfill:

- some historical relayer job records contain NUL bytes and are rejected by Postgres with:
  - `22P05 unsupported Unicode escape sequence`
- repo fix landed in:
  - `workers/morpheus-relayer/src/persistence.js`
- checkpoint auto-recovery fix landed in:
  - `workers/morpheus-relayer/src/relayer.js`
- regression tests landed in:
  - `workers/morpheus-relayer/relayer.test.mjs`
- live relayer container was hot-patched and restarted successfully
- fresh live smoke after the hotfix succeeded:
  - txid: `0x0ef1f943604a6230e50bef0d84e2c13443353860e37841d4128b058fa3c2914b`
  - request_id: `33`

Remaining packaging task:

- none for the live relayer path; the fixes were published and rolled into the official mainline relayer image
- source merge:
  - PR: `#2`
  - merge commit: `f6d088c3439fe3c3501be7c669a9ae0ab9d3e57d`

## Acceptance Result

Accepted for Neo N3 mainnet Oracle and datafeed operation.
