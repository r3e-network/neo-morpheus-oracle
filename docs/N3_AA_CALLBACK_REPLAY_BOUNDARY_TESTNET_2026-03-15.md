# N3 AA-Bound Callback Replay Boundary Validation

Date: 2026-03-15T02:17:40.308Z

## Scope

This probe deploys a temporary Oracle, a temporary AA core, and an AA-bound callback harness that records pending request -> accountId bindings. It then attempts to replay a valid Oracle-originated fulfillment signature into a different pending request bound to another AA account context.

## Result

- Temporary Oracle: `0xb7590bc84146be5460b9bb6d854b17c3d9bf188d`
- Temporary AA core: `0xf876ee91fd2b16a8a8aff801d6f51c41c0205859`
- AA-bound harness: `0x6182a3c789da75e01e224c79ae7c5a4c98bea881`
- Request A id: `1`
- Request B id: `2`
- Replay tx: `0xe0011eacc573754f163100e9b399602eadff7b7c5dd941d5dbfe319891ef6b8b`
- Replay exception: `at instruction 3841 (ABORTMSG): ABORTMSG is executed. Reason: invalid verification signature`
- Fulfill A tx: `0xfe93cb8dc89b4d97ad35c6a8673f799571faccdbc805c997b47818adc74d0890`
- Account A unlocked: `true`
- Account B unlocked: `false`
- Account B pending binding: `0x2222222222222222222222222222222222222222`

## Conclusion

A valid fulfillment signature cannot be replayed into a different pending request even when both requests terminate at the same AA-bound consumer. The replay attempt faults at the Oracle verification layer, account A unlocks only through its own valid request, and account B remains locked and still bound to its pending request.
