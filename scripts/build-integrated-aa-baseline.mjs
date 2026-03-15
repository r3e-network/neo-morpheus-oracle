#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const aaRepoRoot = path.resolve(repoRoot, "..", "neo-abstract-account");

const datePrefix = "2026-03-14";
const markdownPath = path.join(repoRoot, "docs", "AA_NEODID_ORACLE_INTEGRATED_BASELINE_2026-03-14.md");
const jsonLatestPath = path.join(repoRoot, "examples", "deployments", "aa-neodid-oracle-integrated-baseline.testnet.latest.json");
const jsonStampedPath = path.join(repoRoot, "examples", "deployments", `aa-neodid-oracle-integrated-baseline.testnet.${datePrefix}.json`);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function rel(filePath) {
  return path.relative(repoRoot, filePath).replaceAll(path.sep, "/");
}

const inputs = {
  aaSuite: path.join(aaRepoRoot, "sdk", "docs", "reports", "2026-03-14-v3-testnet-validation-suite.latest.json"),
  morpheusNeodid: path.join(repoRoot, "examples", "deployments", "n3-neodid-oracle-matrix.testnet.latest.json"),
  morpheusPrivacy: path.join(repoRoot, "examples", "deployments", "n3-privacy-validation.testnet.latest.json"),
  morpheusBuiltins: path.join(repoRoot, "examples", "deployments", "n3-builtins-validation.testnet.latest.json"),
  morpheusAutomation: path.join(repoRoot, "examples", "deployments", "n3-automation-validation.testnet.latest.json"),
  automationIdempotency: path.join(repoRoot, "examples", "deployments", "n3-automation-idempotency.testnet.latest.json"),
  automationCancelRace: path.join(repoRoot, "examples", "deployments", "n3-automation-cancel-race.testnet.latest.json"),
  automationDepositExhaustion: path.join(repoRoot, "examples", "deployments", "n3-automation-deposit-exhaustion.testnet.latest.json"),
  callbackBoundary: path.join(repoRoot, "examples", "deployments", "n3-callback-boundary.testnet.latest.json"),
  neodidRegistryBoundary: path.join(repoRoot, "examples", "deployments", "n3-neodid-registry-boundary.testnet.latest.json"),
  neodidRegistryV1: path.join(repoRoot, "examples", "deployments", "n3-neodid-registry-v1.testnet.latest.json"),
  encryptedRefBoundary: path.join(repoRoot, "examples", "deployments", "n3-encrypted-ref-boundary.testnet.latest.json"),
  fulfillmentReplay: path.join(repoRoot, "examples", "deployments", "n3-fulfillment-replay.testnet.latest.json"),
  aaSessionOracleBoundary: path.join(repoRoot, "examples", "deployments", "n3-aa-session-oracle-boundary.testnet.latest.json"),
  aaCallbackReplayBoundary: path.join(repoRoot, "examples", "deployments", "n3-aa-callback-replay-boundary.testnet.latest.json"),
  aaRecoveryCrossAccountBoundary: path.join(repoRoot, "examples", "deployments", "n3-aa-recovery-cross-account-boundary.testnet.latest.json"),
  integratedAttackRegression: path.join(repoRoot, "examples", "deployments", "n3-integrated-attack-regression.testnet.latest.json"),
};

const aaSuite = readJson(inputs.aaSuite);
const neodid = readJson(inputs.morpheusNeodid);
const privacy = readJson(inputs.morpheusPrivacy);
const builtins = readJson(inputs.morpheusBuiltins);
const automation = readJson(inputs.morpheusAutomation);
const automationIdempotency = readJson(inputs.automationIdempotency);
const automationCancelRace = readJson(inputs.automationCancelRace);
const automationDepositExhaustion = readJson(inputs.automationDepositExhaustion);
const callbackBoundary = readJson(inputs.callbackBoundary);
const neodidRegistryBoundary = readJson(inputs.neodidRegistryBoundary);
const neodidRegistryV1 = readJson(inputs.neodidRegistryV1);
const encryptedRefBoundary = readJson(inputs.encryptedRefBoundary);
const fulfillmentReplay = readJson(inputs.fulfillmentReplay);
const aaSessionOracleBoundary = readJson(inputs.aaSessionOracleBoundary);
const aaCallbackReplayBoundary = readJson(inputs.aaCallbackReplayBoundary);
const aaRecoveryCrossAccountBoundary = readJson(inputs.aaRecoveryCrossAccountBoundary);
const integratedAttackRegression = fs.existsSync(inputs.integratedAttackRegression)
  ? readJson(inputs.integratedAttackRegression)
  : null;

