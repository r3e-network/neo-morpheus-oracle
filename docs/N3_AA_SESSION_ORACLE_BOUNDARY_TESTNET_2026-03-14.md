# N3 AA Session-Key Oracle Boundary Validation

Date: 2026-03-14T14:22:58.100Z

## Scope

This probe validates that a V3 AA session key can successfully call a Morpheus-enabled downstream consumer through the allowed target/method pair, but cannot escalate to a different target contract or a different method.

## Result

- AA core: `0xcb60557f7ae8fb745f732442b0dfe7d82f0bf742`
- Session verifier: `0xfff1ffddcc73113e1b3f677742ec6d096a26165b`
- Execute tx: `0x06a687a6ac43bfcaed3feb40b965477d5d448ee967402d004020ad5d84054a99`
- Oracle request id: `3031`
- Callback success: `true`
- Wrong target exception: `at instruction 515 (ABORTMSG): ABORTMSG is executed. Reason: Target contract not permitted`
- Wrong method exception: `at instruction 556 (ABORTMSG): ABORTMSG is executed. Reason: Method not permitted`

## Conclusion

A session key scoped to the temporary consumer's `requestBuiltinProviderPriceSponsored` method can execute the intended downstream Morpheus Oracle call, but cannot be reused for a different target contract or a different method. This closes the core AA-session-key-to-Morpheus-Oracle boundary gap on testnet.
