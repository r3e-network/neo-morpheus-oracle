# N3 Fulfillment Replay Boundary Validation

Date: 2026-03-15T05:57:12.724Z

## Scope

This probe validates that a fulfillment signature bound to one request id cannot be replayed against a different pending request, while a correctly re-signed fulfillment for the target request still succeeds.

## Result

- Temporary Oracle: `0xf1389b2280ae22bbcc71099825cb6f0595b586b6`
- Temporary callback consumer: `0x0fe177de4b79ff6b76b80eec02d7268aa3c8f29d`
- Replay source request id: `3830`
- Replay target request tx: `0x6ae7d62b007192609f6c5fd7f30f290ac85eec99443a2c414bd90039be4e6b76`
- Replay target request id: `1`
- Replay fulfill tx: `0x246f7a4dbf2c1918ff56f2e3d4ba5b7e113ee29b893831d42029ee7608636c61`
- Replay exception: `at instruction 3841 (ABORTMSG): ABORTMSG is executed. Reason: invalid verification signature`
- Correct fulfill tx: `0xec5a36e4f2db0b7ec81abf3cbde110fbe50ded79b65d698aa1e3bdbce122078a`
- Correct fulfill vmstate: `HALT`
- Final callback success: `true`

## Conclusion

A fulfillment signature from one request id cannot be replayed against a different pending request. The replay attempt faults with `invalid verification signature`, while a fresh signature over the target request digest fulfills successfully.
