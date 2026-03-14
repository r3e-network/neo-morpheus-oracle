# N3 AA Session-Key Oracle Boundary Validation

Date: 2026-03-14T09:31:10.694Z

## Scope

This probe validates that a V3 AA session key can successfully call a Morpheus-enabled downstream consumer through the allowed target/method pair, but cannot escalate to a different target contract or a different method.

## Result

- AA core: `0xaba5ab1d2c575fe367ab04d62df5f29af2c88819`
- Session verifier: `0x76ac7deef358545d39a21deaa9d96f140423ab0b`
- Execute tx: `0x1247d496714b19d6d18bed39c4e9e835184cea253234b7bbf8ed4757bc3ebcdb`
- Oracle request id: `1052`
- Callback success: `true`
- Wrong target exception: `at instruction 515 (ABORTMSG): ABORTMSG is executed. Reason: Target contract not permitted`
- Wrong method exception: `at instruction 556 (ABORTMSG): ABORTMSG is executed. Reason: Method not permitted`

## Conclusion

A session key scoped to the temporary consumer's `requestBuiltinProviderPriceSponsored` method can execute the intended downstream Morpheus Oracle call, but cannot be reused for a different target contract or a different method. This closes the core AA-session-key-to-Morpheus-Oracle boundary gap on testnet.
