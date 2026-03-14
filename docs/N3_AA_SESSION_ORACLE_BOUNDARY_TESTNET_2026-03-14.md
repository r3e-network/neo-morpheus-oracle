# N3 AA Session-Key Oracle Boundary Validation

Date: 2026-03-14T19:07:00.710Z

## Scope

This probe validates that a V3 AA session key can successfully call a Morpheus-enabled downstream consumer through the allowed target/method pair, but cannot escalate to a different target contract or a different method.

## Result

- AA core: `0xa979fb7645144ba5c13910f1d0be456727a7d431`
- Session verifier: `0x6fcfaba7cc6105e36d35f39e8e0aae9716288a6d`
- Execute tx: `0x7746bba8673af303db6f22b45a7a6cfaee33e99fb604b9123e6092f79c9e2a71`
- Oracle request id: `3383`
- Callback success: `true`
- Wrong target exception: `at instruction 515 (ABORTMSG): ABORTMSG is executed. Reason: Target contract not permitted`
- Wrong method exception: `at instruction 556 (ABORTMSG): ABORTMSG is executed. Reason: Method not permitted`

## Conclusion

A session key scoped to the temporary consumer's `requestBuiltinProviderPriceSponsored` method can execute the intended downstream Morpheus Oracle call, but cannot be reused for a different target contract or a different method. This closes the core AA-session-key-to-Morpheus-Oracle boundary gap on testnet.
