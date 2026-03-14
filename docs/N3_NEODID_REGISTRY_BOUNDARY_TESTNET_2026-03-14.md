# N3 NeoDID Registry Boundary Validation

Date: 2026-03-14T12:49:16.215Z

## Scope

This probe verifies the current boundary between Oracle-issued NeoDID action-ticket callbacks and on-chain `NeoDIDRegistry.UseActionTicket(...)` consumption.

## Validated Behaviors

- Action-ticket request tx: `0xc1154a054a229dc8d17ccf1cb7d0090ababdf47d244b8e22d2aac828919dc700`
- Request id: `2271`
- Callback consumer hash: `0x8c506f224d82e67200f20d9d5361f767f0756e3b`
- Registry hash: `0x848d71cae70fdcb98b380bbeb74ec56584a5a536`
- Wrong witness preview state: `FAULT`
- Wrong witness preview exception: `at instruction 2188 (ABORTMSG): ABORTMSG is executed. Reason: unauthorized`
- Persisted consumption tx: `0xd5e4918388059efea68b2f3c874ad14e2b19ea1e0c185891779a96cc34b22656`
- Persisted vmstate: `FAULT`
- Persisted exception: `at instruction 1703 (ABORTMSG): ABORTMSG is executed. Reason: invalid verification signature`

## Conclusion

The test confirms two things:

- `NeoDIDRegistry.UseActionTicket(...)` rejects a caller that is not the declared disposable account.
- The current Oracle callback output does not yet expose a ticket-level verification signature that can be consumed directly by `UseActionTicket(...)`; using the envelope-level verification signature faults with `invalid verification signature`.

This is therefore a real integrated boundary gap rather than a purely theoretical one.
