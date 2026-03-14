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
};

const aaSuite = readJson(inputs.aaSuite);
const neodid = readJson(inputs.morpheusNeodid);
const privacy = readJson(inputs.morpheusPrivacy);
const builtins = readJson(inputs.morpheusBuiltins);
const automation = readJson(inputs.morpheusAutomation);

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
  ],
  remaining_integrated_gaps: [
    "Cross-account NeoDID recovery ticket misuse against a live AA recovery verifier",
    "Replay of a valid Morpheus callback envelope into a different AA-bound consumer context",
    "encrypted_params_ref ownership and replay abuse across AA-triggered Morpheus actions",
    "AA session-key restrictions combined with downstream Morpheus Oracle or Compute calls",
    "AA-aware automation billing races and duplicate-callback protection under sponsored execution",
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
