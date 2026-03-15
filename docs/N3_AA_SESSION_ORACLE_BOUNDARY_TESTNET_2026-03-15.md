# N3 AA Session-Key Oracle Boundary Validation

Date: 2026-03-15T06:37:57.401Z

## Scope

This probe validates that a V3 AA session key can successfully call a Morpheus-enabled downstream consumer through the allowed target/method pair, but cannot escalate to a different target contract or a different method.

## Result

- AA core: `0x62995f26371f52a44084fb08ed2b6b63df546f7d`
- Session verifier: `0x70f3ea7452c30ec11f8727725e499fb8e865c60e`
- Execute tx: `0x9dce58dbe9d1bee86ffe51e71498e3dbe6106987cab53712b456c5d2593b1666`
- Oracle request id: `3847`
- Callback success: `true`
- Wrong target exception: `at instruction 515 (ABORTMSG): ABORTMSG is executed. Reason: Target contract not permitted`
- Wrong method exception: `at instruction 556 (ABORTMSG): ABORTMSG is executed. Reason: Method not permitted`

## Conclusion

A session key scoped to the temporary consumer's `requestBuiltinProviderPriceSponsored` method can execute the intended downstream Morpheus Oracle call, but cannot be reused for a different target contract or a different method. This closes the core AA-session-key-to-Morpheus-Oracle boundary gap on testnet.
