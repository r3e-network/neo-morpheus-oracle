# N3 AA Session-Key Oracle Boundary Validation

Date: 2026-03-15T05:14:04.501Z

## Scope

This probe validates that a V3 AA session key can successfully call a Morpheus-enabled downstream consumer through the allowed target/method pair, but cannot escalate to a different target contract or a different method.

## Result

- AA core: `0x967f94667eda6bb9a67ebc3ac032be55b7375954`
- Session verifier: `0x9a489cd59f11801aa1a4016e526cc61699f362a0`
- Execute tx: `0x6d66a38baf45ee4ffdcbdd0806c1a073641433c62e18b9a9022fafd4378f9f30`
- Oracle request id: `3816`
- Callback success: `true`
- Wrong target exception: `at instruction 515 (ABORTMSG): ABORTMSG is executed. Reason: Target contract not permitted`
- Wrong method exception: `at instruction 556 (ABORTMSG): ABORTMSG is executed. Reason: Method not permitted`

## Conclusion

A session key scoped to the temporary consumer's `requestBuiltinProviderPriceSponsored` method can execute the intended downstream Morpheus Oracle call, but cannot be reused for a different target contract or a different method. This closes the core AA-session-key-to-Morpheus-Oracle boundary gap on testnet.
