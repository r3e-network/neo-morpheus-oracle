# User Guide

This guide explains how to use the three main Morpheus capabilities:

- **Privacy Compute**
- **Privacy Oracle**
- **PriceFeed / DataFeed**

It also explains how to inspect supported built-in providers and feed pairs.

Important production rule:

- End users should use Oracle and Compute through the on-chain Morpheus Oracle contracts plus callback fulfillment.
- The direct HTTP routes in this guide are for local development, operator workflows, and payload debugging.
- `datafeed` sync is operator-only. User contracts read synchronized on-chain feed records directly.
- Each request currently costs `0.01 GAS`-equivalent.
- Neo N3 supports prepaid fee credits, including contract-sponsored payment.
- Neo X requires the exact fee in `msg.value`.

## 1. Concepts

### Privacy Compute
Use Morpheus as an off-chain trusted coprocessor for expensive logic that is not practical on-chain.

Typical cases:

- ZKP preprocessing or witness hashing
- FHE planning and parameter estimation
- matrix / vector operations
- custom script execution in the TEE

### Privacy Oracle
Use Morpheus when you need to fetch external data and optionally process it inside the TEE before returning a derived result.

Typical cases:

- fetch a private API using an encrypted secret
- run a script on sensitive API output
- return only a boolean / score / filtered result on-chain

### PriceFeed / DataFeed
Use Morpheus datafeeds as operator-synchronized on-chain price storage that user contracts read directly.

Important properties:

- all feed pairs are normalized to `*-USD`
- Morpheus does **not** aggregate or medianize providers
- each provider is stored independently on-chain as `PROVIDER:PAIR`
- prices are stored as integer cents with exactly two decimals of precision
- example storage pairs:
  - `TWELVEDATA:NEO-USD`
  - `BINANCE-SPOT:NEO-USD`

## 2. Privacy Compute Usage

These direct `/compute/*` HTTP examples are for development and operator testing. In production, the same payloads
should be carried through the on-chain request + callback path.

### Built-in functions

List built-ins:

```bash
curl http://localhost:3000/api/compute/functions
```

Or call the worker directly:

```bash
curl "$PHALA_API_URL/compute/functions" \
  -H "Authorization: Bearer $PHALA_API_TOKEN"
```

Built-in examples:

```json
{
  "mode": "builtin",
  "function": "zkp.public_signal_hash",
  "input": {
    "signals": ["1", "2", "3"]
  },
  "target_chain": "neo_n3"
}
```

```json
{
  "mode": "builtin",
  "function": "fhe.noise_budget_estimate",
  "input": {
    "multiplicative_depth": 3,
    "scale_bits": 40,
    "modulus_bits": 218
  },
  "target_chain": "neo_x"
}
```

Call through web API:

```bash
curl http://localhost:3000/api/compute/execute \
  -H 'content-type: application/json' \
  -d '{
    "mode":"builtin",
    "function":"zkp.public_signal_hash",
    "input":{"signals":["1","2","3"]},
    "target_chain":"neo_n3"
  }'
```

### Custom script compute

Example:

```json
{
  "mode": "script",
  "script": "function run(input) { return input.a + input.b; }",
  "entry_point": "run",
  "input": { "a": 2, "b": 3 },
  "target_chain": "neo_n3"
}
```

Important notes:

- script execution is time-limited
- invalid entry points are rejected
- use built-ins whenever possible for stable semantics

### Confidential compute payloads

If you want the function name, script, or inputs to stay encrypted until they reach the TEE, fetch the Oracle public key first and encrypt a JSON payload patch.

Example confidential builtin call:

```json
{
  "encrypted_payload": "<encrypt({\"mode\":\"builtin\",\"function\":\"math.modexp\",\"input\":{\"base\":\"2\",\"exponent\":\"10\",\"modulus\":\"17\"},\"target_chain\":\"neo_n3\"})>"
}
```

The worker decrypts that JSON object inside the TEE, merges it into the request, executes it, and returns the callback-ready result envelope.

