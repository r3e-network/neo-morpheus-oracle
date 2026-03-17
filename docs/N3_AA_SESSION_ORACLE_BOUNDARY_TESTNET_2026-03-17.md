# N3 AA Session-Key Oracle Boundary Validation

Date: 2026-03-17T15:40:56.110Z

## Scope

This probe validates that a V3 AA session key can successfully call a Morpheus-enabled downstream consumer through the allowed target/method pair, but cannot escalate to a different target contract or a different method.

## Result

- AA core: `0xe888bf4af35390a2e3b0913e4d59065deefff4ae`
- Session verifier: `0x0b5a1f79c231c277c5dfa0e4b00a7c6c7a34d4a5`
- Execute tx: `0x638265bcd21163c4f5e4cf968c76e76758195d0b42071df0654f8712a8e192bb`
- Oracle request id: `3956`
- Callback success: `true`
- Wrong target exception: `at instruction 525 (ABORTMSG): ABORTMSG is executed. Reason: Target contract not permitted`
- Wrong method exception: `at instruction 566 (ABORTMSG): ABORTMSG is executed. Reason: Method not permitted`

## Conclusion

A session key scoped to the temporary consumer's `requestBuiltinProviderPriceSponsored` method can execute the intended downstream Morpheus Oracle call, but cannot be reused for a different target contract or a different method. This closes the core AA-session-key-to-Morpheus-Oracle boundary gap on testnet.
