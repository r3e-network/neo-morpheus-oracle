# Async Privacy Oracle Spec

## Canonical Network Registry

The canonical deployment registry lives in:

- `config/networks/mainnet.json`
- `config/networks/testnet.json`

Current Neo N3 anchors:

| Item                          | Mainnet                                                                         | Testnet                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Oracle runtime API            | `https://oracle.meshmini.app/mainnet`                                           | `https://oracle.meshmini.app/testnet`                                           |
| Oracle attestation explorer   | `https://cloud.phala.com/explorer/app_ddff154546fe22d15b65667156dd4b7c611e6093` | `https://cloud.phala.com/explorer/app_ddff154546fe22d15b65667156dd4b7c611e6093` |
| Datafeed attestation explorer | `https://cloud.phala.com/explorer/app_28294e89d490924b79c85cdee057ce55723b3d56` | `https://cloud.phala.com/explorer/app_28294e89d490924b79c85cdee057ce55723b3d56` |
| `MorpheusOracle`              | `0x017520f068fd602082fe5572596185e62a4ad991` via `oracle.morpheus.neo`          | `0x4b882e94ed766807c4fd728768f972e13008ad52`                                    |
| `OracleCallbackConsumer`      | `0xe1226268f2fe08bea67fb29e1c8fda0d7c8e9844`                                    | `0x8c506f224d82e67200f20d9d5361f767f0756e3b`                                    |
| `MorpheusDataFeed`            | `0x03013f49c42a14546c8bbe58f9d434c3517fccab` via `pricefeed.morpheus.neo`       | `0x9bea75cf702f6afc09125aa6d22f082bfd2ee064`                                    |
| `AbstractAccount`             | `0x9742b4ed62a84a886f404d36149da6147528ee33` via `smartwallet.neo`              | `0xe24d2980d17d2580ff4ee8dc5dddaa20e3caec38`                                    |
| `AA Web3AuthVerifier`         | `0xb4107cb2cb4bace0ebe15bc4842890734abe133a`                                    | `0xf2560a0db44bbb32d0a6919cf90a3d0643ad8e3d`                                    |
| `AA RecoveryVerifier`         | `0x51ef9639deb29284cc8577a7fa3fdfbc92ada7c3`                                    | deployment-specific                                                             |
| `NeoDIDRegistry`              | `0xb81f31ea81e279793b30411b82c2e82078b63105` via `neodid.morpheus.neo`          | unpublished in the shared registry                                              |

Interpretation rules:

- testnet example/demo contracts may differ from the canonical callback consumer; always trust `config/networks/*.json` instead of older examples
- blank / unpublished registry fields mean there is no shared stable publication yet, not that a temporary internal deployment never existed
- `UnifiedSmartWalletV3` is the canonical AA product/runtime label even if a raw deployed manifest string carries a historical or deployment-specific suffix
- `smartwallet.neo` is the canonical AA mainnet domain, while `aa.morpheus.neo` is an additional alias to the same clean AA address
- AA verifier plugin addresses are deployment-specific and should not be inferred from the core AA contract hash

Architecture note:

- Cloudflare control-plane ingress, queues, and workflows stay outside the TEE.
- Supabase remains the durable source of truth for accepted jobs and recovery.
- The Oracle CVM handles request/response execution for both mainnet and testnet.
- The DataFeed CVM remains isolated for continuous feed publication.
- network selection is path-based and payload-based, not CVM-based

## Canonical Request Path

1. Client reads the Oracle public key.
2. Client encrypts a secret locally.
3. Contract calls `Request(requestType, payload, callbackContract, callbackMethod)` on `MorpheusOracle`.
4. `OracleRequested` is emitted on-chain.
5. The relayer validates and persists the event, then forwards it to the Oracle runtime.
6. The Oracle runtime executes fetch-only, private fetch, public compute, or private compute.
7. The relayer calls `FulfillRequest(requestId, success, result, error)`.
8. Callback executes in the consumer contract.

NeoDID identity flows now also fit this same path when the request type is one of:

- `neodid_bind`
- `neodid_action_ticket`
- `neodid_recovery_ticket`

## Oracle Payload

```json
{
  "url": "https://api.example.com/private",
  "method": "GET",
  "headers": {},
  "body": "",
  "json_path": "data.value",
  "encrypted_token": "<base64 ciphertext>",
  "encrypted_payload": "<base64 ciphertext>",
  "encrypted_params": "<base64 ciphertext>",
  "encrypted_payload_ref": "<uuid secret ref>",
  "encrypted_params_ref": "<uuid secret ref>",
  "token_header": "Authorization",
  "script": "function process(data) { return data.age > 80; }",
  "script_base64": "ZnVuY3Rpb24gcHJvY2VzcyhkYXRhKSB7IHJldHVybiBkYXRhLmFnZSA+IDgwOyB9",
  "script_ref": {
    "contract_hash": "0x1111111111111111111111111111111111111111",
    "method": "getScript",
    "script_name": "age_gate"
  },
  "target_chain": "neo_n3"
}
```

For `neodid_recovery_ticket`, a typical on-chain payload is:

```json
{
  "provider": "github",
  "network": "neo_n3",
  "aa_contract": "0x9742b4ed62a84a886f404d36149da6147528ee33",
  "verifier_contract": "0x51ef9639deb29284cc8577a7fa3fdfbc92ada7c3",
  "account_id": "aa-social-recovery-demo",
  "new_owner": "0x89b05cac00804648c666b47ecb1c57bc185821b7",
  "recovery_nonce": "7",
  "expires_at": "1735689600",
  "encrypted_params": "<encrypt({\"provider_uid\":\"github_uid_777\",\"oauth_code\":\"...\"})>"
}
```

