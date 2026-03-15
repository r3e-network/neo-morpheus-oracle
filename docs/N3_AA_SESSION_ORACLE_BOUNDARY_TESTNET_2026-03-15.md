# N3 AA Session-Key Oracle Boundary Validation

Date: 2026-03-15T02:33:06.098Z

## Scope

This probe validates that a V3 AA session key can successfully call a Morpheus-enabled downstream consumer through the allowed target/method pair, but cannot escalate to a different target contract or a different method.

## Result

- AA core: `0x3eafd3d98b17f714f2acf94d5df85f0438892d58`
- Session verifier: `0xdbf07b0c059c1857b5856d592c81b91544d0a006`
- Execute tx: `0x9f8ae5ae7c9bf16be1f992356bd5b55aec984b046108de51266619a24276034d`
- Oracle request id: `3739`
- Callback success: `true`
- Wrong target exception: `at instruction 515 (ABORTMSG): ABORTMSG is executed. Reason: Target contract not permitted`
- Wrong method exception: `at instruction 556 (ABORTMSG): ABORTMSG is executed. Reason: Method not permitted`

## Conclusion

A session key scoped to the temporary consumer's `requestBuiltinProviderPriceSponsored` method can execute the intended downstream Morpheus Oracle call, but cannot be reused for a different target contract or a different method. This closes the core AA-session-key-to-Morpheus-Oracle boundary gap on testnet.
