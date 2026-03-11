# Attestation Payload Spec

Morpheus worker responses now expose a stable verification envelope across privacy Oracle, compute, feed, and VRF flows.

## Verification Envelope

When available, the response includes:

```json
{
  "output_hash": "<sha256 over the canonical result payload>",
  "signature": "<neo n3 signature or null>",
  "public_key": "<neo n3 public key or null>",
  "attestation_hash": "<currently mirrors output_hash>",
  "tee_attestation": {
    "app_id": "...",
    "instance_id": "...",
    "compose_hash": "...",
    "quote": "0x...",
    "event_log": "...",
    "report_data": "0x..."
  },
  "verification": {
    "output_hash": "...",
    "signature": "...",
    "public_key": "...",
    "attestation_hash": "...",
    "tee_attestation": { "...": "..." }
  }
}
```

## Report Data Binding

The current application-level verifier checks that:

- `report_data` equals the expected `output_hash`
- or equals `sha256(canonical(expected_payload))`

This gives a stable app-level binding between the returned result and the quote metadata.

## Endpoint Coverage

The following worker endpoints can include `tee_attestation` when `include_attestation=true` or `PHALA_EMIT_ATTESTATION=true`:

- `/oracle/query`
- `/oracle/smart-fetch`
- `/oracle/feed`
- `/compute/execute`
- `/vrf/random`

## Relayer Fulfillment Envelope

Successful on-chain fulfillment payloads are normalized into `morpheus-result/v1` envelopes before being UTF-8 encoded into the callback `result` bytes.

The verifier demo route `/api/attestation/demo` returns both a sample worker response and the exact verifier input required to validate the application-level binding.

## Stable Oracle Encryption Key

`/oracle/public-key` now exposes:

- `algorithm`
- `public_key`
- `public_key_format`
- `key_source`

When `PHALA_USE_DERIVED_KEYS=true`, the worker uses a dstack-derived wrapping key plus a sealed keystore so the Oracle encryption public key remains stable across restarts.

## Verifier

The web verifier is available at:

- `/verifier`

The verifier supports:

- paste attestation JSON manually
- provide expected payload JSON
- provide expected output hash directly
- optional checks for compose hash, app id, and instance id
- one-click demo load from `/api/attestation/demo`

## Important Note

The current verifier is an application-level consistency verifier. It does **not** fully validate Intel/TDX quote certificate chains.
