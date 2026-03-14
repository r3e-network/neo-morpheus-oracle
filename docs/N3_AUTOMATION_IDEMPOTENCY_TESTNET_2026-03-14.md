# N3 Automation Idempotency Validation
Date: 2026-03-14T12:45:33.299Z
## Scope
This probe validates that a due automation job is not sequentially queued twice when `processAutomationJobs()` is called back-to-back against the same active job state.
## Result
- Register tx: `0x3cdbbea3f7f91320f368f54f532b6ff9d7bf54fff04b1531cc37d998d1d514ba`
- Register request id: `2157`
- Automation id: `automation:neo_n3:e166c107-7322-45c9-bc30-ed6eba35b059`
- First local tick summary: `{"queued":42,"skipped":46,"failed":0,"inspected":88}`
- Second local tick summary: `{"queued":30,"skipped":59,"failed":0,"inspected":89}`
- Expected deterministic queued request id: `automation:neo_n3:automation:neo_n3:e166c107-7322-45c9-bc30-ed6eba35b059:1`
- Queued automation runs: `1`
- Queued request key: `automation:neo_n3:automation:neo_n3:e166c107-7322-45c9-bc30-ed6eba35b059:1`
- Queued chain request id: `2221`
- Queued callback success: `true`
## Conclusion
Sequential duplicate queueing was not observed. The first `processAutomationJobs()` call queued one request, the second queued none, and Supabase recorded exactly one queued automation run for the target job.
