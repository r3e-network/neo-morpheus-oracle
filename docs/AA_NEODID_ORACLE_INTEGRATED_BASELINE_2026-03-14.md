# AA + NeoDID + Oracle Integrated Baseline

Date: 2026-03-15T06:40:57.039Z

## Purpose

This report collects the latest standalone AA V3 testnet validation suite and the latest Morpheus testnet validation artifacts into one cross-repository baseline.
It does not claim that every cross-system attack has already been live-executed. It establishes which layers have already been proven separately before the next integrated adversarial run.

## Upstream Inputs

- AA suite: `../neo-abstract-account/sdk/docs/reports/2026-03-14-v3-testnet-validation-suite.latest.json`
- NeoDID Oracle matrix: `examples/deployments/n3-neodid-oracle-matrix.testnet.latest.json`
- Privacy matrix: `examples/deployments/n3-privacy-validation.testnet.latest.json`
- Builtins matrix: `examples/deployments/n3-builtins-validation.testnet.latest.json`
- Automation matrix: `examples/deployments/n3-automation-validation.testnet.latest.json`
- Automation idempotency probe: `examples/deployments/n3-automation-idempotency.testnet.latest.json`
- Automation cancellation-race probe: `examples/deployments/n3-automation-cancel-race.testnet.latest.json`
- Automation deposit-exhaustion probe: `examples/deployments/n3-automation-deposit-exhaustion.testnet.latest.json`
- Callback boundary probe: `examples/deployments/n3-callback-boundary.testnet.latest.json`
- NeoDID registry boundary probe: `examples/deployments/n3-neodid-registry-boundary.testnet.latest.json`
- NeoDID registry v1 probe: `examples/deployments/n3-neodid-registry-v1.testnet.latest.json`
- Encrypted ref boundary probe: `examples/deployments/n3-encrypted-ref-boundary.testnet.latest.json`
- Fulfillment replay probe: `examples/deployments/n3-fulfillment-replay.testnet.latest.json`
- AA session-key Oracle boundary probe: `examples/deployments/n3-aa-session-oracle-boundary.testnet.latest.json`
- AA callback replay boundary probe: `examples/deployments/n3-aa-callback-replay-boundary.testnet.latest.json`
- AA recovery cross-account boundary probe: `examples/deployments/n3-aa-recovery-cross-account-boundary.testnet.latest.json`
- AA paymaster automation Oracle probe: `examples/deployments/n3-aa-paymaster-automation-oracle.testnet.latest.json`

## AA Baseline

- Stages: smoke, plugin_matrix, paymaster_policy, paymaster
- Paymaster relay tx: `0xb55e8c4c02243cc3769074c89d2b0dfc16ffa6c7dfbec1a62da9cb89df86c856`
- Paymaster policy denied cases: `missingOperationHash, wrongDappId, wrongAccountId, wrongTargetContract, wrongMethod, gasTooHigh, wrongTargetChain`

## Morpheus Baseline

- NeoDID: 6/7 callback-success cases plus 1 expected failure callback case
- Privacy: 7/7 cases marked passing
- Builtins: 18 builtin requests
- Automation: register=true, queued=true, cancel=true
- Automation idempotency: first tick queued target request key `automation:neo_n3:automation:neo_n3:e166c107-7322-45c9-bc30-ed6eba35b059:1`, second tick queued `0`, chain request id=`2221`, callback success=`true`
- Automation cancel race: executed_after_cancel=`false`, queued chain request id=`3218`
- Automation deposit exhaustion: queued runs=`1`, failed runs=`1`, error=`at instruction 2827 (ABORTMSG): ABORTMSG is executed. Reason: request fee not paid`
- Callback boundary: vmstate=FAULT, tx=`0x21b997ca6a2c635fb92843c2062a7f0525a0e923d5b7f062b9a7b64767e18cd2`
- NeoDID registry JSON boundary: mismatch tx=`0xd5e4918388059efea68b2f3c874ad14e2b19ea1e0c185891779a96cc34b22656`
- NeoDID registry v1: consume tx=`0x8f26c9e4b56721b96cdff924bdc429e1fec6aa4dc494475387d5e17eb8bf0916`, replay tx=`0x3dcec34a6d0f83f814e7705c3b184c31ef846597404887d3dd7850bff85f61a4`
- Encrypted ref boundary: requester mismatch=`encrypted ref requester mismatch`, callback mismatch=`encrypted ref callback mismatch`
- Fulfillment replay: replay exception=`at instruction 3841 (ABORTMSG): ABORTMSG is executed. Reason: invalid verification signature`, fulfill vmstate=`HALT`
- AA session-key boundary: wrong target=`at instruction 515 (ABORTMSG): ABORTMSG is executed. Reason: Target contract not permitted`, wrong method=`at instruction 556 (ABORTMSG): ABORTMSG is executed. Reason: Method not permitted`
- AA callback replay boundary: replay exception=`at instruction 3841 (ABORTMSG): ABORTMSG is executed. Reason: invalid verification signature`, unlocked_a=`true`, unlocked_b=`false`
- AA recovery cross-account boundary: wrong account state=`null`, wrong account exception=`null`
- AA paymaster automation Oracle: policy=`testnet-aa`, queued mode=`scheduler`, queued request id=`3849`, callback success=`true`

## Executed Coverage

- AA V3 smoke execution
- AA verifier and hook adversarial matrix
- AA paymaster deny-path policy matrix
- AA paymaster-sponsored relay execution
- NeoDID Oracle callback binding and ticket issuance
- Privacy oracle encrypted parameter and custom function matrix
- Builtin compute catalog
- Automation register / queue / cancel flow
- Sequential automation duplicate-queue suppression under back-to-back relayer ticks
- Automation cancellation-race execution probe
- Automation shared-credit deposit exhaustion fail-closed probe
- Callback consumer direct injection rejection
- NeoDID action ticket JSON callback boundary rejection
- NeoDID compact action ticket registry consumption and replay rejection
- encrypted_params_ref requester and callback binding enforcement
- fulfillment signature request-id replay rejection
- AA session-key downstream Morpheus Oracle boundary enforcement
- AA-bound callback replay rejection with account-scoped pending context
- AA recovery ticket cross-account replay rejection
- AA paymaster-sponsored automation registration with downstream Oracle execution proof

## Remaining Integrated Gaps

- none

## Recommendation

Use this baseline as the prerequisite evidence set for the next integrated adversarial run. The next executable layer should combine a live AA account, NeoDID-backed recovery or credential state, and Morpheus callback fulfillment under negative replay and cross-account misuse scenarios.

