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

- `ghcr.io/r3e-network/neo-morpheus-oracle-phala-worker:sha-9ac1cbf`
- `ghcr.io/r3e-network/neo-morpheus-oracle-relayer:sha-9ac1cbf`
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

## Remaining Validation Gap

A fully positive live Web3Auth bind or recovery-ticket proof still requires a real Web3Auth-authenticated user session and a valid `id_token` issued for this project.

That positive path was not completed in this terminal-only validation run because no live user login ceremony was available inside the current environment.

The production runtime is now ready for that test:

- JWKS verification is active
- audience enforcement is active
- stable provider-root derivation happens inside the TEE
- failure behavior for missing Web3Auth proof is correct

## Acceptance

Accepted for production runtime readiness of the Web3Auth-in-TEE NeoDID path, with one remaining pending live-user validation item:

- obtain a real Web3Auth `id_token`
- submit `neodid_bind` or `neodid_recovery_ticket`
- record the resulting positive live response / callback evidence
