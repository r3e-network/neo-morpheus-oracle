# N3 AA Recovery Cross-Account Boundary

Date: 2026-03-14T13:34:56.481Z

## Scope

This probe deploys a disposable MorpheusSocialRecoveryVerifier on Neo N3 testnet, requests a compact NeoDID recovery ticket for account A, submits it successfully to account A, and then attempts to replay the same ticket against account B.

## Result

- Recovery verifier hash: `0x9e08c858774b7eb2844810247b61812d44604424`
- Oracle recovery request id: `2638`
- Submit A tx: `0x044c23c708518a50dbdbb65caf90809cd7aba2dc6caf9533432c509bd72f9270`
- Wrong-account testInvoke state: `FAULT`
- Wrong-account exception: `at instruction 5171 (ABORTMSG): ABORTMSG is executed. Reason: Invalid Morpheus recovery signature`

## Conclusion

The ticket bound to account A cannot be replayed against account B if the verifier preserves account-specific digest binding.
