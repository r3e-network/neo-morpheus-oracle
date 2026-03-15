# N3 Fulfillment Replay Boundary Validation

Date: 2026-03-15T06:34:03.642Z

## Scope

This probe validates that a fulfillment signature bound to one request id cannot be replayed against a different pending request, while a correctly re-signed fulfillment for the target request still succeeds.

## Result

- Temporary Oracle: `0x2efcd5421de328d7720bdaa351dc464e4ed65ed2`
- Temporary callback consumer: `0xb3b24ede9530175903fd1f7f64a2f3410eef477e`
- Replay source request id: `3842`
- Replay target request tx: `0x008ee30e570b2ae8971e2b32d5fbbfa0e4eb04f03235001c5d0eb63e814b31c3`
- Replay target request id: `1`
- Replay fulfill tx: `0x757139d31139175acea3f0d7953123103039440bac9d5e8028355bdb3c7b7d0c`
- Replay exception: `at instruction 3841 (ABORTMSG): ABORTMSG is executed. Reason: invalid verification signature`
- Correct fulfill tx: `0x7dc0ef65a5c30472dde942da1f3475202e49cfc4b6c8fba38c8f6e15a985bcab`
- Correct fulfill vmstate: `HALT`
- Final callback success: `true`

## Conclusion

A fulfillment signature from one request id cannot be replayed against a different pending request. The replay attempt faults with `invalid verification signature`, while a fresh signature over the target request digest fulfills successfully.
