# N3 Fulfillment Replay Boundary Validation

Date: 2026-03-14T04:59:37.970Z

## Scope

This probe validates that a fulfillment signature bound to one request id cannot be replayed against a different pending request, while a correctly re-signed fulfillment for the target request still succeeds.

## Result

- Temporary Oracle: `0x0f8639836f175bf70a9cd47db1ffe8abaa276a53`
- Temporary callback consumer: `0xb43effaa572dec7b21352f74f2e20bc124f9da83`
- Replay source request id: `200`
- Replay target request tx: `0xce1b37d881c2ba71f73606b77b23bdd11fd57059c0e4a387e63c50bcde00289c`
- Replay target request id: `1`
- Replay fulfill tx: `0x6dcf9ea381afae2163f9fcaa1a3fb58500c6ab76af3731bfa41e380e9fd0f4d1`
- Replay exception: `at instruction 3841 (ABORTMSG): ABORTMSG is executed. Reason: invalid verification signature`
- Correct fulfill tx: `0x94532fa7e66526c2c3d25983d3b0779896b1cef42b0a44862d91c488a74997fc`
- Correct fulfill vmstate: `HALT`
- Final callback success: `true`

## Conclusion

A fulfillment signature from one request id cannot be replayed against a different pending request. The replay attempt faults with `invalid verification signature`, while a fresh signature over the target request digest fulfills successfully.
