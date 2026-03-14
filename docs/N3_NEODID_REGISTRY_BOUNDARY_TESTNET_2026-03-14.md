# N3 NeoDID Registry Boundary Validation

Date: 2026-03-14T09:19:36.440Z

## Scope

This probe verifies the current boundary between Oracle-issued NeoDID action-ticket callbacks and on-chain `NeoDIDRegistry.UseActionTicket(...)` consumption.

## Validated Behaviors

- Action-ticket request tx: `0xa98936f886c977b5b4e25d5d065e28234ba930c2a3cd9cd7eeff2e1dfc32d93e`
- Request id: `989`
- Callback consumer hash: `0x8c506f224d82e67200f20d9d5361f767f0756e3b`
- Registry hash: `0xb44e3f5979818c7497fd978c6304fde53cc62c95`
- Wrong witness preview state: `FAULT`
- Wrong witness preview exception: `at instruction 2188 (ABORTMSG): ABORTMSG is executed. Reason: unauthorized`
- Persisted consumption tx: `0x9a66eaeb8c9dceec23da869fbcbac938acb88eada0f7204dfb951a485707b6e2`
- Persisted vmstate: `FAULT`
- Persisted exception: `at instruction 1703 (ABORTMSG): ABORTMSG is executed. Reason: invalid verification signature`

## Conclusion

The test confirms two things:

- `NeoDIDRegistry.UseActionTicket(...)` rejects a caller that is not the declared disposable account.
- The current Oracle callback output does not yet expose a ticket-level verification signature that can be consumed directly by `UseActionTicket(...)`; using the envelope-level verification signature faults with `invalid verification signature`.

This is therefore a real integrated boundary gap rather than a purely theoretical one.
