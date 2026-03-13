# Testnet Runtime Remediation 2026-03-13

## Scope

- Network: `testnet`
- Oracle contract: `0x4b882e94ed766807c4fd728768f972e13008ad52`
- Example callback consumer: `0x8c506f224d82e67200f20d9d5361f767f0756e3b`
- CVM app id: `28294e89d490924b79c85cdee057ce55723b3d56`

## Verified Findings

1. `request_id = 150` was not picked up by the running relayer.
   - Root cause 1: `request_cursor` support was broken locally because relayer config never exposed `startRequestIds`.
   - Root cause 2: Neo N3 `getRequest()` decoding did not handle `Struct`, so request-cursor scans silently dropped valid requests.
   - Root cause 3: the deployed testnet relayer currently relies on `n3index_notifications`; request `150` was pending on-chain but absent from the relayer state file, so notification-only scanning was insufficient.

2. `request_id = 150` was manually executed inside the testnet CVM and returned a deterministic failure callback.
   - Worker route: `/compute/execute`
   - Failure reason: `user-supplied scripts are disabled; set MORPHEUS_ENABLE_UNTRUSTED_SCRIPTS=true to opt in`
   - Fulfillment tx: `0x7ad9a0c999ca52572e650b62fadb60f07f368590346412680e5481605db14e4c`
   - Callback status: `success = false`

3. The running testnet worker does not currently persist the oracle transport private key.
   - Runtime config has `PHALA_USE_DERIVED_KEYS=false`
   - Runtime config points `PHALA_ORACLE_KEYSTORE_PATH=/data/morpheus/oracle-key.json`
   - The mounted `/data` volume exists, but the keystore file is absent.
   - This means the current testnet worker is operating with an in-memory X25519 transport key and will rotate on restart.

4. Testnet system backups are incomplete.
   - `morpheus_system_backups` currently contains no `testnet` rows.
   - The backup script now correctly honors explicit `PHALA_APP_ID` / `MORPHEUS_NETWORK` overrides.
   - The testnet backup still fails at the oracle keystore step because the keystore file is missing in the running worker.

## Code Fixes Landed

- Relayer config now exposes `startRequestIds` to make request-cursor scanning actually configurable.
- Neo N3 relayer decoding now handles `Struct` values returned by `getRequest()`.
- Neo N3 block-scanning mode now also reconciles pending requests by `request_id`, so a missed `OracleRequested` notification does not permanently drop a request.
- Oracle transport keys now prefer a sealed keystore whenever dstack is available, even if signer derived keys remain disabled.
- Backup tooling now preserves caller-provided environment overrides instead of overwriting them from `.env`.

## Local Deployment Config Alignment

- `deploy/phala/morpheus.testnet.env`
  - `MORPHEUS_ENABLE_UNTRUSTED_SCRIPTS=true`
- `deploy/phala/morpheus.mainnet.env`
  - `MORPHEUS_ENABLE_UNTRUSTED_SCRIPTS=true`

## Operational Caution

Do not restart or redeploy the current testnet CVM until the new worker image is deployed and a stable oracle transport key strategy is in place.

Reason:

- the current testnet worker has no persisted oracle keystore;
- restarting it will rotate the X25519 private key;
- encrypted user payloads will stop decrypting unless the new public key is published on-chain and clients re-encrypt against it.
