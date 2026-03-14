# N3 Automation Cancellation Race Validation
Date: 2026-03-14T12:32:51.924Z
## Scope
This probe queues one due interval automation execution, marks the job cancelled before the relayer resumes, and then observes whether the already-queued request still fulfills.
## Result
- Automation id: `automation:neo_n3:b8b5e7db-5566-4d88-b8e2-fbf647d19077`
- Queued request key: `automation:neo_n3:automation:neo_n3:b8b5e7db-5566-4d88-b8e2-fbf647d19077:1`
- Queued chain request id: `2086`
- Cancelled before resume: `cancelled`
- Executed after cancel: `true`
- Resumed callback success: `true`
## Interpretation
An already-queued automation request still fulfilled after the job was marked cancelled before relayer resume. This is the currently observed cancellation-race behavior.
