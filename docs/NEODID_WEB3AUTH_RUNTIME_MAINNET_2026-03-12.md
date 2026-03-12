# NeoDID Web3Auth Runtime Mainnet Validation

Date: `2026-03-12`

## Scope

This report captures the production rollout and live validation of the NeoDID Web3Auth-in-TEE path on the existing Phala mainnet app:

- App id: `966f16610bdfe1794a503e16c5ae0bc69a1d92f1`
- Public endpoint: `https://966f16610bdfe1794a503e16c5ae0bc69a1d92f1-80.dstack-pha-prod9.phala.network`
- Oracle contract: `0x017520f068fd602082fe5572596185e62a4ad991`

The rollout used these repository commits:

- `35e4805` `feat: verify web3auth tokens inside neodid tee`
- `9ac1cbf` `fix: load web3auth config from phala runtime env`

## Backup Before Update

Before updating the running CVM, a full backup was created with `npm run backup:system`.

- Backup dir:
  - `/Users/jinghuiliao/git/neo-morpheus-oracle/private-backups/966f16610bdfe1794a503e16c5ae0bc69a1d92f1/2026-03-12T11-28-59-902Z`
- Supabase backup rows inserted: `4`
- Backup kinds:
  - `local_env`
  - `phala_env`
  - `cvm_runtime_config`
  - `oracle_keystore`

This preserved both the local runtime config snapshots and the sealed Oracle keystore before the Web3Auth runtime update.

## Final Running Images

Validated from `phala ps` after the final successful update:

- `ghcr.io/r3e-network/neo-morpheus-oracle-phala-worker:sha-521a794`
- `ghcr.io/r3e-network/neo-morpheus-oracle-relayer:sha-521a794`
- `caddy:2-alpine`

Final container state:

- worker: `running`, `healthy`
- relayer: `running`
- caddy: `running`

## Runtime Validation

Live `GET /neodid/runtime` result on mainnet:

```json
{
  "status": 200,
  "app_id": "966f16610bdfe1794a503e16c5ae0bc69a1d92f1",
  "compose_hash": "9b0b3446bda62c4a4770b62d6025761787cf8207ece784cfe0dad83f38ec2984",
  "verification_public_key": "030f53dc945897a361b2044aed742cc0bdd42f87f0df5783c4c1344875ee52bcf7",
  "web3auth": {
    "jwks_url": "https://api-auth.web3auth.io/.well-known/jwks.json",
    "audience_configured": true,
    "derives_provider_uid_in_tee": true
  }
}
```

This proves the running worker now:

- exposes the Web3Auth runtime metadata publicly
- has `WEB3AUTH_CLIENT_ID` loaded successfully
- has `WEB3AUTH_JWKS_URL` loaded successfully
- derives the stable Web3Auth provider root inside the TEE

## Live API Validation

### 1. Non-Web3Auth bind path still works

Live `POST /neodid/bind` with a normal provider:

```json
{
  "status": 200,
  "mode": "neodid_bind",
  "provider": "twitter",
  "claim_type": "Twitter_Verified",
  "master_nullifier": "0xc4637c48dc16fb09080c362b3742061ed06438cfdbbe242c27c59fb308bf8e4d",
  "attestation_hash": "ee4d3df0319167ae2e37573f2c940e1241adb29d25ef365ad262fc507b407e68",
  "output_hash": "ee4d3df0319167ae2e37573f2c940e1241adb29d25ef365ad262fc507b407e68",
  "verification_public_key": "030f53dc945897a361b2044aed742cc0bdd42f87f0df5783c4c1344875ee52bcf7"
}
```

This confirms that the Web3Auth rollout did not break the standard NeoDID bind path for existing providers.

### 2. Web3Auth bind now enforces JWT input

Live `POST /neodid/bind` with `provider = "web3auth"` and no `id_token`:

```json
{
  "status": 400,
  "error": "web3auth id_token is required"
}
```

This confirms the production worker now rejects unauthenticated Web3Auth requests instead of silently accepting an unverified `provider_uid`.

## What Was Fixed

