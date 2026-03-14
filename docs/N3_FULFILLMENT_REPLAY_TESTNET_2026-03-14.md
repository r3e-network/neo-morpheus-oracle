# N3 Fulfillment Replay Boundary Validation

Date: 2026-03-14T13:59:15.995Z

## Scope

This probe validates that a fulfillment signature bound to one request id cannot be replayed against a different pending request, while a correctly re-signed fulfillment for the target request still succeeds.

## Result

- Temporary Oracle: `0x9dfab469407465638c58184dbfc3f19180758cbe`
- Temporary callback consumer: `0x39f45bfd0746473f33a5525648d4c4b57fe79447`
- Replay source request id: `2926`
- Replay target request tx: `0x232fe0505fc6f1965b5f5209fab8bb9a8d0ded32ccbcdf43a8900bc45f47eae3`
- Replay target request id: `1`
- Replay fulfill tx: `0xcee309fefcc55c90fe6f02b1eae8ba85bb6f8b0b2dc25a5b158b97b11c4f85b7`
- Replay exception: `at instruction 3841 (ABORTMSG): ABORTMSG is executed. Reason: invalid verification signature`
- Correct fulfill tx: `0x37d2265d814f731a41acbbabe7427fde96c0c4836544108e4b045fcad796120a`
- Correct fulfill vmstate: `HALT`
- Final callback success: `true`

## Conclusion

A fulfillment signature from one request id cannot be replayed against a different pending request. The replay attempt faults with `invalid verification signature`, while a fresh signature over the target request digest fulfills successfully.
