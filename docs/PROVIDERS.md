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

## Selection Model

- **PriceFeed** can use a built-in provider directly
- **Privacy Oracle** can use either a built-in provider or a custom URL flow
- **Provider configs** let each project pin defaults without hardcoding them into requests
