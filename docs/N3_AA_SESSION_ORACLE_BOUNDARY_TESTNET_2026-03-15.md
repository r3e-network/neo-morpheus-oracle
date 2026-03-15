# N3 AA Session-Key Oracle Boundary Validation

Date: 2026-03-15T01:56:59.619Z

## Scope

This probe validates that a V3 AA session key can successfully call a Morpheus-enabled downstream consumer through the allowed target/method pair, but cannot escalate to a different target contract or a different method.

## Result

- AA core: `0xdee811458981591a388e12cf89cc103cf55fa736`
- Session verifier: `0xb6ea837c1d0340f3e371339cce3ad8a18f4066c4`
- Execute tx: `0x045d55fce8f1efe2f0fe6d2833d33d9bad1e5262c5b92a668ea84043c97300cf`
- Oracle request id: `3674`
- Callback success: `true`
- Wrong target exception: `at instruction 515 (ABORTMSG): ABORTMSG is executed. Reason: Target contract not permitted`
- Wrong method exception: `at instruction 556 (ABORTMSG): ABORTMSG is executed. Reason: Method not permitted`

## Conclusion

A session key scoped to the temporary consumer's `requestBuiltinProviderPriceSponsored` method can execute the intended downstream Morpheus Oracle call, but cannot be reused for a different target contract or a different method. This closes the core AA-session-key-to-Morpheus-Oracle boundary gap on testnet.
