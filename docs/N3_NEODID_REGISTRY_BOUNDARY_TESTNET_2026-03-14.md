# N3 NeoDID Registry Boundary Validation

Date: 2026-03-14T03:06:49.824Z

## Scope

This probe verifies the current boundary between Oracle-issued NeoDID action-ticket callbacks and on-chain `NeoDIDRegistry.UseActionTicket(...)` consumption.

## Validated Behaviors

- Action-ticket request tx: `0x2da01a35c0e4b60d9abca699f1e3218fbaa1d34610a55258773447193371c853`
- Request id: `195`
- Callback consumer hash: `0x8c506f224d82e67200f20d9d5361f767f0756e3b`
- Registry hash: `0x21e881f0654c555c489c92e9f5cff7c8a1a0971b`
- Wrong witness preview state: `FAULT`
- Wrong witness preview exception: `at instruction 1958 (ABORTMSG): ABORTMSG is executed. Reason: unauthorized`
- Persisted consumption tx: `0x9aee1bed7b59913284021e3f7f8dd698c0473eddf8a81fa64514cafddc38f7c8`
- Persisted vmstate: `FAULT`
- Persisted exception: `at instruction 1473 (ABORTMSG): ABORTMSG is executed. Reason: invalid verification signature`

## Conclusion

The test confirms two things:

- `NeoDIDRegistry.UseActionTicket(...)` rejects a caller that is not the declared disposable account.
- The current Oracle callback output does not yet expose a ticket-level verification signature that can be consumed directly by `UseActionTicket(...)`; using the envelope-level verification signature faults with `invalid verification signature`.

This is therefore a real integrated boundary gap rather than a purely theoretical one.
