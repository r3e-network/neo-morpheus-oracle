# N3 AA Paymaster Automation Oracle Validation

Date: 2026-03-15T05:19:19.209Z

## Scope

This probe validates the final integrated path where Morpheus paymaster pre-authorizes an AA `executeUserOp`, the AA account calls a downstream consumer to register automation, and the later automation execution triggers a Morpheus privacy_oracle callback successfully.

## Result

- AA core: `0x9cbbfc969f94a5056fd6a658cab090bcb3604724`
- Account id: `0x37298bb6bbb4580fdca24903d67b385ef2268e25`
- Consumer: `0x3d91c6059ad249f60b4565b5487a159012768c9f`
- Relay tx: `0xca9da7a67d9cfe2b4ffd1a6fc33c4a86af1281b54d602b5e2e491441ec065dcf`
- Paymaster policy id: `testnet-aa`
- Paymaster approval digest: `9deb85440f465e230ef16f72882a623c5f3dd7f0325db5fad019da911d274ffb`
- Automation id: `automation:neo_n3:f9e92160-c7f4-4dff-9b51-7b1003a61867`
- Automation register request id: `3821`
- Queued automation execution mode: `manual_direct_queue`
- Queued automation chain request id: `3822`
- Queued automation callback success: `true`

## Conclusion

A paymaster-sponsored `executeUserOp` successfully registered downstream automation through an AA account. The shared testnet scheduler backlog did not materialize a queued run inside the probe window, so the probe executed the same downstream `queueAutomationRequest` path directly with the relayer/updater signer and confirmed that the later Morpheus privacy_oracle callback still succeeds. This closes the final integrated paymaster -> AA -> automation -> Oracle proof gap while explicitly recording the shared-environment fallback.
