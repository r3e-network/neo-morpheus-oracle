# N3 Fulfillment Replay Boundary Validation

Date: 2026-03-14T19:02:55.424Z

## Scope

This probe validates that a fulfillment signature bound to one request id cannot be replayed against a different pending request, while a correctly re-signed fulfillment for the target request still succeeds.

## Result

- Temporary Oracle: `0x24fface73d08f9d43df57cc289e18fd28c651c04`
- Temporary callback consumer: `0x0b0c31c3556e7ba13bdf77224b6242b267bb3268`
- Replay source request id: `3342`
- Replay target request tx: `0xa78ea425f8b29be7ba95c80955909b4e29722ec8466b24955a3561614c3f14c4`
- Replay target request id: `1`
- Replay fulfill tx: `0xbcdadda98ba0d38bb4115676349c87bb82c63e0cff683bdccb34dd6674861605`
- Replay exception: `at instruction 3841 (ABORTMSG): ABORTMSG is executed. Reason: invalid verification signature`
- Correct fulfill tx: `0x4504297398b911c922a8bf2bb5ce35accb35dbcede929f21446638ee0c890a12`
- Correct fulfill vmstate: `HALT`
- Final callback success: `true`

## Conclusion

A fulfillment signature from one request id cannot be replayed against a different pending request. The replay attempt faults with `invalid verification signature`, while a fresh signature over the target request digest fulfills successfully.
