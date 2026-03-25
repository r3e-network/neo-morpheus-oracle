# Checkly Monitoring Scaffold

This folder defines the recommended synthetic checks for the Morpheus stack.

## Suggested Checks

### Browser checks

1. `aa-home`
   - URL: AA frontend home
   - Expect main hero heading
2. `aa-identity`
   - URL: AA frontend `/identity`
   - Expect identity workspace heading
3. `oracle-home`
   - URL: Morpheus oracle web home
   - Expect hero + docs links
4. `oracle-explorer`
   - URL: Morpheus oracle `/explorer`
   - Expect dashboard shell

### API checks

1. `oracle-runtime-health`
   - `GET /api/runtime/health`
2. `oracle-runtime-info`
   - `GET /api/runtime/info`
3. `control-plane-health`
   - `GET /testnet/health`
   - `GET /mainnet/health`
4. `oracle-public-key`
   - `GET /api/oracle/public-key`

## Required Values

- `CHECKLY_API_KEY`
- `CHECKLY_ACCOUNT_ID`
- `CHECKLY_PROJECT_NAME`
- deployment URLs for:
  - AA frontend
  - oracle web frontend
  - control plane

## Recommended Alert Targets

- email
- Slack / Discord webhook
- PagerDuty for production-only health failures