## 3. Privacy Oracle Usage

These direct `/oracle/*` HTTP examples are also development/operator paths. End-user dApps should submit the payload
through the Oracle contract and wait for the callback result.

There are two main paths.

### A. Built-in provider mode

Use a built-in provider such as `twelvedata`. Optional providers like `binance-spot` and `coinbase-spot` remain available for project-specific Oracle fetch flows, but production PriceFeed sync defaults to `twelvedata`.

Example:

```json
{
  "provider": "twelvedata",
  "symbol": "NEO-USD",
  "json_path": "price",
  "target_chain": "neo_n3"
}
```

Request via web API:

```bash
curl http://localhost:3000/api/oracle/query \
  -H 'content-type: application/json' \
  -d '{
    "provider":"twelvedata",
    "symbol":"NEO-USD",
    "json_path":"price",
    "target_chain":"neo_n3"
  }'
```

### B. Custom URL mode

Use a custom URL with optional encrypted secrets and optional script.

Example:

```json
{
  "url": "https://api.example.com/private",
  "method": "GET",
  "headers": {},
  "encrypted_token": "<base64 ciphertext>",
  "encrypted_params": "<base64 ciphertext with secret headers/body/provider params/script>",
  "token_header": "Authorization",
  "script": "function process(data) { return data.score > 80; }",
  "target_chain": "neo_x"
}
```

Request via web API:

```bash
curl http://localhost:3000/api/oracle/smart-fetch \
  -H 'content-type: application/json' \
  -d '{
    "url":"https://api.example.com/private",
    "encrypted_token":"<base64 ciphertext>",
    "encrypted_params":"<base64 ciphertext with secret headers/body/provider params/script>",
    "token_header":"Authorization",
    "script":"function process(data) { return data.score > 80; }",
    "target_chain":"neo_x"
  }'
```

Important notes:

- `encrypted_token` is the cleanest choice when only an auth secret must stay private
- `encrypted_params`, `encrypted_input`, or a JSON-object `encrypted_payload` can carry confidential headers, provider params, compute input, function names, or scripts
- `encrypted_payload` remains supported as a backward-compatible alias for encrypted auth tokens too
- for small payloads, raw `RSA-OAEP-SHA256` ciphertext still works
- for larger confidential payloads, prefer the hybrid envelope `RSA-OAEP-AES-256-GCM`

### Oracle public key

To encrypt user secrets locally, fetch the Oracle public key first:

```bash
curl http://localhost:3000/api/oracle/public-key
```

or directly from worker:

```bash
curl "$PHALA_API_URL/oracle/public-key" \
  -H "Authorization: Bearer $PHALA_API_TOKEN"
```

Returned fields:

- `algorithm`
- `public_key`
- `public_key_pem`
- `key_source`
- `recommended_payload_encryption`
- `supported_payload_encryption`

## 4. PriceFeed / DataFeed Usage

### Query supported feed pairs

From web API:

```bash
curl http://localhost:3000/api/feeds/catalog
```

From worker directly:

```bash
curl "$PHALA_API_URL/feeds/catalog" \
  -H "Authorization: Bearer $PHALA_API_TOKEN"
```

Current default pair catalog includes:

- `NEO-USD`
- `GAS-USD`
- `FLM-USD` (`1000 FLM` unit)
- `BTC-USD`
- `ETH-USD`
- `SOL-USD`
- `TRX-USD`
- `PAXG-USD`
- `WTI-USD`
- `USDT-USD`
- `USDC-USD`
- `BNB-USD`
- `XRP-USD`
- `DOGE-USD`

You can extend this later via `MORPHEUS_FEED_PAIR_REGISTRY_JSON`.

### Query current off-chain quotes

Single provider:

```bash
curl "http://localhost:3000/api/feeds/NEO-USD?provider=twelvedata"
```

All available built-in providers for the pair:

```bash
curl "http://localhost:3000/api/feeds/NEO-USD"
```

