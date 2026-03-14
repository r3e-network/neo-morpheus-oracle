# N3 Automation Cancellation Race Validation
Date: 2026-03-14T18:26:17.824Z
## Scope
This probe queues one due interval automation execution, marks the job cancelled before the relayer resumes, and then observes whether the already-queued request still fulfills.
## Result
- Automation id: `automation:neo_n3:02b15cb5-4296-4f64-bcaf-e343cbbeea87`
- Queued request key: `automation:neo_n3:automation:neo_n3:02b15cb5-4296-4f64-bcaf-e343cbbeea87:1`
- Queued chain request id: `3218`
- Cancelled before resume: `cancelled`
- Executed after cancel: `false`
- Resumed callback success: `false`
- Resumed callback error: `automation cancelled before execution: automation:neo_n3:02b15cb5-4296-4f64-bcaf-e343cbbeea87`
## Interpretation
The queued automation request did not fulfill after cancellation. The system failed closed for this race window.
