# N3 Automation Cancellation Race Validation
Date: 2026-03-14T10:05:03.325Z
## Scope
This probe queues one due interval automation execution, marks the job cancelled before the relayer resumes, and then observes whether the already-queued request still fulfills.
## Result
- Automation id: `automation:neo_n3:624ab0e0-6b0e-4ff1-9390-ebb60a6f9728`
- Queued request key: `automation:neo_n3:automation:neo_n3:624ab0e0-6b0e-4ff1-9390-ebb60a6f9728:1`
- Queued chain request id: `1212`
- Cancelled before resume: `cancelled`
- Executed after cancel: `true`
- Resumed callback success: `true`
## Interpretation
An already-queued automation request still fulfilled after the job was marked cancelled before relayer resume. This is the currently observed cancellation-race behavior.