For large Web3Auth JWT payloads, use the short-reference form instead of embedding the full ciphertext directly in the Oracle payload:

```json
{
  "vault_account": "0x6d0656f6dd91469db1c90cc1e574380613f43738",
  "provider": "web3auth",
  "claim_type": "Web3Auth_PrimaryIdentity",
  "claim_value": "linked_social_root_oracle_ref",
  "encrypted_params_ref": "<secret_ref>"
}
```

## Rules

- `encrypted_token` is the canonical encrypted auth-secret field for private fetches
- if `encrypted_payload` decrypts to a JSON object, the worker treats it as a confidential payload patch and merges it before execution
- `encrypted_params` / `encrypted_input` are dedicated aliases for encrypted JSON patches that can carry secret headers, provider params, compute input, function names, or scripts
- `encrypted_payload_ref` / `encrypted_params_ref` are short references to ciphertext previously stored in `morpheus_encrypted_secrets`
- when a ref field is present, the worker loads the ciphertext from Supabase first, then decrypts the same X25519 envelope inside the TEE
- `script` and `script_base64` are interchangeable aliases
- `script_ref` lets the worker fetch the script body from a Neo N3 contract getter so the on-chain request only carries a small reference
- `callback_contract` and `callback_method` are on-chain request arguments, not JSON payload fields
- `target_chain` is currently `neo_n3` in the active supported path
- Neo X request fields remain in older examples and in-repo reference code, but they are not the active production route
- confidential payload transport uses `X25519-HKDF-SHA256-AES-256-GCM`
- `neodid_recovery_ticket` binds the signed ticket to `aa_contract`, `account_id`, `new_owner`, `recovery_nonce`, and `expires_at`

## Built-in Compute API

Use `POST /compute/execute` with one of:

```json
{
  "mode": "builtin",
  "function": "zkp.public_signal_hash",
  "input": { "signals": ["1", "2", "3"] },
  "target_chain": "neo_n3"
}
```

or

```json
{
  "mode": "script",
  "script": "function run(input) { return input.a + input.b; }",
  "entry_point": "run",
  "input": { "a": 2, "b": 3 },
  "target_chain": "neo_n3"
}
```

Confidential compute can be submitted by encrypting the full compute payload patch with the Oracle public key:

```json
{
  "encrypted_payload": "<encrypt({\"mode\":\"builtin\",\"function\":\"math.modexp\",\"input\":{\"base\":\"2\",\"exponent\":\"10\",\"modulus\":\"17\"},\"target_chain\":\"neo_n3\"})>"
}
```

## Built-in Providers

Requests may optionally specify a built-in provider via `provider` and `provider_params`.

Built-ins:

- `twelvedata` — direct market-data source with API key auth
- `binance-spot` — direct Binance spot ticker endpoint without aggregation
- `coinbase-spot` — direct Coinbase spot price endpoint without aggregation

If `provider` is omitted, callers may still use their own `url` plus encrypted secret payloads.

## Worker Verification Envelope

The worker response may include a stable `verification` object:

```json
{
  "verification": {
    "output_hash": "<sha256 of canonical result payload>",
    "attestation_hash": "<currently mirrors output_hash>",
    "signature": "<neo n3 signature or null>",
    "public_key": "<neo n3 public key or null>",
    "signer_address": "<optional neo n3 address>",
    "signer_script_hash": "<optional neo n3 script hash>",
    "tee_attestation": {
      "app_id": "...",
      "instance_id": "...",
      "compose_hash": "...",
      "quote": "0x...",
      "event_log": "...",
      "report_data": "0x..."
    }
  }
}
```

## On-Chain Fulfillment Payload

The relayer normalizes successful worker output into a chain-ready result envelope before calling `fulfillRequest`:

```json
{
  "version": "morpheus-result/v1",
  "request_type": "privacy_oracle",
  "fulfilled_at": "2026-03-09T00:00:00.000Z",
  "worker_status": 200,
  "success": true,
  "route": "/oracle/smart-fetch",
  "result": {
    "mode": "fetch+compute",
    "target_chain": "neo_n3",
    "result": true,
    "extracted_value": null
  },
  "verification": {
    "output_hash": "...",
    "attestation_hash": "...",
    "signature": "...",
    "public_key": "...",
    "signer_address": "...",
    "signer_script_hash": "...",
    "tee_attestation": {
      "app_id": "...",
      "instance_id": "...",
      "compose_hash": "...",
      "quote": "0x...",
      "event_log": "...",
      "report_data": "0x..."
    }
  }
}
```

This normalized JSON is UTF-8 encoded and passed as the `result` bytes of `FulfillRequest(...)`.

## Callback Consumer Interpretation

Consumers should interpret the callback payload as:

- a UTF-8 JSON object
- versioned by `version`
- with business payload under `result`
- with attestation/signature material under `verification`

## Verification

Use:

- `/api/attestation/demo` for a prefilled example
- `/api/attestation/verify` for server-side verification
- `/verifier` for the browser verifier UI

## Runtime Limits

The active worker runtime now enforces:

- request body limit at the HTTP ingress
- script source size limit
- registered-script fetch size limit
- oracle programmable input size limit
- compute input size limit
- script / wasm result size limits
- upstream Oracle / provider response size limits
