# N3 NeoDID Registry V1 Ticket Validation

Date: 2026-03-14T13:22:53.278Z

## Scope

This probe verifies the compact `neo_n3_action_v1` callback path for Oracle-issued NeoDID action tickets and checks whether `NeoDIDRegistry.UseActionTicket(...)` can consume and replay-protect those compact tickets on-chain.

## Result

- Oracle request tx: `0xa488c763c511f0ed229817165d4476e28cf5695371ede9f6a0aa123608f1cd86`
- Request id: `2547`
- Registry hash: `0xf9c741aba8a07569aa77d65ab34926cf111316bd`
- Wrong witness preview exception: `at instruction 2188 (ABORTMSG): ABORTMSG is executed. Reason: unauthorized`
- Consume tx: `0x8f26c9e4b56721b96cdff924bdc429e1fec6aa4dc494475387d5e17eb8bf0916`
- Consume vmstate: `HALT`
- Replay tx: `0x3dcec34a6d0f83f814e7705c3b184c31ef846597404887d3dd7850bff85f61a4`
- Replay exception: `at instruction 2229 (ABORTMSG): ABORTMSG is executed. Reason: action nullifier already used`

## Conclusion

The compact `neo_n3_action_v1` callback path is consumable by `NeoDIDRegistry.UseActionTicket(...)`. Correct witness succeeds, wrong witness is rejected, and replay is rejected with `action nullifier already used`.
