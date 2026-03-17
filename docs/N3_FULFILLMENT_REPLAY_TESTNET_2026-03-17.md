# N3 Fulfillment Replay Boundary Validation

Date: 2026-03-17T15:37:13.845Z

## Scope

This probe validates that a fulfillment signature bound to one request id cannot be replayed against a different pending request, while a correctly re-signed fulfillment for the target request still succeeds.

## Result

- Temporary Oracle: `0xad10e385b197d204c75ef4a38c282d71e7eb5a2b`
- Temporary callback consumer: `0x54f7a6a7a5280f19e639924f742879445859cd0c`
- Replay source request id: `3951`
- Replay target request tx: `0xc964056d2ae7aee200bd5646ac65c0ac7f603be7e1b28b1a8615f5c5c66ae43a`
- Replay target request id: `1`
- Replay fulfill tx: `0x2d57be816ae0326fc5e5563f0c062d204da1ff2455991aad4c6ebbb942f06cab`
- Replay exception: `at instruction 4105 (ABORTMSG): ABORTMSG is executed. Reason: invalid verification signature`
- Correct fulfill tx: `0x420c0f411d827932aa156cd56bdf585780cf95ceb6e6d4128304346a46c9474a`
- Correct fulfill vmstate: `HALT`
- Final callback success: `true`

## Conclusion

A fulfillment signature from one request id cannot be replayed against a different pending request. The replay attempt faults with `invalid verification signature`, while a fresh signature over the target request digest fulfills successfully.