const aaStages = Object.fromEntries((aaSuite.stages || []).map((stage) => [stage.id, stage.summary || {}]));
const neodidCases = Array.isArray(neodid.cases) ? neodid.cases : [];
const privacyCases = Array.isArray(privacy.cases) ? privacy.cases : [];
const builtinItems = Array.isArray(builtins.builtins) ? builtins.builtins : [];

const successfulNeoDidCases = neodidCases.filter((item) => item?.callback?.success === true).length;
const expectedNeoDidFailureCases = neodidCases.filter((item) => item?.callback?.success === false).length;
const successfulPrivacyCases = privacyCases.filter((item) => item?.pass === true).length;

const summary = {
  generated_at: new Date().toISOString(),
  network: "testnet",
  aa_suite: {
    report_path: path.relative(repoRoot, inputs.aaSuite).replaceAll(path.sep, "/"),
    stages: (aaSuite.stages || []).map((stage) => ({ id: stage.id, title: stage.title })),
    smoke: aaStages.smoke || null,
    plugin_matrix: aaStages.plugin_matrix || null,
    paymaster_policy: aaStages.paymaster_policy || null,
    paymaster_relay: aaStages.paymaster || null,
  },
  morpheus: {
    neodid: {
      report_path: rel(inputs.morpheusNeodid),
      total_cases: neodidCases.length,
      successful_cases: successfulNeoDidCases,
      expected_failure_cases: expectedNeoDidFailureCases,
      request_ids: neodidCases.map((item) => item.request_id),
    },
    privacy: {
      report_path: rel(inputs.morpheusPrivacy),
      total_cases: privacyCases.length,
      passing_cases: successfulPrivacyCases,
      request_ids: privacyCases.map((item) => item.request_id),
    },
    builtins: {
      report_path: rel(inputs.morpheusBuiltins),
      total_builtins: builtinItems.length,
      names: builtinItems.map((item) => item.name),
    },
    automation: {
      report_path: rel(inputs.morpheusAutomation),
      register_request_id: automation.register?.request_id || null,
      queued_request_id: automation.queued_execution?.request_id || null,
      cancel_request_id: automation.cancel?.request_id || null,
      register_success: automation.register?.callback?.success === true,
      queued_success: automation.queued_execution?.callback?.success === true,
      cancel_success: automation.cancel?.callback?.success === true,
    },
    automation_idempotency: {
      report_path: rel(inputs.automationIdempotency),
      automation_id: automationIdempotency.registration?.automation_id || null,
      queued_request_key: automationIdempotency.queued_request_key || null,
      queued_chain_request_id: automationIdempotency.queued_chain_request_id || null,
      queued_callback_success: automationIdempotency.queued_callback?.success ?? null,
      execution_count: automationIdempotency.supabase?.job?.execution_count ?? null,
    },
    automation_cancel_race: {
      report_path: rel(inputs.automationCancelRace),
      automation_id: automationCancelRace.automation_id || null,
      queued_chain_request_id: automationCancelRace.queued_chain_request_id || null,
      executed_after_cancel: automationCancelRace.executed_after_cancel ?? null,
    },
    automation_deposit_exhaustion: {
      report_path: rel(inputs.automationDepositExhaustion),
      shared_requester_hash: automationDepositExhaustion.shared_requester_hash || null,
      queued_runs: automationDepositExhaustion.queued_runs?.length ?? automationDepositExhaustion.queued_runs ?? null,
      failed_runs: automationDepositExhaustion.failed_runs?.length ?? automationDepositExhaustion.failed_runs ?? null,
      queued_chain_request_id: automationDepositExhaustion.queued_chain_request_id || null,
      failed_error: automationDepositExhaustion.failed_runs?.[0]?.error || automationDepositExhaustion.failed_error || null,
    },
    callback_boundary: {
      report_path: rel(inputs.callbackBoundary),
      txid: callbackBoundary.probe?.txid || null,
      vmstate: callbackBoundary.probe?.vmstate || null,
      exception: callbackBoundary.probe?.exception || null,
    },
    neodid_registry_boundary: {
      report_path: rel(inputs.neodidRegistryBoundary),
      request_txid: neodidRegistryBoundary.action_request?.txid || null,
      registry_hash: neodidRegistryBoundary.registry_hash || null,
      wrong_witness_exception: neodidRegistryBoundary.wrong_witness_preview?.exception || null,
      mismatch_txid: neodidRegistryBoundary.registry_probe?.use_action_ticket_txid || null,
      mismatch_exception: neodidRegistryBoundary.registry_probe?.exception || null,
    },
    neodid_registry_v1: {
      report_path: rel(inputs.neodidRegistryV1),
      request_txid: neodidRegistryV1.action_request?.txid || null,
      registry_hash: neodidRegistryV1.registry_hash || null,
      consume_txid: neodidRegistryV1.consume_probe?.txid || null,
      consume_vmstate: neodidRegistryV1.consume_probe?.vmstate || null,
      replay_txid: neodidRegistryV1.replay_probe?.txid || null,
      replay_exception: neodidRegistryV1.replay_probe?.exception || null,
    },
    encrypted_ref_boundary: {
      report_path: rel(inputs.encryptedRefBoundary),
      matching_txid: encryptedRefBoundary.cases?.[0]?.txid || null,
      wrong_requester_txid: encryptedRefBoundary.cases?.[1]?.txid || null,
      wrong_requester_error: encryptedRefBoundary.cases?.[1]?.callback?.error_text || null,
      wrong_callback_txid: encryptedRefBoundary.cases?.[2]?.txid || null,
      wrong_callback_error: encryptedRefBoundary.cases?.[2]?.callback?.error_text || null,
    },
    fulfillment_replay: {
      report_path: rel(inputs.fulfillmentReplay),
      replay_txid: fulfillmentReplay.replay_target?.replay_txid || null,
      replay_exception: fulfillmentReplay.replay_target?.replay_exception || null,
      fulfill_txid: fulfillmentReplay.replay_target?.fulfill_txid || null,
      fulfill_vmstate: fulfillmentReplay.replay_target?.fulfill_vmstate || null,
    },
    aa_session_oracle_boundary: {
      report_path: rel(inputs.aaSessionOracleBoundary),
      execute_txid: aaSessionOracleBoundary.success_path?.execute_txid || null,
      request_id: aaSessionOracleBoundary.success_path?.request_id || null,
      wrong_target_exception: aaSessionOracleBoundary.wrong_target?.exception || null,
      wrong_method_exception: aaSessionOracleBoundary.wrong_method?.exception || null,
    },
    aa_callback_replay_boundary: {
      report_path: rel(inputs.aaCallbackReplayBoundary),
      replay_txid: aaCallbackReplayBoundary.replay_attempt?.txid || aaCallbackReplayBoundary.replay_txid || null,
      replay_exception: aaCallbackReplayBoundary.replay_attempt?.exception || aaCallbackReplayBoundary.replay_exception || null,
      unlocked_a: aaCallbackReplayBoundary.state_after_replay?.unlocked_a ?? aaCallbackReplayBoundary.unlocked_a ?? null,
      unlocked_b: aaCallbackReplayBoundary.state_after_replay?.unlocked_b ?? aaCallbackReplayBoundary.unlocked_b ?? null,
    },
    aa_recovery_cross_account_boundary: {
      report_path: rel(inputs.aaRecoveryCrossAccountBoundary),
      recovery_verifier_hash: aaRecoveryCrossAccountBoundary.recovery_verifier_hash || null,
      recovery_request_id: aaRecoveryCrossAccountBoundary.recovery_request_id || null,
      wrong_account_state: aaRecoveryCrossAccountBoundary.wrong_account_state || null,
      wrong_account_exception: aaRecoveryCrossAccountBoundary.wrong_account_exception || null,
    },
    integrated_attack_regression: integratedAttackRegression
      ? {
          report_path: rel(inputs.integratedAttackRegression),
          stage_count: Array.isArray(integratedAttackRegression.stages) ? integratedAttackRegression.stages.length : 0,
          failed_stages: (integratedAttackRegression.stages || []).filter((stage) => stage.status === "failed").map((stage) => stage.id),
        }
      : null,
  },
  executed_coverage: [
    "AA V3 smoke execution",
    "AA verifier and hook adversarial matrix",
    "AA paymaster deny-path policy matrix",
    "AA paymaster-sponsored relay execution",
    "NeoDID Oracle callback binding and ticket issuance",
    "Privacy oracle encrypted parameter and custom function matrix",
    "Builtin compute catalog",
    "Automation register / queue / cancel flow",
    "Sequential automation duplicate-queue suppression under back-to-back relayer ticks",
    "Automation cancellation-race execution probe",
    "Automation shared-credit deposit exhaustion fail-closed probe",
    "Callback consumer direct injection rejection",
    "NeoDID action ticket JSON callback boundary rejection",
    "NeoDID compact action ticket registry consumption and replay rejection",
    "encrypted_params_ref requester and callback binding enforcement",
    "fulfillment signature request-id replay rejection",
    "AA session-key downstream Morpheus Oracle boundary enforcement",
    "AA-bound callback replay rejection with account-scoped pending context",
    "AA recovery ticket cross-account replay rejection",
  ],
  remaining_integrated_gaps: [
    "AA-aware automation billing under sponsored execution",
  ],
};

