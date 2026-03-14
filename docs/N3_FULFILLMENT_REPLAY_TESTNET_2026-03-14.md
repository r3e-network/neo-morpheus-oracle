# N3 Fulfillment Replay Boundary Validation

Date: 2026-03-14T09:27:20.116Z

## Scope

This probe validates that a fulfillment signature bound to one request id cannot be replayed against a different pending request, while a correctly re-signed fulfillment for the target request still succeeds.

## Result

- Temporary Oracle: `0x3a17b412b1e130ea45aafe35401c3da4dafd8d59`
- Temporary callback consumer: `0xfaf3f47556a9601a2ef6d9dac6bd334c295c2ba6`
- Replay source request id: `1016`
- Replay target request tx: `0x3d33a970699e4bd85bdc899946be3f1a66e070b91a420cd82854c79f9d842be4`
- Replay target request id: `1`
- Replay fulfill tx: `0xe48211e2ab841258c2f16ba48e7ac7f13279ef6bf8d948c30e270de37c3ebd83`
- Replay exception: `at instruction 3841 (ABORTMSG): ABORTMSG is executed. Reason: invalid verification signature`
- Correct fulfill tx: `0x8aa7d8f5c6569137c44ff539280cb8f983516958a6b32f423c7a2568b76cb182`
- Correct fulfill vmstate: `HALT`
- Final callback success: `true`

## Conclusion

A fulfillment signature from one request id cannot be replayed against a different pending request. The replay attempt faults with `invalid verification signature`, while a fresh signature over the target request digest fulfills successfully.