Two separate production issues were resolved in this rollout:

1. The worker gained in-TEE Web3Auth JWT verification logic.
2. The worker was updated to read `WEB3AUTH_CLIENT_ID` and `WEB3AUTH_JWKS_URL` from `MORPHEUS_RUNTIME_CONFIG_JSON` via the shared runtime config helper, not only from direct process env vars.

Without fix 2, the Phala deployment could build and start successfully but still expose `audience_configured = false` at runtime.

## Positive Live Web3Auth Validation

After the runtime rollout, a real Web3Auth browser login was completed and the resulting JWT was consumed in production.

Live positive direct bind using the real Web3Auth `id_token`:

```json
{
  "status": 200,
  "mode": "neodid_bind",
  "provider": "web3auth",
  "claim_type": "Web3Auth_PrimaryIdentity",
  "claim_value": "linked_social_root",
  "master_nullifier": "0x506b5fb977e2c3609fa66b19cc5296de6f190e2e645ddf1d6047b7059654b976",
  "attestation_hash": "91c4e0fc8df4d1fe32711a9e9468cc6fe41f1abc58787a064e336f4c46421ce5"
}
```

Live positive encrypted bind using the same real JWT sealed into `encrypted_params`:

```json
{
  "status": 200,
  "mode": "neodid_bind",
  "provider": "web3auth",
  "claim_value": "linked_social_root_encrypted",
  "master_nullifier": "0x506b5fb977e2c3609fa66b19cc5296de6f190e2e645ddf1d6047b7059654b976",
  "attestation_hash": "429f2f5b285b8380e5876dd10fe3b57d9d8e8e0ba2cdb7b0590a4551a90a05df"
}
```

Live positive encrypted action-ticket using the same real JWT sealed into `encrypted_params`:

```json
{
  "status": 200,
  "mode": "neodid_action_ticket",
  "action_id": "mainnet_web3auth_action_probe_2026_03_12",
  "action_nullifier": "0x629b4a72d45fbe08781449f7274250197142e7ce436c0baf1042352d4ea7b519",
  "attestation_hash": "f9f68926c0fa76e3f7370c5b297c4bf6f001fc3d6c12d5b9cdf10fedbd96ff9f"
}
```

## Oracle Callback Validation For Large JWT Payloads

A direct on-chain `neodid_bind` request carrying the full Web3Auth JWT in payload bytes failed on Neo N3 because the Oracle request event payload exceeded the chain notification size limit.

Observed failure mode:

- VM fault while estimating system fee
- root cause: `System.Runtime.Notify failed: notification size shouldn't exceed 1024`

To preserve the production requirement that NeoDID requests still enter through the Oracle contract, the system was extended with short encrypted payload references:

- client stores the ciphertext in `morpheus_encrypted_secrets`
- on-chain request carries only `encrypted_params_ref`
- worker resolves the ciphertext by reference, then decrypts and verifies the JWT inside TEE

Validated production callback flow with encrypted reference:

```json
{
  "txid": "0x1e236d1e9b658d7d7a9ed49276198bd5b34619d9fe29449cb03b96b326f5b49b",
  "request_id": "126",
  "request_type": "neodid_bind",
  "success": true,
  "claim_value": "linked_social_root_oracle_ref",
  "master_nullifier": "0x506b5fb977e2c3609fa66b19cc5296de6f190e2e645ddf1d6047b7059654b976",
  "attestation_hash": "af0de41125c2398eead0836e904b9be7cdd24326fcfa7ebfd14445ae9ce97d99"
}
```

This proves the end-to-end production path now works for Web3Auth-backed NeoDID even when the JWT is too large to be embedded directly in the on-chain Oracle request payload.

## Acceptance

Accepted for production runtime readiness and positive mainnet validation of the Web3Auth-in-TEE NeoDID path.

Validated:

- live user Web3Auth login
- direct positive `neodid_bind`
- encrypted positive `neodid_bind`
- encrypted positive `neodid_action_ticket`
- on-chain Oracle callback flow using `encrypted_params_ref`
