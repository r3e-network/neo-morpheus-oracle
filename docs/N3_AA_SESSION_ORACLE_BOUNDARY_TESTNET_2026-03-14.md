# N3 AA Session-Key Oracle Boundary Validation

Date: 2026-03-14T05:58:17.161Z

## Scope

This probe validates that a V3 AA session key can successfully call a Morpheus-enabled downstream consumer through the allowed target/method pair, but cannot escalate to a different target contract or a different method.

## Result

- AA core: `0x91bdcb183cd193833a29d22ffaf1ca9e6c566de4`
- Session verifier: `0xa624d2af2d9d5a640e472d59b82833dfe9236ceb`
- Execute tx: `0x71ed58e6081b8345f84c551da0e3276b17d0bd22c5cf3e45d6c0cfce9c7bafe8`
- Oracle request id: `207`
- Callback success: `true`
- Wrong target exception: `at instruction 515 (ABORTMSG): ABORTMSG is executed. Reason: Target contract not permitted`
- Wrong method exception: `at instruction 556 (ABORTMSG): ABORTMSG is executed. Reason: Method not permitted`

## Conclusion

A session key scoped to the temporary consumer's `requestBuiltinProviderPriceSponsored` method can execute the intended downstream Morpheus Oracle call, but cannot be reused for a different target contract or a different method. This closes the core AA-session-key-to-Morpheus-Oracle boundary gap on testnet.
