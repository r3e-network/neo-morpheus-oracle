# Morpheus Paymaster

## Purpose

Morpheus Paymaster is a policy-gated sponsorship service exposed by the Phala worker at:

- `POST /paymaster/authorize`

It is intended to sponsor pre-approved Neo N3 Abstract Account operations without exposing a global open faucet.

## Security Model

The service does not blindly pay for arbitrary requests.

Current controls:

- network-scoped enable/disable flags
- per-network max gas limit
- per-network allowlisted target contracts
- per-network allowlisted method names
- short-lived signed authorization result
- TEE attestation bound to the authorization payload

The returned payload includes:

- `approved`
- `network`
- `target_chain`
- `sponsorship_id`
- `expires_at`
- `output_hash`
- `signature`
- `public_key`
- `tee_attestation`

This makes the response portable across:

- AA relay backends
- first-party bundlers
- third-party sponsored execution gateways

## Environment Variables

### Testnet

- `MORPHEUS_PAYMASTER_TESTNET_ENABLED`
- `MORPHEUS_PAYMASTER_TESTNET_MAX_GAS_UNITS`
- `MORPHEUS_PAYMASTER_TESTNET_ALLOW_TARGETS`
- `MORPHEUS_PAYMASTER_TESTNET_ALLOW_METHODS`
- `MORPHEUS_PAYMASTER_TESTNET_TTL_MS`

### Mainnet

- `MORPHEUS_PAYMASTER_MAINNET_ENABLED`
- `MORPHEUS_PAYMASTER_MAINNET_MAX_GAS_UNITS`
- `MORPHEUS_PAYMASTER_MAINNET_ALLOW_TARGETS`
- `MORPHEUS_PAYMASTER_MAINNET_ALLOW_METHODS`
- `MORPHEUS_PAYMASTER_MAINNET_TTL_MS`

## Request Shape

```json
{
  "network": "testnet",
  "target_chain": "neo_n3",
  "account_id": "0x37298bb6bbb4580fdca24903d67b385ef2268e25",
  "target_contract": "0x9cbbfc969f94a5056fd6a658cab090bcb3604724",
  "method": "executeUserOp",
  "estimated_gas_units": 120000
}
```

## zERC20 Builtins

Available builtins:

- `zkp.groth16.verify`
- `zkp.zerc20.single_withdraw.verify`

`zkp.zerc20.single_withdraw.verify` is a separate compute helper. It is not part of paymaster policy by default. Applications that need zERC20-specific sponsorship can build that rule on top of the generic paymaster flow.

## Integration Patterns

### 1. AA Relay / Bundler

Call `paymaster/authorize` just before relay submission.

Recommended order:

1. simulate the AA invocation
2. estimate gas units
3. call Morpheus Paymaster with normalized operation metadata
4. submit only if `approved === true`

### 2. Third-Party Bundler

The bundler can use the signed authorization as a sponsorship ticket and verify:

- signature
- `expires_at`
- target contract
- method
- gas limit
- attestation metadata

### 3. Application Server

An app backend can pre-screen business policy, then delegate final sponsorship approval to Morpheus Paymaster so that:

- app policy remains app-specific
- TEE-signed sponsorship remains portable

## Current AA Integration

The AA frontend relay request builder now forwards optional `paymaster` metadata, and the AA relay API can request Morpheus paymaster authorization before broadcasting a relay-ready meta invocation.

This is currently a server-side integration path. It does not require changing the AA on-chain contract.
