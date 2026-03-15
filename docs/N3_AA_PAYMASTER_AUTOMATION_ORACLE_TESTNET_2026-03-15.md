# N3 AA Paymaster Automation Oracle Validation

Date: 2026-03-15T06:03:24.377Z

## Scope

This probe validates the final integrated path where Morpheus paymaster pre-authorizes an AA `executeUserOp`, the AA account calls a downstream consumer to register automation, and the later automation execution triggers a Morpheus privacy_oracle callback successfully.

## Result

- AA core: `0x9cbbfc969f94a5056fd6a658cab090bcb3604724`
- Account id: `0x37298bb6bbb4580fdca24903d67b385ef2268e25`
- Consumer: `0x9aef005765e2e11dbdb2bb6e0f061124a3950f18`
- Relay tx: `0xd63292a33274795b4c625fe97dd008db9f1b4bfb29f334903271a44908ee6c5c`
- Paymaster policy id: `testnet-aa`
- Paymaster approval digest: `b6e80df459ac42a19f591f86aff1c3191a687fb981bd896bed369379504a39f1`
- Automation id: `automation:neo_n3:ab95f187-d500-435b-bae3-8dabd2e406d2`
- Automation register request id: `3837`
- Queued automation execution mode: `scheduler`
- Queued automation chain request id: `3838`
- Queued automation callback success: `true`

## Conclusion

A paymaster-sponsored `executeUserOp` can register downstream automation through an AA account, and the later automation execution still reaches the Morpheus privacy_oracle callback path successfully. This closes the final integrated paymaster -> AA -> automation -> Oracle proof gap on testnet.
