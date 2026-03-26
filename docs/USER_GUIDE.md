# User Guide

This guide explains how to use the four main Morpheus capabilities:

- **Privacy Compute**
- **Privacy Oracle**
- **Datafeeds**
- **NeoDID**

It also explains how to inspect supported built-in providers and feed pairs, and how to use the public NeoDID DID resolver.

Current architecture note:

- Cloudflare owns public ingress, control-plane routing, queue/workflow orchestration, and recovery.
- Supabase owns durable request, job, automation, and feed state.
- The Oracle CVM handles request/response oracle, compute, and NeoDID execution for both mainnet and testnet.
- The DataFeed CVM is isolated so continuous market-data publication is not blocked by interactive workloads.

Important production rule:

- End users should use Oracle and Compute through the on-chain Morpheus Oracle contracts plus callback fulfillment.
- End users should use NeoDID bind / action / recovery flows through the on-chain Morpheus Oracle contracts plus callback fulfillment.
- The direct HTTP routes in this guide are for local development, operator workflows, and payload debugging.
- `datafeed` sync is operator-only. User contracts read synchronized on-chain feed records directly.
- Each request currently costs `0.01 GAS`-equivalent.
- Neo N3 supports prepaid fee credits, including contract-sponsored payment.
- Neo N3 is the only active supported runtime path right now.
- Neo X examples remain in-repo as reference material and should not be treated as the current production integration path.

## Canonical Network Registry

Always treat these files as the source of truth before copying an address into a frontend, contract, or runbook:

- `config/networks/mainnet.json`
- `config/networks/testnet.json`

Current Neo N3 anchors:

| Item                          | Mainnet                                                                         | Testnet                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Oracle Runtime URL            | `https://oracle.meshmini.app/mainnet`                                           | `https://oracle.meshmini.app/testnet`                                           |
| Oracle Attestation Explorer   | `https://cloud.phala.com/explorer/app_ddff154546fe22d15b65667156dd4b7c611e6093` | `https://cloud.phala.com/explorer/app_ddff154546fe22d15b65667156dd4b7c611e6093` |
| DataFeed Attestation Explorer | `https://cloud.phala.com/explorer/app_28294e89d490924b79c85cdee057ce55723b3d56` | `https://cloud.phala.com/explorer/app_28294e89d490924b79c85cdee057ce55723b3d56` |
| MorpheusOracle                | `0x017520f068fd602082fe5572596185e62a4ad991`                                    | `0x4b882e94ed766807c4fd728768f972e13008ad52`                                    |
| OracleCallbackConsumer        | `0xe1226268f2fe08bea67fb29e1c8fda0d7c8e9844`                                    | `0x8c506f224d82e67200f20d9d5361f767f0756e3b`                                    |
| MorpheusDataFeed              | `0x03013f49c42a14546c8bbe58f9d434c3517fccab`                                    | `0x9bea75cf702f6afc09125aa6d22f082bfd2ee064`                                    |
| AbstractAccount               | `0x9742b4ed62a84a886f404d36149da6147528ee33`                                    | `0xe24d2980d17d2580ff4ee8dc5dddaa20e3caec38`                                    |
| AA Web3AuthVerifier           | `0xb4107cb2cb4bace0ebe15bc4842890734abe133a`                                    | `0xf2560a0db44bbb32d0a6919cf90a3d0643ad8e3d`                                    |
| AA RecoveryVerifier           | `0x51ef9639deb29284cc8577a7fa3fdfbc92ada7c3`                                    | deployment-specific                                                             |
| NeoDIDRegistry                | `0xb81f31ea81e279793b30411b82c2e82078b63105`                                    | unpublished                                                                     |
| Oracle NNS                    | `oracle.morpheus.neo`                                                           | unassigned                                                                      |
| DataFeed NNS                  | `pricefeed.morpheus.neo`                                                        | unassigned                                                                      |
| AA NNS                        | `smartwallet.neo`                                                               | unassigned                                                                      |
| AA alias NNS                  | `aa.morpheus.neo`                                                               | unassigned                                                                      |
| NeoDID NNS                    | `neodid.morpheus.neo`                                                           | unassigned                                                                      |

Operational notes:

- the canonical testnet callback contract for shared infra is `0x8c506f224d82e67200f20d9d5361f767f0756e3b`
- the current testnet example consumer used by live validation probes resolves to the same shared deployment
- testnet NeoDID registry remains unpublished in the shared registry until a stable shared deployment is intentionally promoted
- `UnifiedSmartWalletV3` is the stable AA runtime name; raw deployment manifest suffixes are internal deployment metadata rather than user-facing contract names
- mainnet AA ecosystem contracts are also published under `smartwallet.neo` subdomains such as `core.smartwallet.neo`, `web3auth.smartwallet.neo`, and `recovery.smartwallet.neo`
- `aa.morpheus.neo` now resolves to the same canonical mainnet AA address as `smartwallet.neo`; treat it as an additional alias, not the primary public name

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

