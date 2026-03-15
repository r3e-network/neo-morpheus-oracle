# N3 Fulfillment Replay Boundary Validation

Date: 2026-03-15T02:28:42.642Z

## Scope

This probe validates that a fulfillment signature bound to one request id cannot be replayed against a different pending request, while a correctly re-signed fulfillment for the target request still succeeds.

## Result

- Temporary Oracle: `0x50a762cb2008cfca3b839015738c1c9d933e5d38`
- Temporary callback consumer: `0xaa7ba7483170d293c1f8a384bc56d37a3aca6e34`
- Replay source request id: `3689`
- Replay target request tx: `0x53f8025cc70c44c12b7af2ffca162535d2d0f4b0db1401f43ce19e17a385aaeb`
- Replay target request id: `1`
- Replay fulfill tx: `0x82ab1ad1ba6846bb46b2c124da6193fbb29dac8b238092c98ab7ef923bf79bed`
- Replay exception: `at instruction 3841 (ABORTMSG): ABORTMSG is executed. Reason: invalid verification signature`
- Correct fulfill tx: `0xdcf9e08793ff2ff47f152e5bccbd74e39ef19fd3fdfdcd9706e7fa348d5c0eb1`
- Correct fulfill vmstate: `HALT`
- Final callback success: `true`

## Conclusion

A fulfillment signature from one request id cannot be replayed against a different pending request. The replay attempt faults with `invalid verification signature`, while a fresh signature over the target request digest fulfills successfully.
