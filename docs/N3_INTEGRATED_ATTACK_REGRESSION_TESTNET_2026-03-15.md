# N3 Integrated Attack Regression

Date: 2026-03-15T05:19:19.218Z

## Scope

This runner tracks the currently executable Neo N3 integrated attack regression set across Morpheus Oracle, NeoDID, and the AA verifier baseline.

## Configuration

- network: `testnet`
- dry_run: `false`
- continue_on_failure: `true`
- AA suite mode: `referenced_latest`

## Stage Results

- aa_v3_suite: `referenced_latest`
  report: `../neo-abstract-account/sdk/docs/reports/2026-03-14-v3-testnet-validation-suite.latest.json`
  summary: `{"stage_ids":["smoke","plugin_matrix","paymaster_policy","paymaster"],"paymaster_policy_denied_cases":["missingOperationHash","wrongDappId","wrongAccountId","wrongTargetContract","wrongMethod","gasTooHigh","wrongTargetChain"],"paymaster_txid":"0xb55e8c4c02243cc3769074c89d2b0dfc16ffa6c7dfbec1a62da9cb89df86c856","paymaster_approval_digest":"775bf2ff09499b96c33546317416f1ba052a777f0bda9ed6e8a99b1df06a62cb"}`
- callback_boundary: `passed`
  report: `examples/deployments/n3-callback-boundary.testnet.latest.json`
  summary: `{"txid":"0x20218931cd9eaaf0ebf94086ee3973e436d5e3efc7cd6f1e3d76ad7d3ac870db","vmstate":"FAULT","exception":"at instruction 966 (ABORTMSG): ABORTMSG is executed. Reason: unauthorized caller"}`
- neodid_registry_boundary: `referenced_latest`
  report: `examples/deployments/n3-neodid-registry-boundary.testnet.latest.json`
  summary: `{"registry_hash":"0x848d71cae70fdcb98b380bbeb74ec56584a5a536","wrong_witness_exception":"at instruction 2188 (ABORTMSG): ABORTMSG is executed. Reason: unauthorized","mismatch_exception":"at instruction 1703 (ABORTMSG): ABORTMSG is executed. Reason: invalid verification signature"}`
- neodid_registry_v1: `referenced_latest`
  report: `examples/deployments/n3-neodid-registry-v1.testnet.latest.json`
  summary: `{"registry_hash":"0xf9c741aba8a07569aa77d65ab34926cf111316bd","consume_txid":"0x8f26c9e4b56721b96cdff924bdc429e1fec6aa4dc494475387d5e17eb8bf0916","replay_exception":"at instruction 2229 (ABORTMSG): ABORTMSG is executed. Reason: action nullifier already used"}`
- encrypted_ref_boundary: `passed`
  report: `examples/deployments/n3-encrypted-ref-boundary.testnet.latest.json`
  summary: `{"matching_success":true,"wrong_requester_error":"encrypted ref requester mismatch","wrong_callback_error":"encrypted ref callback mismatch","replay_error":"encrypted ref already consumed by another request"}`
- fulfillment_replay: `passed`
  report: `examples/deployments/n3-fulfillment-replay.testnet.latest.json`
  summary: `{"replay_exception":"at instruction 3841 (ABORTMSG): ABORTMSG is executed. Reason: invalid verification signature","fulfill_vmstate":"HALT","fulfill_txid":"0x792514cd275eb7401f9e58ef572cbfc7497b12e333b8a7d084cc538465f28848"}`
- aa_session_oracle_boundary: `passed`
  report: `examples/deployments/n3-aa-session-oracle-boundary.testnet.latest.json`
  summary: `{"execute_txid":"0x6d66a38baf45ee4ffdcbdd0806c1a073641433c62e18b9a9022fafd4378f9f30","request_id":"3816","wrong_target_exception":"at instruction 515 (ABORTMSG): ABORTMSG is executed. Reason: Target contract not permitted","wrong_method_exception":"at instruction 556 (ABORTMSG): ABORTMSG is executed. Reason: Method not permitted"}`
- aa_callback_replay_boundary: `referenced_latest`
  report: `examples/deployments/n3-aa-callback-replay-boundary.testnet.latest.json`
  summary: `{"replay_txid":"0xe0011eacc573754f163100e9b399602eadff7b7c5dd941d5dbfe319891ef6b8b","replay_exception":"at instruction 3841 (ABORTMSG): ABORTMSG is executed. Reason: invalid verification signature","unlocked_a":true,"unlocked_b":false}`
- aa_recovery_cross_account_boundary: `referenced_latest`
  report: `examples/deployments/n3-aa-recovery-cross-account-boundary.testnet.latest.json`
  summary: `{"recovery_verifier_hash":"0x9e08c858774b7eb2844810247b61812d44604424","recovery_request_id":null,"wrong_account_state":null,"wrong_account_exception":null}`
- aa_paymaster_automation_oracle: `passed`
  report: `examples/deployments/n3-aa-paymaster-automation-oracle.testnet.latest.json`
  summary: `{"paymaster_policy_id":"testnet-aa","paymaster_approved":true,"relay_txid":"0xca9da7a67d9cfe2b4ffd1a6fc33c4a86af1281b54d602b5e2e491441ec065dcf","automation_id":"automation:neo_n3:f9e92160-c7f4-4dff-9b51-7b1003a61867","queued_mode":"manual_direct_queue","queued_chain_request_id":"3822","queued_callback_success":true}`
- automation_cancel_race: `referenced_latest`
  report: `examples/deployments/n3-automation-cancel-race.testnet.latest.json`
  summary: `{"automation_id":null,"queued_chain_request_id":"3218","executed_after_cancel":false}`
- automation_deposit_exhaustion: `referenced_latest`
  report: `examples/deployments/n3-automation-deposit-exhaustion.testnet.latest.json`
  summary: `{"shared_requester_hash":"0xa13e179ceef45703b25b3ed71fa039ccb0318e58","queued_runs":1,"failed_runs":1,"queued_chain_request_id":"3613","failed_error":"at instruction 2827 (ABORTMSG): ABORTMSG is executed. Reason: request fee not paid"}`
- automation_idempotency: `referenced_latest`
  report: `examples/deployments/n3-automation-idempotency.testnet.latest.json`
  summary: `{"automation_id":"automation:neo_n3:e166c107-7322-45c9-bc30-ed6eba35b059","queued_request_key":"automation:neo_n3:automation:neo_n3:e166c107-7322-45c9-bc30-ed6eba35b059:1","queued_chain_request_id":"2221","queued_callback_success":true,"execution_count":1,"queued_runs":1,"failed_runs":0}`

## Remaining Integrated Gaps

- none