### Datafeeds

Use Morpheus datafeeds as operator-synchronized on-chain price storage that user contracts read directly.

Important properties:

- feed publication runs on the isolated DataFeed CVM
- all feed pairs are normalized to `*-USD`
- Morpheus does **not** aggregate or medianize providers
- each provider is stored independently on-chain as `PROVIDER:PAIR`
- prices are stored as scaled USD integers with global precision `1 USD = 1,000,000`
- threshold checks are evaluated against the quantized on-chain integer price, not unbounded source decimals
- example storage pairs:
  - `TWELVEDATA:NEO-USD`
  - `BINANCE-SPOT:NEO-USD`

### NeoDID

Use NeoDID when you need privacy-preserving identity binding, unlinkable action authorization, or AA social recovery.

Important properties:

- production identity issuance still enters through the Oracle request + callback path
- the public DID resolver exposes service topology and verifier material, not private claims
- `provider_uid`, JWT claims, master nullifiers, and action nullifiers remain private
- Web3Auth JWT verification happens inside the TEE for `provider = "web3auth"`
- current public service DID is `did:morpheus:neo_n3:service:neodid`

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
curl "$MORPHEUS_RUNTIME_URL/compute/functions" \
  -H "Authorization: Bearer $MORPHEUS_RUNTIME_TOKEN"
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
  "target_chain": "neo_n3"
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
- `script_ref` can fetch the script body from a Neo N3 contract getter when notification size is too small for inline source
- use built-ins whenever possible for stable semantics

Example registry-backed compute script:

```json
{
  "mode": "script",
  "script_ref": {
    "contract_hash": "0x1111111111111111111111111111111111111111",
    "method": "getScript",
    "script_name": "sum"
  },
  "entry_point": "process",
  "input": { "a": 2, "b": 3 },
  "target_chain": "neo_n3"
}
```

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
  "symbol": "TWELVEDATA:NEO-USD",
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
    "symbol":"TWELVEDATA:NEO-USD",
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
  "target_chain": "neo_n3"
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
    "target_chain":"neo_n3"
  }'
```

Important notes:

- `encrypted_token` is the cleanest choice when only an auth secret must stay private
- `encrypted_params`, `encrypted_input`, or a JSON-object `encrypted_payload` can carry confidential headers, provider params, compute input, function names, or scripts
- if the encrypted blob is too large for the chain request payload, first store it through `POST /api/confidential/store` and then carry only `encrypted_params_ref` / `encrypted_payload_ref` on-chain
- if the script body itself is too large for the request payload, move it into a Neo N3 contract getter and use `script_ref`
- Morpheus confidential payloads are sealed with `X25519-HKDF-SHA256-AES-256-GCM`
- the encrypted envelope includes an ephemeral X25519 public key plus AES-GCM ciphertext/tag fields

### Oracle public key

To encrypt user secrets locally, fetch the Oracle public key first:

```bash
curl http://localhost:3000/api/oracle/public-key
```

or directly from worker:

```bash
curl "$MORPHEUS_RUNTIME_URL/oracle/public-key" \
  -H "Authorization: Bearer $MORPHEUS_RUNTIME_TOKEN"
```

Returned fields:

- `algorithm`
- `public_key`
- `public_key_format`
- `key_source`
- `recommended_payload_encryption`
- `supported_payload_encryption`

### Confidential store for large encrypted payloads

Use this route when a JWT or encrypted JSON patch is too large to fit directly into the Oracle request payload:

```bash
curl http://localhost:3000/api/confidential/store \
  -H 'content-type: application/json' \
  -d '{
    "ciphertext":"<sealed ciphertext>",
    "target_chain":"neo_n3"
  }'
```

Response:

```json
{
  "secret_ref": "<uuid>",
  "target_chain": "neo_n3",
  "encryption_algorithm": "client-supplied-ciphertext"
}
```

Then place only the short reference on-chain:

```json
{
  "encrypted_params_ref": "<uuid>"
}
```

## 4. Datafeeds Usage

### Query supported feed pairs

From web API:

```bash
curl http://localhost:3000/api/feeds/catalog
```

From worker directly:

```bash
curl "$MORPHEUS_RUNTIME_URL/feeds/catalog" \
  -H "Authorization: Bearer $MORPHEUS_RUNTIME_TOKEN"
