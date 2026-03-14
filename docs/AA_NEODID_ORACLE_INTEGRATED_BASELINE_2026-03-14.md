# AA + NeoDID + Oracle Integrated Baseline

Date: 2026-03-14T04:06:37.303Z

## Purpose

This report collects the latest standalone AA V3 testnet validation suite and the latest Morpheus testnet validation artifacts into one cross-repository baseline.
It does not claim that every cross-system attack has already been live-executed. It establishes which layers have already been proven separately before the next integrated adversarial run.

## Upstream Inputs

- AA suite: `../neo-abstract-account/sdk/docs/reports/2026-03-14-v3-testnet-validation-suite.latest.json`
- NeoDID Oracle matrix: `examples/deployments/n3-neodid-oracle-matrix.testnet.latest.json`
- Privacy matrix: `examples/deployments/n3-privacy-validation.testnet.latest.json`
- Builtins matrix: `examples/deployments/n3-builtins-validation.testnet.latest.json`
- Automation matrix: `examples/deployments/n3-automation-validation.testnet.latest.json`
- Callback boundary probe: `examples/deployments/n3-callback-boundary.testnet.latest.json`
- NeoDID registry boundary probe: `examples/deployments/n3-neodid-registry-boundary.testnet.latest.json`
- NeoDID registry v1 probe: `examples/deployments/n3-neodid-registry-v1.testnet.latest.json`
- Encrypted ref boundary probe: `examples/deployments/n3-encrypted-ref-boundary.testnet.latest.json`

## AA Baseline

- Stages: smoke, plugin_matrix, paymaster_policy, paymaster
- Paymaster relay tx: `0xb55e8c4c02243cc3769074c89d2b0dfc16ffa6c7dfbec1a62da9cb89df86c856`
- Paymaster policy denied cases: `missingOperationHash, wrongDappId, wrongAccountId, wrongTargetContract, wrongMethod, gasTooHigh, wrongTargetChain`

## Morpheus Baseline

- NeoDID: 6/7 callback-success cases plus 1 expected failure callback case
- Privacy: 7/7 cases marked passing
- Builtins: 18 builtin requests
- Automation: register=true, queued=true, cancel=true
- Callback boundary: vmstate=FAULT, tx=`0xbf7fc0deae1e4d026f3e12c73baeb706cb88ca8769419d42cce544412ba5559d`
- NeoDID registry JSON boundary: mismatch tx=`0x9aee1bed7b59913284021e3f7f8dd698c0473eddf8a81fa64514cafddc38f7c8`
- NeoDID registry v1: consume tx=`0x30733c4e7b3479550f027e2ae3f5b1d1f188022c36ffb70674531fcb567c31f1`, replay tx=`0x81d3a3d07b3e335cc3cf23d8f0fa6eea92cf40b8350239ef17a7857a0a6910bc`
- Encrypted ref boundary: requester mismatch=`encrypted ref requester mismatch`, callback mismatch=`encrypted ref callback mismatch`

## Executed Coverage

- AA V3 smoke execution
- AA verifier and hook adversarial matrix
- AA paymaster deny-path policy matrix
- AA paymaster-sponsored relay execution
- NeoDID Oracle callback binding and ticket issuance
- Privacy oracle encrypted parameter and custom function matrix
- Builtin compute catalog
- Automation register / queue / cancel flow
- Callback consumer direct injection rejection
- NeoDID action ticket JSON callback boundary rejection
- NeoDID compact action ticket registry consumption and replay rejection
- encrypted_params_ref requester and callback binding enforcement

## Remaining Integrated Gaps

- Cross-account NeoDID recovery ticket misuse against a live AA recovery verifier
- Replay of a valid Morpheus callback envelope into a different AA-bound consumer context
- AA session-key restrictions combined with downstream Morpheus Oracle or Compute calls
- AA-aware automation billing races and duplicate-callback protection under sponsored execution

## Recommendation

Use this baseline as the prerequisite evidence set for the next integrated adversarial run. The next executable layer should combine a live AA account, NeoDID-backed recovery or credential state, and Morpheus callback fulfillment under negative replay and cross-account misuse scenarios.

