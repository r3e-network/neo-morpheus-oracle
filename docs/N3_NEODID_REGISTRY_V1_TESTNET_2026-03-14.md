# N3 NeoDID Registry V1 Ticket Validation

Date: 2026-03-14T09:21:23.130Z

## Scope

This probe verifies the compact `neo_n3_action_v1` callback path for Oracle-issued NeoDID action tickets and checks whether `NeoDIDRegistry.UseActionTicket(...)` can consume and replay-protect those compact tickets on-chain.

## Result

- Oracle request tx: `0xfaca69d9a3b92a218b4d1d65fe66663ccffe63e9066e8466bd4aec49f5760d80`
- Request id: `991`
- Registry hash: `0xd02f8f0e82089cba3d2b69d93898f9f4d3fbd882`
- Wrong witness preview exception: `at instruction 2188 (ABORTMSG): ABORTMSG is executed. Reason: unauthorized`
- Consume tx: `0x7dc01a0e22adf164bcd3d42e8cc377936b3a6b1f8a32048c1a309f21121b4fcd`
- Consume vmstate: `HALT`
- Replay tx: `0x4b06ae010fb40a8ace188a142ce1219b83cf07d84def154e632e5cf371b91446`
- Replay exception: `at instruction 2229 (ABORTMSG): ABORTMSG is executed. Reason: action nullifier already used`

## Conclusion

The compact `neo_n3_action_v1` callback path is consumable by `NeoDIDRegistry.UseActionTicket(...)`. Correct witness succeeds, wrong witness is rejected, and replay is rejected with `action nullifier already used`.
