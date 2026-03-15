# N3 Automation Deposit Exhaustion Validation
Date: 2026-03-15T01:42:01.849Z
## Scope
This probe registers two due automation jobs that intentionally share the same requester fee-credit pool, then leaves only one request fee available before running a local scheduler tick.
## Result
- Shared requester hash: `0xa13e179ceef45703b25b3ed71fa039ccb0318e58`
- Request fee: `1000000`
- Credit before queue: `1000000`
- Credit after queue: `0`
- Queued runs: `1`
- Failed runs: `1`
- Queued tx: `0x5d4dc892337bdccbc98cfb6d219e756f881f6578e97fbcb6e4eb0fcec4c86c0f`
- Queued chain request id: `3613`
- Failed error: `at instruction 2827 (ABORTMSG): ABORTMSG is executed. Reason: request fee not paid`
## Conclusion
- Under a shared requester fee-credit pool with only one remaining request fee, the scheduler queued exactly one automation execution.
- The second due automation did not overrun the pool; it failed with `request fee not paid`.
- The funded queued execution still fulfilled successfully after the relayer resumed.
