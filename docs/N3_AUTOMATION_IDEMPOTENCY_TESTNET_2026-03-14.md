# N3 Automation Idempotency Validation
Date: 2026-03-14T09:33:52.572Z
## Scope
This probe validates that a due automation job is not sequentially queued twice when `processAutomationJobs()` is called back-to-back against the same active job state.
## Result
- Register tx: `0x8d838a0e69320e98d34fe3ad8ab58e51dfc8699c3f486437494671319e56f0be`
- Register request id: `1062`
- Automation id: `automation:neo_n3:480844c3-2c1a-4914-92d7-ca5da89c5668`
- First local tick summary: `{"queued":5,"skipped":51,"failed":0,"inspected":56}`
- Second local tick summary: `{"queued":0,"skipped":56,"failed":0,"inspected":56}`
- Expected deterministic queued request id: `automation:neo_n3:automation:neo_n3:480844c3-2c1a-4914-92d7-ca5da89c5668:1`
- Queued automation runs: `1`
- Queued request key: `automation:neo_n3:automation:neo_n3:480844c3-2c1a-4914-92d7-ca5da89c5668:1`
- Queued chain request id: `1082`
- Queued callback success: `true`
## Conclusion
Sequential duplicate queueing was not observed. The first `processAutomationJobs()` call queued one request, the second queued none, and Supabase recorded exactly one queued automation run for the target job.
