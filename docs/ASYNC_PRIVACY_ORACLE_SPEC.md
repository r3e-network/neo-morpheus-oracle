# Async Privacy Oracle Spec

## Canonical Request Path

1. Client reads the Oracle public key.
2. Client encrypts a secret locally.
3. Contract calls `Request(requestType, payload, callbackContract, callbackMethod)` on `MorpheusOracle`.
4. `OracleRequested` is emitted on-chain.
5. Morpheus dispatcher validates the event and forwards it to the Phala worker.
6. Phala executes fetch-only, private fetch, public compute, or private compute.
7. Dispatcher calls `FulfillRequest(requestId, success, result, error)`.
8. Callback executes in the consumer contract.

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
  "token_header": "Authorization",
  "script": "function process(data) { return data.age > 80; }",
  "script_base64": "ZnVuY3Rpb24gcHJvY2VzcyhkYXRhKSB7IHJldHVybiBkYXRhLmFnZSA+IDgwOyB9",
  "target_chain": "neo_x",
  "target_chain_id": "12227332"
}
```

## Rules

- `encrypted_token` and `encrypted_payload` are interchangeable aliases
- `script` and `script_base64` are interchangeable aliases
- `callback_contract` and `callback_method` are on-chain request arguments, not JSON payload fields
- `target_chain` may be `neo_n3` or `neo_x`

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


## Built-in Providers

Requests may optionally specify a built-in provider via `provider` and `provider_params`.

First built-in provider:

- `twelvedata` — direct market-data source with API key auth
- `coinbase-spot` — direct Coinbase spot price endpoint without aggregation

If `provider` is omitted, callers may still use their own `url` plus encrypted secret payloads.
