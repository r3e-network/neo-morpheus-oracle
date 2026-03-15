# N3 Fulfillment Replay Boundary Validation

Date: 2026-03-15T01:52:49.047Z

## Scope

This probe validates that a fulfillment signature bound to one request id cannot be replayed against a different pending request, while a correctly re-signed fulfillment for the target request still succeeds.

## Result

- Temporary Oracle: `0xec0a31bfb45ab6ab1a5d5113a3827959bafd24f2`
- Temporary callback consumer: `0xefb1f6be2424db4d3b14ee6eaed1c82619cf42bb`
- Replay source request id: `3624`
- Replay target request tx: `0x34eb13a435b9ffe650791f4f5e13a381f0e911979083e02c4ec90788a89f2be1`
- Replay target request id: `1`
- Replay fulfill tx: `0x2bada4a6defa14e5a4a7a8983f6fb772b3995e13e313864e803772cda679d1a6`
- Replay exception: `at instruction 3841 (ABORTMSG): ABORTMSG is executed. Reason: invalid verification signature`
- Correct fulfill tx: `0x7ed9ef1b5a8cd6a8f4750e2266a163df4148d449ad822c3ca7e51b945d830bec`
- Correct fulfill vmstate: `HALT`
- Final callback success: `true`

## Conclusion

A fulfillment signature from one request id cannot be replayed against a different pending request. The replay attempt faults with `invalid verification signature`, while a fresh signature over the target request digest fulfills successfully.
