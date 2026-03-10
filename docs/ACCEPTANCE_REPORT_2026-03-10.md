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
  - `ghcr.io/r3e-network/neo-morpheus-oracle-phala-worker:sha-71f7d85`
- Current relayer image:
  - `ghcr.io/r3e-network/neo-morpheus-oracle-relayer:sha-f6d088c`
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

## Datafeed Rules Confirmed

- Datafeed publication is operator-only
- Neo N3 user requests must pay or pre-fund the `0.01 GAS` request fee
- Neo N3 sponsored fee payment works through contract-held fee credit
- Prices are stored as integer cents with two decimals
- Provider-scoped storage pairs are preserved, for example `TWELVEDATA:NEO-USD`

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