This returns:

- `pair`
- `providers_requested`
- `quotes`
- `errors`

If multiple providers are requested, every successful quote is returned and every failed provider is listed in `errors`.
Production feed sync uses `twelvedata` by default unless you explicitly override `MORPHEUS_FEED_PROVIDERS`.

### Trigger an on-chain feed sync

This flow is operator-only. End users should not request `datafeed` through the Oracle contract. If they do, the
request is rejected and finalized with a failure callback.

Web cron route:

```bash
curl http://localhost:3000/api/cron/feed \
  -H "Authorization: Bearer $CRON_SECRET"
```

Direct worker route:

```bash
curl "$PHALA_API_URL/oracle/feed" \
  -H "Authorization: Bearer $PHALA_API_TOKEN" \
  -H 'content-type: application/json' \
  -d '{
    "symbol":"NEO-USD",
    "target_chain":"neo_n3",
    "providers":["twelvedata"],
    "sync_all_sources":true,
    "wait":true
  }'
```

Returned fields:

- `pair`
- `providers_requested`
- `sync_results`
- `errors`

Each successful sync result contains:

- `provider`
- `storage_pair`
- `relay_status`
- `anchored_tx`
- `quote`

### On-chain storage model

For N3 and Neo X, providers are stored separately.

Examples:

- `TWELVEDATA:NEO-USD`
- `BINANCE-SPOT:NEO-USD`

This means contracts can choose:

- one specific provider pair
- all stored pairs
- all feed records
- a price format that is always integer cents, for example `249` = `2.49`

### New on-chain DataFeed read methods

#### Neo N3

- `GetLatest(pair)`
- `GetPairCount()`
- `GetPairByIndex(index)`
- `GetAllPairs()`
- `GetAllFeedRecords()`

#### Neo X

- `getLatest(pair)`
- `getPairCount()`
- `getPairByIndex(index)`
- `getAllPairs()`
- `getAllFeedRecords()`

## 5. Mainnet Update Policy for Neo N3

For **Neo N3 mainnet**, automatic feed sync obeys two rules:

1. the same price pair is updated only if the price moved by more than **0.1%**
2. the same storage pair is updated at most **once every 15 seconds**

These rules apply per stored provider pair, for example:

- `TWELVEDATA:NEO-USD`
- `BINANCE-SPOT:NEO-USD`

So one provider can update while another provider is skipped.

## 6. Built-in Provider Support

Current built-in providers:

- `twelvedata`
- `binance-spot`
- `coinbase-spot`

To inspect provider metadata:

```bash
curl http://localhost:3000/api/providers
```

or:

```bash
curl "$PHALA_API_URL/providers" \
  -H "Authorization: Bearer $PHALA_API_TOKEN"
```

## 7. How to Add New Pairs Later

There are two levels.

### Simple level: add symbols only

Set:

- `MORPHEUS_FEED_SYMBOLS`

Example:

```env
MORPHEUS_FEED_SYMBOLS=NEO-USD,GAS-USD,FLM-USD,BTC-USD,ETH-USD,SOL-USD
```

### Advanced level: add provider-specific mapping

Set:

- `MORPHEUS_FEED_PAIR_REGISTRY_JSON`

Example:

```json
{
  "DOGE-USD": {
    "providers": {
      "twelvedata": { "symbol": "DOGE/USD" },
      "binance-spot": { "symbol": "DOGEUSDT" }
    }
  }
}
```

This is the correct place to add pairs whose provider symbols differ from the normalized `PAIR-USD` format.

## 8. Practical Recommendations

- use `privacy oracle` when you need fetch + optional secret + optional compute
- use `privacy compute` when you do not need an external fetch
- use `pricefeed` for standardized public market data storage
- for contracts, prefer provider-scoped storage pairs like `TWELVEDATA:NEO-USD`
- if you need all currently stored feed pairs, use `GetAllPairs()` / `getAllPairs()`