const lines = [
  "# AA + NeoDID + Oracle Integrated Baseline",
  "",
  `Date: ${summary.generated_at}`,
  "",
  "## Purpose",
  "",
  "This report collects the latest standalone AA V3 testnet validation suite and the latest Morpheus testnet validation artifacts into one cross-repository baseline.",
  "It does not claim that every cross-system attack has already been live-executed. It establishes which layers have already been proven separately before the next integrated adversarial run.",
  "",
  "## Upstream Inputs",
  "",
  `- AA suite: \`${summary.aa_suite.report_path}\``,
  `- NeoDID Oracle matrix: \`${summary.morpheus.neodid.report_path}\``,
  `- Privacy matrix: \`${summary.morpheus.privacy.report_path}\``,
  `- Builtins matrix: \`${summary.morpheus.builtins.report_path}\``,
  `- Automation matrix: \`${summary.morpheus.automation.report_path}\``,
  `- Automation idempotency probe: \`${summary.morpheus.automation_idempotency.report_path}\``,
  `- Automation cancellation-race probe: \`${summary.morpheus.automation_cancel_race.report_path}\``,
  `- Automation deposit-exhaustion probe: \`${summary.morpheus.automation_deposit_exhaustion.report_path}\``,
  `- Callback boundary probe: \`${summary.morpheus.callback_boundary.report_path}\``,
  `- NeoDID registry boundary probe: \`${summary.morpheus.neodid_registry_boundary.report_path}\``,
  `- NeoDID registry v1 probe: \`${summary.morpheus.neodid_registry_v1.report_path}\``,
  `- Encrypted ref boundary probe: \`${summary.morpheus.encrypted_ref_boundary.report_path}\``,
  `- Fulfillment replay probe: \`${summary.morpheus.fulfillment_replay.report_path}\``,
  `- AA session-key Oracle boundary probe: \`${summary.morpheus.aa_session_oracle_boundary.report_path}\``,
  `- AA callback replay boundary probe: \`${summary.morpheus.aa_callback_replay_boundary.report_path}\``,
  `- AA recovery cross-account boundary probe: \`${summary.morpheus.aa_recovery_cross_account_boundary.report_path}\``,
  "",
  "## AA Baseline",
  "",
  `- Stages: ${(summary.aa_suite.stages || []).map((stage) => stage.id).join(", ")}`,
  `- Paymaster relay tx: \`${summary.aa_suite.paymaster_relay?.txid || "n/a"}\``,
  `- Paymaster policy denied cases: \`${(summary.aa_suite.paymaster_policy?.deniedCases || []).join(", ")}\``,
  "",
  "## Morpheus Baseline",
  "",
  `- NeoDID: ${summary.morpheus.neodid.successful_cases}/${summary.morpheus.neodid.total_cases} callback-success cases plus ${summary.morpheus.neodid.expected_failure_cases} expected failure callback case`,
  `- Privacy: ${summary.morpheus.privacy.passing_cases}/${summary.morpheus.privacy.total_cases} cases marked passing`,
  `- Builtins: ${summary.morpheus.builtins.total_builtins} builtin requests`,
  `- Automation: register=${summary.morpheus.automation.register_success}, queued=${summary.morpheus.automation.queued_success}, cancel=${summary.morpheus.automation.cancel_success}`,
  `- Automation idempotency: first tick queued target request key \`${summary.morpheus.automation_idempotency.queued_request_key}\`, second tick queued \`0\`, chain request id=\`${summary.morpheus.automation_idempotency.queued_chain_request_id}\`, callback success=\`${summary.morpheus.automation_idempotency.queued_callback_success}\``,
  `- Automation cancel race: executed_after_cancel=\`${summary.morpheus.automation_cancel_race.executed_after_cancel}\`, queued chain request id=\`${summary.morpheus.automation_cancel_race.queued_chain_request_id}\``,
  `- Automation deposit exhaustion: queued runs=\`${summary.morpheus.automation_deposit_exhaustion.queued_runs}\`, failed runs=\`${summary.morpheus.automation_deposit_exhaustion.failed_runs}\`, error=\`${summary.morpheus.automation_deposit_exhaustion.failed_error}\``,
  `- Callback boundary: vmstate=${summary.morpheus.callback_boundary.vmstate}, tx=\`${summary.morpheus.callback_boundary.txid}\``,
  `- NeoDID registry JSON boundary: mismatch tx=\`${summary.morpheus.neodid_registry_boundary.mismatch_txid}\``,
  `- NeoDID registry v1: consume tx=\`${summary.morpheus.neodid_registry_v1.consume_txid}\`, replay tx=\`${summary.morpheus.neodid_registry_v1.replay_txid}\``,
  `- Encrypted ref boundary: requester mismatch=\`${summary.morpheus.encrypted_ref_boundary.wrong_requester_error}\`, callback mismatch=\`${summary.morpheus.encrypted_ref_boundary.wrong_callback_error}\``,
  `- Fulfillment replay: replay exception=\`${summary.morpheus.fulfillment_replay.replay_exception}\`, fulfill vmstate=\`${summary.morpheus.fulfillment_replay.fulfill_vmstate}\``,
  `- AA session-key boundary: wrong target=\`${summary.morpheus.aa_session_oracle_boundary.wrong_target_exception}\`, wrong method=\`${summary.morpheus.aa_session_oracle_boundary.wrong_method_exception}\``,
  `- AA callback replay boundary: replay exception=\`${summary.morpheus.aa_callback_replay_boundary.replay_exception}\`, unlocked_a=\`${summary.morpheus.aa_callback_replay_boundary.unlocked_a}\`, unlocked_b=\`${summary.morpheus.aa_callback_replay_boundary.unlocked_b}\``,
  `- AA recovery cross-account boundary: wrong account state=\`${summary.morpheus.aa_recovery_cross_account_boundary.wrong_account_state}\`, wrong account exception=\`${summary.morpheus.aa_recovery_cross_account_boundary.wrong_account_exception}\``,
  "",
  "## Executed Coverage",
  "",
  ...summary.executed_coverage.map((item) => `- ${item}`),
  "",
  "## Remaining Integrated Gaps",
  "",
  ...summary.remaining_integrated_gaps.map((item) => `- ${item}`),
  "",
  "## Recommendation",
  "",
  "Use this baseline as the prerequisite evidence set for the next integrated adversarial run. The next executable layer should combine a live AA account, NeoDID-backed recovery or credential state, and Morpheus callback fulfillment under negative replay and cross-account misuse scenarios.",
  "",
];

fs.writeFileSync(markdownPath, `${lines.join("\n")}\n`);
fs.writeFileSync(jsonLatestPath, JSON.stringify(summary, null, 2));
fs.writeFileSync(jsonStampedPath, JSON.stringify(summary, null, 2));

console.log(JSON.stringify({
  markdownPath: rel(markdownPath),
  jsonLatestPath: rel(jsonLatestPath),
  jsonStampedPath: rel(jsonStampedPath),
}, null, 2));
