# Providers

Morpheus Oracle supports two provider modes:

- **Built-in providers** — selected by `provider` and configured per project in Supabase
- **Custom source requests** — user-supplied `url`, optional encrypted token/payload, and optional compute script

## Built-in Providers

Current built-ins:

- `twelvedata`
- `binance-spot`
- `coinbase-spot`

Built-ins are intentionally **raw**:

- no aggregation
- no smoothing
- no medianization
- no extra normalization beyond provider-specific request formatting and response extraction

### TwelveData

Required env:

- `TWELVEDATA_API_KEY`

Typical config:

```json
{
  "symbol": "NEO-USD",
  "endpoint": "price",
  "interval": "1min"
}
```

### Binance Spot

Required env:

- none

Typical config:

```json
{
  "pair": "NEO-USD",
  "symbol": "NEOUSDT",
  "base_url": "https://api1.binance.com"
}
```

### Coinbase Spot

Required env:

- none

Typical config:

```json
{
  "symbol": "NEO-USD"
}
```

## Provider Config Control Plane

Project-level provider configs are stored in `morpheus_provider_configs`.

Management endpoint:

- `GET /api/provider-configs?project_slug=demo`
- `POST /api/provider-configs`
- `DELETE /api/provider-configs?project_slug=demo&provider_id=twelvedata`

Recommended production protection:

- set `MORPHEUS_PROVIDER_CONFIG_API_KEY` or a legacy fallback `ADMIN_CONSOLE_API_KEY`
- send it via `x-admin-api-key` or `Authorization: Bearer ...`

The dashboard includes a Provider Configs panel that can manage these records directly.

## Request-Time Resolution

Both the web API layer and the Phala worker can resolve provider defaults from Supabase when `project_slug` and `provider` are present.

The web API layer resolves provider defaults **before** proxying to Phala:

- `GET /api/feeds/:symbol?provider=twelvedata&project_slug=demo`
- `POST /api/oracle/query` with `{ "provider": "twelvedata", "project_slug": "demo" }`
- `POST /api/oracle/smart-fetch` with the same fields

Resolution rules:

- request-level `provider_params` override stored project config keys
- stored project config fills in missing provider defaults
- disabled project providers are rejected before the request reaches Phala

## Custom Source Requests

Users can bypass built-ins and send direct Oracle requests with:

- `url`
- optional `encrypted_token` or `encrypted_payload`
- optional `script` or `script_base64`

This supports three useful modes:

- **plain fetch** — URL only
- **fetch + compute** — URL plus script
- **private fetch + compute** — URL plus encrypted payload plus script

## PriceFeed Pair Catalog

Default built-in USD pairs now cover:

- Core crypto:
  - `NEO-USD`
  - `GAS-USD`
  - `1000FLM-USD` (`1000 FLM` unit)
  - `BTC-USD`
  - `ETH-USD`
  - `SOL-USD`
  - `TRX-USD`
  - `BNB-USD`
  - `XRP-USD`
  - `DOGE-USD`
  - `USDT-USD`
  - `USDC-USD`
- Commodity / hard-asset:
  - `PAXG-USD`
  - `WTI-USD`
  - `BRENT-USD`
  - `NATGAS-USD`
  - `COPPER-USD`
  - `WHEAT-USD`
  - `CORN-USD`
  - `SOY-USD`
- Equities / ETFs:
  - `AAPL-USD`
  - `GOOGL-USD`
  - `MSFT-USD`
  - `AMZN-USD`
  - `TSLA-USD`
  - `META-USD`
  - `NVDA-USD`
  - `SPY-USD`
  - `QQQ-USD`
  - `GLD-USD`
- FX:
  - `EUR-USD`
  - `GBP-USD`
  - `1000JPY-USD` (`1000 JPY` unit, inverted from `USD/JPY`)
  - `CNY-USD` (inverted from `USD/CNY`)

Production sync defaults to `twelvedata` only. Other built-in providers remain available for Oracle fetch flows and project-specific overrides.

Inspect at runtime with:

- `GET /api/feeds/catalog`
- or worker `GET /feeds/catalog`

On-chain storage is provider-scoped, for example:

- `TWELVEDATA:NEO-USD`
- `BINANCE-SPOT:NEO-USD`

### Canonical pair table

Use these names exactly in contracts, automation jobs, and documentation.
Scaled names such as `1000FLM-USD` and `1000JPY-USD` are canonical pair ids.

Deprecated legacy storage key:

- `TWELVEDATA:FLM-USD` is a historical on-chain key and should be treated as deprecated
- use `TWELVEDATA:1000FLM-USD` on-chain instead
- use `1000FLM-USD` everywhere in user-facing configs, contracts, and docs

