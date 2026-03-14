# N3 AA Session-Key Oracle Boundary Validation

Date: 2026-03-14T14:03:13.000Z

## Scope

This probe validates that a V3 AA session key can successfully call a Morpheus-enabled downstream consumer through the allowed target/method pair, but cannot escalate to a different target contract or a different method.

## Result

- AA core: `0x1a7d549a0cdfc8111900da8fab1dd157568dadb3`
- Session verifier: `0x49d91591a7f683a413de1acbef3928b8dc0cf4e1`
- Execute tx: `0x11afdc5de97b935d79d4845419e698d6f4245e525b5789a042426c834d11aa43`
- Oracle request id: `2976`
- Callback success: `true`
- Wrong target exception: `at instruction 515 (ABORTMSG): ABORTMSG is executed. Reason: Target contract not permitted`
- Wrong method exception: `at instruction 556 (ABORTMSG): ABORTMSG is executed. Reason: Method not permitted`

## Conclusion

A session key scoped to the temporary consumer's `requestBuiltinProviderPriceSponsored` method can execute the intended downstream Morpheus Oracle call, but cannot be reused for a different target contract or a different method. This closes the core AA-session-key-to-Morpheus-Oracle boundary gap on testnet.
