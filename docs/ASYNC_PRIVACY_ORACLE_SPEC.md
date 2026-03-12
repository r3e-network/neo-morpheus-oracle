# Async Privacy Oracle Spec

## Canonical Request Path

1. Client reads the Oracle public key.
2. Client encrypts a secret locally.
3. Contract calls `Request(requestType, payload, callbackContract, callbackMethod)` on `MorpheusOracle` or `MorpheusOracleX`.
4. `OracleRequested` is emitted on-chain.
5. Morpheus dispatcher validates the event and forwards it to the Phala worker.
6. Phala executes fetch-only, private fetch, public compute, or private compute.
7. Dispatcher calls `FulfillRequest(requestId, success, result, error)`.
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
  "token_header": "Authorization",
  "script": "function process(data) { return data.age > 80; }",
  "script_base64": "ZnVuY3Rpb24gcHJvY2VzcyhkYXRhKSB7IHJldHVybiBkYXRhLmFnZSA+IDgwOyB9",
  "target_chain": "neo_x",
  "target_chain_id": "12227332"
}
```

For `neodid_recovery_ticket`, a typical on-chain payload is:

```json
{
  "provider": "github",
  "network": "neo_n3",
  "aa_contract": "0x711c1899a3b7fa0e055ae0d17c9acfcd1bef6423",
  "verifier_contract": "0x1111111111111111111111111111111111111111",
  "account_id": "aa-social-recovery-demo",
  "new_owner": "0x89b05cac00804648c666b47ecb1c57bc185821b7",
  "recovery_nonce": "7",
  "expires_at": "1735689600",
  "encrypted_params": "<encrypt({\"provider_uid\":\"github_uid_777\",\"oauth_code\":\"...\"})>"
}
```

## Rules

- `encrypted_token` is the canonical encrypted auth-secret field for private fetches
- if `encrypted_payload` decrypts to a JSON object, the worker treats it as a confidential payload patch and merges it before execution
- `encrypted_params` / `encrypted_input` are dedicated aliases for encrypted JSON patches that can carry secret headers, provider params, compute input, function names, or scripts
- `script` and `script_base64` are interchangeable aliases
- `callback_contract` and `callback_method` are on-chain request arguments, not JSON payload fields
- `target_chain` may be `neo_n3` or `neo_x`
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
  "target_chain": "neo_x"
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