```

Current default pair catalog includes:

- Core crypto:
  - `TWELVEDATA:NEO-USD`
  - `TWELVEDATA:GAS-USD`
  - `TWELVEDATA:FLM-USD`
  - `TWELVEDATA:BTC-USD`
  - `TWELVEDATA:ETH-USD`
  - `TWELVEDATA:SOL-USD`
  - `TWELVEDATA:TRX-USD`
  - `TWELVEDATA:BNB-USD`
  - `TWELVEDATA:XRP-USD`
  - `TWELVEDATA:DOGE-USD`
  - `TWELVEDATA:USDT-USD`
  - `TWELVEDATA:USDC-USD`
- Commodity / hard-asset:
  - `TWELVEDATA:PAXG-USD`
  - `TWELVEDATA:WTI-USD`
  - `TWELVEDATA:BRENT-USD`
  - `TWELVEDATA:NATGAS-USD`
  - `TWELVEDATA:COPPER-USD`
  - `TWELVEDATA:WHEAT-USD`
  - `TWELVEDATA:CORN-USD`
  - `TWELVEDATA:SOY-USD`
- Equities / ETFs:
  - `TWELVEDATA:AAPL-USD`
  - `TWELVEDATA:GOOGL-USD`
  - `TWELVEDATA:MSFT-USD`
  - `TWELVEDATA:AMZN-USD`
  - `TWELVEDATA:TSLA-USD`
  - `TWELVEDATA:META-USD`
  - `TWELVEDATA:NVDA-USD`
  - `TWELVEDATA:SPY-USD`
  - `TWELVEDATA:QQQ-USD`
  - `TWELVEDATA:GLD-USD`
- FX:
  - `TWELVEDATA:EUR-USD`
  - `TWELVEDATA:GBP-USD`
  - `TWELVEDATA:JPY-USD` (inverted from `USD/JPY`)
  - `TWELVEDATA:CNY-USD` (inverted from `USD/CNY`)

With the global `1 USD = 1,000,000` scale, low-priced assets such as `TWELVEDATA:FLM-USD`, `TWELVEDATA:DOGE-USD`, and `TWELVEDATA:JPY-USD` can be represented directly without basket pair names.

For the exact meaning of every canonical pair, including the real TwelveData source symbol and any inversion / scaling rule, read the canonical pair table in `docs/PROVIDERS.md`.

Canonical key note:

- use provider-scoped keys such as `TWELVEDATA:NEO-USD` and `TWELVEDATA:BTC-USD` in all new code
- the `TWELVEDATA:` prefix is part of the official on-chain key, not just a display alias

### Query current off-chain quotes

Single provider:

```bash
curl "http://localhost:3000/api/feeds/TWELVEDATA:NEO-USD?provider=twelvedata"
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
curl "$MORPHEUS_RUNTIME_URL/oracle/feed" \
  -H "Authorization: Bearer $MORPHEUS_RUNTIME_TOKEN" \
  -H 'content-type: application/json' \
  -d '{
    "symbol":"TWELVEDATA:NEO-USD",
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

For the active supported path, providers are stored and read on Neo N3.

Examples:

- `TWELVEDATA:NEO-USD`
- `BINANCE-SPOT:NEO-USD`

This means contracts can choose:

- one specific provider pair
- all stored pairs
- all feed records
- a price format that is always a 1e6-scaled USD integer, for example `2490000` = `2.490000`

### New on-chain DataFeed read methods

#### Neo N3

- `GetLatest(pair)`
- `GetPairCount()`
- `GetPairByIndex(index)`
- `GetAllPairs()`
- `GetAllFeedRecords()`

Neo X read methods are intentionally omitted here because Neo X is not part of the current production path.

## 5. NeoDID Usage

These direct `/neodid/*` HTTP examples are development/operator paths. In production, the same payloads should be
submitted on-chain through `MorpheusOracle.request(...)` with:

- `neodid_bind`
- `neodid_action_ticket`
- `neodid_recovery_ticket`

### Resolve the public DID document

Resolve the service DID:

```bash
curl "http://localhost:3000/api/neodid/resolve?did=did:morpheus:neo_n3:service:neodid"
```

Resolve a document-only subject DID:

```bash
curl "http://localhost:3000/api/neodid/resolve?did=did:morpheus:neo_n3:aa:aa-social-recovery-demo&format=document"
```

The public DID layer is for:

- service discovery
- verifier-key publication
- registry / Oracle / AA recovery endpoint hints

It is not for:

- provider UID disclosure
- JWT disclosure
- nullifier disclosure
- encrypted payload disclosure

### Inspect runtime and provider catalog

```bash
curl http://localhost:3000/api/neodid/runtime
curl http://localhost:3000/api/neodid/providers
```

The runtime response includes:

- `app_id`
- `compose_hash`
- `verification_public_key`
- `verifier_curve`
- `web3auth.jwks_url`
- `web3auth.audience_configured`

