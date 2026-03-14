# N3 Automation Idempotency Validation
Date: 2026-03-14T07:06:53.930Z
## Scope
This probe validates that a due automation job is not sequentially queued twice when `processAutomationJobs()` is called back-to-back against the same active job state.
## Result
- Register tx: `0x3689289b56123678524867cba68f75a078b450b9bd2839e92054671a71f7c803`
- Register request id: `324`
- Automation id: `automation:neo_n3:c82e9ead-b4c7-4b24-8c19-931aad9b3d0a`
- First local tick summary: `{"queued":11,"skipped":28,"failed":0,"inspected":39}`
- Second local tick summary: `{"queued":0,"skipped":39,"failed":0,"inspected":39}`
- Expected deterministic queued request id: `automation:neo_n3:automation:neo_n3:c82e9ead-b4c7-4b24-8c19-931aad9b3d0a:1`
- Queued automation runs: `1`
- Queued request key: `automation:neo_n3:automation:neo_n3:c82e9ead-b4c7-4b24-8c19-931aad9b3d0a:1`
- Queued chain request id: `335`
- Queued callback success: `true`
## Conclusion
Sequential duplicate queueing was not observed. The first `processAutomationJobs()` call queued one request, the second queued none, and Supabase recorded exactly one queued automation run for the target job.
