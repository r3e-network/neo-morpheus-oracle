# N3 Fulfillment Replay Boundary Validation

Date: 2026-03-14T14:17:54.585Z

## Scope

This probe validates that a fulfillment signature bound to one request id cannot be replayed against a different pending request, while a correctly re-signed fulfillment for the target request still succeeds.

## Result

- Temporary Oracle: `0x92cca370569a65975a93745ef287529090af7f2e`
- Temporary callback consumer: `0x749391016c769b6a579a65238cacb5457fba7c3b`
- Replay source request id: `2991`
- Replay target request tx: `0xd6463c4cb7799aea59ec82de3d091eb34f159d8f9e21a167d6a2cb5c55933d46`
- Replay target request id: `1`
- Replay fulfill tx: `0x97c5d9889dd1fb69d554889961985d875e5ca13c73057ea2b61d2172cbf6510c`
- Replay exception: `at instruction 3841 (ABORTMSG): ABORTMSG is executed. Reason: invalid verification signature`
- Correct fulfill tx: `0xd7dc6547fdbcad3fef60a93abcce2412b89657a2b44020c7fb8ac35190a49e3b`
- Correct fulfill vmstate: `HALT`
- Final callback success: `true`

## Conclusion

A fulfillment signature from one request id cannot be replayed against a different pending request. The replay attempt faults with `invalid verification signature`, while a fresh signature over the target request digest fulfills successfully.
