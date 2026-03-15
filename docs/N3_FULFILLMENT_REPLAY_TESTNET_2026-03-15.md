# N3 Fulfillment Replay Boundary Validation

Date: 2026-03-15T05:09:51.411Z

## Scope

This probe validates that a fulfillment signature bound to one request id cannot be replayed against a different pending request, while a correctly re-signed fulfillment for the target request still succeeds.

## Result

- Temporary Oracle: `0x8adbd00f3031beb1e84680260971f3fbe0eec4a3`
- Temporary callback consumer: `0x44a2d034731edc3dfdb89d6fce4a9eda21b0b910`
- Replay source request id: `3766`
- Replay target request tx: `0x149594ae2613d43b9db2816ff1b575e307bdb7678b358c642bc3b817112837d3`
- Replay target request id: `1`
- Replay fulfill tx: `0x20b8d0660ec37882178ba2afd909114670f0b45ec19c36595eeae5a9737decf9`
- Replay exception: `at instruction 3841 (ABORTMSG): ABORTMSG is executed. Reason: invalid verification signature`
- Correct fulfill tx: `0x792514cd275eb7401f9e58ef572cbfc7497b12e333b8a7d084cc538465f28848`
- Correct fulfill vmstate: `HALT`
- Final callback success: `true`

## Conclusion

A fulfillment signature from one request id cannot be replayed against a different pending request. The replay attempt faults with `invalid verification signature`, while a fresh signature over the target request digest fulfills successfully.
