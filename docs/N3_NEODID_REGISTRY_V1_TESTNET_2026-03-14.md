# N3 NeoDID Registry V1 Ticket Validation

Date: 2026-03-14T03:35:16.991Z

## Scope

This probe verifies the compact `neo_n3_action_v1` callback path for Oracle-issued NeoDID action tickets and checks whether `NeoDIDRegistry.UseActionTicket(...)` can consume and replay-protect those compact tickets on-chain.

## Result

- Oracle request tx: `0x77fc0bad1a20cea8b4c21491edbf794682417dfea2a9f02f82595a2432c2130a`
- Request id: `197`
- Registry hash: `0x893d92aef78ddc2fe184551274139aacffd40814`
- Wrong witness preview exception: `at instruction 2188 (ABORTMSG): ABORTMSG is executed. Reason: unauthorized`
- Consume tx: `0x30733c4e7b3479550f027e2ae3f5b1d1f188022c36ffb70674531fcb567c31f1`
- Consume vmstate: `HALT`
- Replay tx: `0x81d3a3d07b3e335cc3cf23d8f0fa6eea92cf40b8350239ef17a7857a0a6910bc`
- Replay exception: `at instruction 2229 (ABORTMSG): ABORTMSG is executed. Reason: action nullifier already used`

## Conclusion

The compact `neo_n3_action_v1` callback path is consumable by `NeoDIDRegistry.UseActionTicket(...)`. Correct witness succeeds, wrong witness is rejected, and replay is rejected with `action nullifier already used`.
