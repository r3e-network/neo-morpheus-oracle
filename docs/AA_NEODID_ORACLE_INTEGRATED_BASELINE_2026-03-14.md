# AA + NeoDID + Oracle Integrated Baseline

Date: 2026-03-14T12:02:48.486Z

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
- Callback boundary probe: `examples/deployments/n3-callback-boundary.testnet.latest.json`
- NeoDID registry boundary probe: `examples/deployments/n3-neodid-registry-boundary.testnet.latest.json`
- NeoDID registry v1 probe: `examples/deployments/n3-neodid-registry-v1.testnet.latest.json`
- Encrypted ref boundary probe: `examples/deployments/n3-encrypted-ref-boundary.testnet.latest.json`
- Fulfillment replay probe: `examples/deployments/n3-fulfillment-replay.testnet.latest.json`
- AA session-key Oracle boundary probe: `examples/deployments/n3-aa-session-oracle-boundary.testnet.latest.json`
- AA recovery cross-account boundary probe: `examples/deployments/n3-aa-recovery-cross-account-boundary.testnet.latest.json`

## AA Baseline

- Stages: smoke, plugin_matrix, paymaster_policy, paymaster
- Paymaster relay tx: `0xb55e8c4c02243cc3769074c89d2b0dfc16ffa6c7dfbec1a62da9cb89df86c856`
- Paymaster policy denied cases: `missingOperationHash, wrongDappId, wrongAccountId, wrongTargetContract, wrongMethod, gasTooHigh, wrongTargetChain`

## Morpheus Baseline

- NeoDID: 6/7 callback-success cases plus 1 expected failure callback case
- Privacy: 7/7 cases marked passing
- Builtins: 18 builtin requests
- Automation: register=true, queued=true, cancel=true
- Automation idempotency: first tick queued target request key `automation:neo_n3:automation:neo_n3:b68af1d0-e4e9-4606-8322-c8a84332f7f8:1`, second tick queued `0`, chain request id=`1575`, callback success=`true`
- Automation cancel race: executed_after_cancel=`true`, queued chain request id=`1543`
- Callback boundary: vmstate=FAULT, tx=`0xa3b4abff609bf04a2fc3aa2fa2c2b2aaac0588f20c9405d039451cd69d7aa8d9`
- NeoDID registry JSON boundary: mismatch tx=`0x009bb282a4480634770d883ea2d0556915db7ea3ece8fa92fb68fea4baaafc76`
- NeoDID registry v1: consume tx=`0x22dad8e300ae75f117fa6c9fed4abd16ecd8c081b66a5247a6eeb865832d697b`, replay tx=`0x17d046b479cb784e3f42569194d2c49e33a9ed21a5d06740e87ee6e102b42c7d`
- Encrypted ref boundary: requester mismatch=`encrypted ref requester mismatch`, callback mismatch=`encrypted ref callback mismatch`
- Fulfillment replay: replay exception=`at instruction 3841 (ABORTMSG): ABORTMSG is executed. Reason: invalid verification signature`, fulfill vmstate=`HALT`
- AA session-key boundary: wrong target=`at instruction 515 (ABORTMSG): ABORTMSG is executed. Reason: Target contract not permitted`, wrong method=`at instruction 556 (ABORTMSG): ABORTMSG is executed. Reason: Method not permitted`
- AA recovery cross-account boundary: wrong account state=`null`, wrong account exception=`null`

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
- Callback consumer direct injection rejection
- NeoDID action ticket JSON callback boundary rejection
- NeoDID compact action ticket registry consumption and replay rejection
- encrypted_params_ref requester and callback binding enforcement
- fulfillment signature request-id replay rejection
- AA session-key downstream Morpheus Oracle boundary enforcement
- AA recovery ticket cross-account replay rejection

## Remaining Integrated Gaps

- Automation cancellation race still allows an already-queued execution to fulfill once after cancellation
- AA-aware automation billing under sponsored execution

## Recommendation

Use this baseline as the prerequisite evidence set for the next integrated adversarial run. The next executable layer should combine a live AA account, NeoDID-backed recovery or credential state, and Morpheus callback fulfillment under negative replay and cross-account misuse scenarios.