### Direct bind example

Standard provider:

```bash
curl http://localhost:3000/api/neodid/bind \
  -H 'content-type: application/json' \
  -d '{
    "vault_account":"0x6d0656f6dd91469db1c90cc1e574380613f43738",
    "provider":"github",
    "provider_uid":"github_uid_12345",
    "claim_type":"Github_VerifiedUser",
    "claim_value":"public_profile"
  }'
```

Web3Auth provider:

```bash
curl http://localhost:3000/api/neodid/bind \
  -H 'content-type: application/json' \
  -d '{
    "vault_account":"0x6d0656f6dd91469db1c90cc1e574380613f43738",
    "provider":"web3auth",
    "id_token":"<web3auth jwt>",
    "claim_type":"Web3Auth_PrimaryIdentity",
    "claim_value":"linked_social_root"
  }'
```

### Large JWT production pattern

For large Web3Auth JWT payloads:

1. fetch the Oracle public key
2. seal the JSON patch locally with `X25519-HKDF-SHA256-AES-256-GCM`
3. store the ciphertext through `POST /api/confidential/store`
4. submit only `encrypted_params_ref` on-chain inside the Oracle payload

### Action ticket example

```bash
curl http://localhost:3000/api/neodid/action-ticket \
  -H 'content-type: application/json' \
  -d '{
    "provider":"binance",
    "provider_uid":"binance_uid_12345",
    "disposable_account":"0x89b05cac00804648c666b47ecb1c57bc185821b7",
    "action_id":"Airdrop_Season_1"
  }'
```

### Recovery ticket example

```bash
curl http://localhost:3000/api/neodid/recovery-ticket \
  -H 'content-type: application/json' \
  -d '{
    "provider":"web3auth",
    "network":"neo_n3",
    "aa_contract":"0x9742b4ed62a84a886f404d36149da6147528ee33",
    "verifier_contract":"0x51ef9639deb29284cc8577a7fa3fdfbc92ada7c3",
    "account_id":"aa-social-recovery-demo",
    "new_owner":"0x89b05cac00804648c666b47ecb1c57bc185821b7",
    "recovery_nonce":"7",
    "expires_at":"1735689600",
    "encrypted_params":"<sealed payload>"
  }'
```

### Browser entrypoints

- live Web3Auth flow: `/launchpad/neodid-live`
- interactive DID resolver: `/launchpad/neodid-resolver`
- reference docs: `/docs/neodid`
- formal DID method spec: `docs/NEODID_DID_METHOD.md`

## 6. Mainnet Update Policy for Neo N3

For **Neo N3 mainnet**, automatic feed sync obeys two rules:

1. the same price pair is updated only if the fresh quote moved by more than **0.1%** versus the current on-chain stored value
2. the same storage pair is updated at most **once every 60 seconds**

Precision caveat:

- because the chain stores quantized integers, a raw source move that is still too small to change the stored on-chain integer value cannot trigger an update, even if that raw source move is already greater than `0.1%`
- with the current `1 USD = 1,000,000` scale, the standard catalog can use direct source-prefixed pairs such as `TWELVEDATA:FLM-USD` and `TWELVEDATA:JPY-USD` without basket naming

These rules apply per stored provider pair, for example:

- `TWELVEDATA:NEO-USD`
- `BINANCE-SPOT:NEO-USD`

So one provider can update while another provider is skipped.

## 7. Built-in Provider Support

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
curl "$MORPHEUS_RUNTIME_URL/providers" \
  -H "Authorization: Bearer $MORPHEUS_RUNTIME_TOKEN"
```

## 8. How to Add New Pairs Later

There are two levels.

### Simple level: add symbols only

Set:

- `MORPHEUS_FEED_SYMBOLS`

Example:

```env
MORPHEUS_FEED_SYMBOLS=TWELVEDATA:NEO-USD,TWELVEDATA:GAS-USD,TWELVEDATA:FLM-USD,TWELVEDATA:BTC-USD,TWELVEDATA:ETH-USD,TWELVEDATA:SOL-USD,TWELVEDATA:WTI-USD,TWELVEDATA:AAPL-USD,TWELVEDATA:EUR-USD,TWELVEDATA:JPY-USD
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

## 9. Practical Recommendations

- use `privacy oracle` when you need fetch + optional secret + optional compute
- use `privacy compute` when you do not need an external fetch
- use `pricefeed` for standardized public market data storage
- use `neodid` for privacy-preserving identity binding, action authorization, and AA recovery
- for contracts, prefer provider-scoped storage pairs like `TWELVEDATA:NEO-USD`
- if you need all currently stored feed pairs, use `GetAllPairs()` / `getAllPairs()`
- use the public DID resolver only for service discovery and verifier material, not for private identity claims
