# N3 AA Paymaster Automation Oracle Validation

Date: 2026-03-15T06:40:39.336Z

## Scope

This probe validates the final integrated path where Morpheus paymaster pre-authorizes an AA `executeUserOp`, the AA account calls a downstream consumer to register automation, and the later automation execution triggers a Morpheus privacy_oracle callback successfully.

## Result

- AA core: `0x9cbbfc969f94a5056fd6a658cab090bcb3604724`
- Account id: `0x37298bb6bbb4580fdca24903d67b385ef2268e25`
- Consumer: `0xea598996618585fdd5d7a75ad1c77eadc9870e8c`
- Relay tx: `0xbb14baeb7a7ce4e1560c941234b039410d757fc0eff97d2043a8b2bedc05a7ed`
- Paymaster policy id: `testnet-aa`
- Paymaster approval digest: `cc22a41f087d810cdaca6ea65b44c2f748664ae6b34dd3581703a1e185f15ddd`
- Automation id: `automation:neo_n3:2cac765c-3b65-4d9d-944e-c4cca5523350`
- Automation register request id: `3848`
- Queued automation execution mode: `scheduler`
- Queued automation chain request id: `3849`
- Queued automation callback success: `true`

## Conclusion

A paymaster-sponsored `executeUserOp` can register downstream automation through an AA account, and the later automation execution still reaches the Morpheus privacy_oracle callback path successfully. This closes the final integrated paymaster -> AA -> automation -> Oracle proof gap on testnet.