| Pair | Category | Meaning | TwelveData symbol | On-chain unit | Note |
| --- | --- | --- | --- | --- | --- |
| `NEO-USD` | Crypto | price of 1 NEO in USD | `NEO/USD` | `1 NEO` |  |
| `GAS-USD` | Crypto | price of 1 GAS in USD | `GAS/USD` | `1 GAS` |  |
| `1000FLM-USD` | Crypto | price of 1000 FLM in USD | `FLM/USD` | `1000 FLM` | scaled because 1 FLM is too small for integer-cent storage |
| `BTC-USD` | Crypto | price of 1 BTC in USD | `BTC/USD` | `1 BTC` |  |
| `ETH-USD` | Crypto | price of 1 ETH in USD | `ETH/USD` | `1 ETH` |  |
| `SOL-USD` | Crypto | price of 1 SOL in USD | `SOL/USD` | `1 SOL` |  |
| `TRX-USD` | Crypto | price of 1 TRX in USD | `TRX/USD` | `1 TRX` |  |
| `PAXG-USD` | Crypto | price of 1 PAXG in USD | `PAXG/USD` | `1 PAXG` | gold-backed token |
| `USDT-USD` | Crypto | price of 1 USDT in USD | `USDT/USD` | `1 USDT` |  |
| `USDC-USD` | Crypto | price of 1 USDC in USD | `USDC/USD` | `1 USDC` |  |
| `BNB-USD` | Crypto | price of 1 BNB in USD | `BNB/USD` | `1 BNB` |  |
| `XRP-USD` | Crypto | price of 1 XRP in USD | `XRP/USD` | `1 XRP` |  |
| `DOGE-USD` | Crypto | price of 1 DOGE in USD | `DOGE/USD` | `1 DOGE` |  |
| `WTI-USD` | Commodity | WTI crude oil reference price in USD | `WTI/USD` | `WTI reference unit` |  |
| `BRENT-USD` | Commodity | Brent crude spot reference price in USD | `XBR/USD` | `Brent spot reference unit` |  |
| `NATGAS-USD` | Commodity | natural gas reference price in USD | `NG/USD` | `natural gas reference unit` |  |
| `COPPER-USD` | Commodity | copper futures proxy in USD | `HG1` | `1 copper futures reference unit` | front-month proxy |
| `WHEAT-USD` | Commodity | wheat futures proxy in USD | `W_1` | `1 wheat futures reference unit` | front-month proxy |
| `CORN-USD` | Commodity | corn futures proxy in USD | `C_1` | `1 corn futures reference unit` | front-month proxy |
| `SOY-USD` | Commodity | soybean futures proxy in USD | `S_1` | `1 soybean futures reference unit` | front-month proxy |
| `AAPL-USD` | Equity | price of 1 AAPL share in USD | `AAPL` | `1 share` |  |
| `GOOGL-USD` | Equity | price of 1 GOOGL share in USD | `GOOGL` | `1 share` |  |
| `MSFT-USD` | Equity | price of 1 MSFT share in USD | `MSFT` | `1 share` |  |
| `AMZN-USD` | Equity | price of 1 AMZN share in USD | `AMZN` | `1 share` |  |
| `TSLA-USD` | Equity | price of 1 TSLA share in USD | `TSLA` | `1 share` |  |
| `META-USD` | Equity | price of 1 META share in USD | `META` | `1 share` |  |
| `NVDA-USD` | Equity | price of 1 NVDA share in USD | `NVDA` | `1 share` |  |
| `SPY-USD` | ETF | price of 1 SPY share in USD | `SPY` | `1 ETF share` |  |
| `QQQ-USD` | ETF | price of 1 QQQ share in USD | `QQQ` | `1 ETF share` |  |
| `GLD-USD` | ETF | price of 1 GLD share in USD | `GLD` | `1 ETF share` |  |
| `EUR-USD` | FX | price of 1 EUR in USD | `EUR/USD` | `1 EUR` |  |
| `GBP-USD` | FX | price of 1 GBP in USD | `GBP/USD` | `1 GBP` |  |
| `1000JPY-USD` | FX | price of 1000 JPY in USD | `USD/JPY` | `1000 JPY` | fetched as `USD/JPY`, then inverted and scaled by 1000 |
| `CNY-USD` | FX | price of 1 CNY in USD | `USD/CNY` | `1 CNY` | fetched as `USD/CNY`, then inverted |

## Selection Model

- **PriceFeed** can use a built-in provider directly
- **Privacy Oracle** can use either a built-in provider or a custom URL flow
- **Provider configs** let each project pin defaults without hardcoding them into requests
