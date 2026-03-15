# N3 AA Session-Key Oracle Boundary Validation

Date: 2026-03-15T06:00:49.821Z

## Scope

This probe validates that a V3 AA session key can successfully call a Morpheus-enabled downstream consumer through the allowed target/method pair, but cannot escalate to a different target contract or a different method.

## Result

- AA core: `0x80d6539a361aa1a3987753e58c0d2f5357774dc6`
- Session verifier: `0x4c9212ba7342c5c1b6322696410d1f04cdb5b70b`
- Execute tx: `0xb549188fafe9abf50fdfe254135b98b5d9591bb36185d4378391c2a019a95c98`
- Oracle request id: `3836`
- Callback success: `true`
- Wrong target exception: `at instruction 515 (ABORTMSG): ABORTMSG is executed. Reason: Target contract not permitted`
- Wrong method exception: `at instruction 556 (ABORTMSG): ABORTMSG is executed. Reason: Method not permitted`

## Conclusion

A session key scoped to the temporary consumer's `requestBuiltinProviderPriceSponsored` method can execute the intended downstream Morpheus Oracle call, but cannot be reused for a different target contract or a different method. This closes the core AA-session-key-to-Morpheus-Oracle boundary gap on testnet.
