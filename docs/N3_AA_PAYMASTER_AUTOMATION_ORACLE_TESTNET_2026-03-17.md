# N3 AA Paymaster Automation Oracle Validation

Date: 2026-03-17T15:44:02.614Z

## Scope

This probe validates the final integrated path where Morpheus paymaster pre-authorizes an AA `executeUserOp`, the AA account calls a downstream consumer to register automation, and the later automation execution triggers a Morpheus privacy_oracle callback successfully.

## Result

- AA core: `0xe24d2980d17d2580ff4ee8dc5dddaa20e3caec38`
- Account id: `0x0c3146e78efc42bfb7d4cc2e06e3efd063c01c56`
- Consumer: `0x33dc39d713d1fef980d0d2e09c09535b9a34d2a0`
- Relay tx: `0x21fbd780f3d3feff6fd008e469358deb9a0c74d087a6b78f09ada71b940bda3e`
- Paymaster policy id: `testnet-aa`
- Paymaster approval digest: `7e21b4af2ad8d75969266e960f5e935a5344232a3545624eb31ccd755da32e61`
- Automation id: `automation:neo_n3:cfad69f6-5fc3-4a41-bb8a-12e6d17468f2`
- Automation register request id: `3957`
- Queued automation execution mode: `scheduler`
- Queued automation chain request id: `3958`
- Queued automation callback success: `true`

## Conclusion

A paymaster-sponsored `executeUserOp` can register downstream automation through an AA account, and the later automation execution still reaches the Morpheus privacy_oracle callback path successfully. This closes the final integrated paymaster -> AA -> automation -> Oracle proof gap on testnet.
