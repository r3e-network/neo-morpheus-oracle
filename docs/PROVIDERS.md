# Providers

Morpheus Oracle supports two provider modes:

- **Built-in providers** — selected by `provider` and configured per project in Supabase
- **Custom source requests** — user-supplied `url`, optional encrypted token/payload, and optional compute script

## Built-in Providers

Current built-ins:

- `twelvedata`
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

- set `MORPHEUS_PROVIDER_CONFIG_API_KEY` or `ADMIN_CONSOLE_API_KEY`
- send it via `x-admin-api-key` or `Authorization: Bearer ...`

The dashboard includes a Provider Configs panel that can manage these records directly.

## Custom Source Requests

Users can bypass built-ins and send direct Oracle requests with:

- `url`
- optional `encrypted_token` or `encrypted_payload`
- optional `script` or `script_base64`

This supports three useful modes:

- **plain fetch** — URL only
- **fetch + compute** — URL plus script
- **private fetch + compute** — URL plus encrypted payload plus script

## Selection Model

- **PriceFeed** can use a built-in provider directly
- **Privacy Oracle** can use either a built-in provider or a custom URL flow
- **Provider configs** let each project pin defaults without hardcoding them into requests
