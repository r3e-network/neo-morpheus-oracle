import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function read(relativePath) {
  return fs.readFile(path.resolve(repoRoot, relativePath), "utf8");
}

function extractBuiltinNames(sourceText) {
  return [...sourceText.matchAll(/name:\s*"([^"]+)"/g)].map((match) => match[1]);
}

function extractQuotedArrayStrings(sourceText, arrayName) {
  const blockMatch = sourceText.match(new RegExp(`(?:export\\s+)?const ${arrayName} = \\[(.*?)\\]`, "s"));
  if (!blockMatch) return [];
  return [...blockMatch[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

function extractFrontendFeedSymbols(sourceText) {
  const direct = extractQuotedArrayStrings(sourceText, "DEFAULT_FEED_SYMBOLS");
  if (direct.length > 0) return direct;

  const baseSymbols = extractQuotedArrayStrings(sourceText, "DEFAULT_FEED_BASE_SYMBOLS");
  if (baseSymbols.length === 0) return [];

  const prefixMatch = sourceText.match(/export const CANONICAL_FEED_PROVIDER_PREFIX = "([^"]+)";/);
  const prefix = prefixMatch?.[1] || "";
  return baseSymbols.map((symbol) => `${prefix}${symbol}`);
}

function normalizeFeedSymbolForComparison(symbol) {
  return String(symbol || "").replace(/^[A-Z0-9-]+:/, "");
}

function extractFeedRegistryPairs(sourceText) {
  const blockMatch = sourceText.match(/export const DEFAULT_FEED_PAIRS = \{(.*?)\n\};/s);
  if (!blockMatch) return [];
  return [...blockMatch[1].matchAll(/'([A-Z0-9-]+)':\s*\{/g)].map((match) => match[1]);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const [
  docsDataText,
  workerComputeText,
  onchainDataText,
  networksLibText,
  feedDefaultsText,
  workerFeedRegistryText,
  mainnetConfigText,
  testnetConfigText,
  oracleDocsText,
  quickstartDocsText,
  apiReferenceDocsText,
  datafeedsDocsText,
  neodidDocsText,
  docsLayoutText,
  neodidDidSpecText,
  docsIndexText,
  architectureDocsText,
  networksDocsText,
  computeDocsText,
  verifierDocsText,
  userGuideText,
  deploymentDocText,
  securityAuditText,
] = await Promise.all([
  read("apps/web/lib/docs-data.ts"),
  read("workers/phala-worker/src/compute/index.js"),
  read("apps/web/lib/onchain-data.ts"),
  read("apps/web/lib/networks.ts"),
  read("apps/web/lib/feed-defaults.ts"),
  read("workers/phala-worker/src/oracle/feed-registry.js"),
  read("config/networks/mainnet.json"),
  read("config/networks/testnet.json"),
  read("apps/web/app/docs/oracle/page.tsx"),
  read("apps/web/app/docs/quickstart/page.tsx"),
  read("apps/web/app/docs/api-reference/page.tsx"),
  read("apps/web/app/docs/datafeeds/page.tsx"),
  read("apps/web/app/docs/neodid/page.tsx"),
  read("apps/web/app/docs/layout.tsx"),
  read("docs/NEODID_DID_METHOD.md"),
  read("apps/web/app/docs/page.tsx"),
  read("apps/web/app/docs/architecture/page.tsx"),
  read("apps/web/app/docs/networks/page.tsx"),
  read("apps/web/app/docs/compute/page.tsx"),
  read("apps/web/app/docs/verifier/page.tsx"),
  read("docs/USER_GUIDE.md"),
  read("docs/DEPLOYMENT.md"),
  read("docs/SECURITY_AUDIT.md"),
]);

const frontendBuiltinNames = new Set(extractBuiltinNames(docsDataText));
const workerBuiltinNames = new Set(extractBuiltinNames(workerComputeText));

const missingBuiltinNames = [...workerBuiltinNames].filter((name) => !frontendBuiltinNames.has(name));
const extraBuiltinNames = [...frontendBuiltinNames].filter((name) => !workerBuiltinNames.has(name));

assert(missingBuiltinNames.length === 0, `frontend docs are missing builtins: ${missingBuiltinNames.join(", ")}`);
assert(extraBuiltinNames.length === 0, `frontend docs contain unknown builtins: ${extraBuiltinNames.join(", ")}`);

const frontendFeedSymbols = extractFrontendFeedSymbols(feedDefaultsText);
const workerFeedPairs = extractFeedRegistryPairs(workerFeedRegistryText);

assert(frontendFeedSymbols.length > 0, "failed to parse frontend default feed symbols");
assert(workerFeedPairs.length > 0, "failed to parse worker feed registry pairs");
assert(
  JSON.stringify(frontendFeedSymbols.map(normalizeFeedSymbolForComparison))
    === JSON.stringify(workerFeedPairs.map(normalizeFeedSymbolForComparison)),
  `frontend feed symbols do not match worker feed registry.\nfrontend=${frontendFeedSymbols.join(",")}\nworker=${workerFeedPairs.join(",")}`,
);

const mainnetConfig = JSON.parse(mainnetConfigText);
const testnetConfig = JSON.parse(testnetConfigText);

assert(
  networksLibText.includes('import testnet') && networksLibText.includes('import mainnet'),
  "apps/web/lib/networks.ts must import both testnet and mainnet registries",
);
assert(
  onchainDataText.includes("getSelectedNetwork") && onchainDataText.includes("selectedNetwork.neo_n3?.contracts?.morpheus_oracle"),
  "apps/web/lib/onchain-data.ts must resolve contracts from the selected network registry",
);
assert(
  onchainDataText.includes("selectedNetwork.neo_n3?.examples?.oracle_callback_consumer"),
  "apps/web/lib/onchain-data.ts must expose the selected-network example consumer",
);
assert(
  onchainDataText.includes("selectedNetwork.phala?.public_api_url"),
  "apps/web/lib/onchain-data.ts must expose the selected-network Phala endpoint",
);

assert(
  onchainDataText.includes("DEFAULT_FEED_SYMBOLS"),
  "apps/web/lib/onchain-data.ts should source default pairs from apps/web/lib/feed-defaults.ts",
);

const forbiddenFragments = [
  "morpheus.network/api/oracle/public-key",
  'Type of request ("provider", "url", "builtin")',
  "GetLatestPrice(",
  "Trigger feed publication",
];

const combinedWebDocsText = [
  oracleDocsText,
  quickstartDocsText,
  apiReferenceDocsText,
  datafeedsDocsText,
  neodidDocsText,
].join("\n");

const liveAddressFragments = [
  mainnetConfig.neo_n3.contracts.morpheus_oracle,
  mainnetConfig.neo_n3.contracts.morpheus_datafeed,
  testnetConfig.neo_n3.contracts.morpheus_oracle,
  testnetConfig.neo_n3.contracts.morpheus_datafeed,
].filter(Boolean);

for (const fragment of forbiddenFragments) {
  assert(!combinedWebDocsText.includes(fragment), `web docs still contain stale fragment: ${fragment}`);
}
for (const fragment of liveAddressFragments) {
  assert(!combinedWebDocsText.includes(fragment), `web docs should not hardcode live address ${fragment}; use the shared network registry`);
}

const requiredNeoDidFragments = [
  "did:morpheus:neo_n3:service:neodid",
  "/api/neodid/resolve",
  "/launchpad/neodid-resolver",
  "NeoDIDRegistry",
];

for (const fragment of requiredNeoDidFragments) {
  assert(neodidDocsText.includes(fragment), `apps/web/app/docs/neodid/page.tsx is missing required NeoDID fragment: ${fragment}`);
}

assert(
  docsLayoutText.includes("/docs/r/NEODID_DID_METHOD"),
  "apps/web/app/docs/layout.tsx must link the NeoDID DID method spec",
);
assert(
  neodidDidSpecText.includes("did:morpheus:neo_n3:service:neodid"),
  "docs/NEODID_DID_METHOD.md must include the canonical service DID",
);
assert(
  neodidDidSpecText.includes("GET /api/neodid/resolve?did=<did>"),
  "docs/NEODID_DID_METHOD.md must document the resolver endpoint",
);
assert(
  userGuideText.includes("## 5. NeoDID Usage"),
  "docs/USER_GUIDE.md must include the NeoDID usage section",
);
assert(
  userGuideText.includes("/launchpad/neodid-resolver"),
  "docs/USER_GUIDE.md must reference the NeoDID resolver entrypoint",
);
assert(
  deploymentDocText.includes("NEXT_PUBLIC_WEB3AUTH_CLIENT_ID") && deploymentDocText.includes("WEB3AUTH_CLIENT_SECRET"),
  "docs/DEPLOYMENT.md must document the required Web3Auth deployment variables",
);
assert(
  deploymentDocText.includes("NeoDIDRegistry") && deploymentDocText.includes("phala.mainnet.toml") && deploymentDocText.includes("phala.testnet.toml"),
  "docs/DEPLOYMENT.md must document NeoDID anchors and both Phala environment descriptors",
);
assert(
  securityAuditText.includes("public DID resolver") || securityAuditText.includes("DID resolver should remain metadata-only"),
  "docs/SECURITY_AUDIT.md must capture the NeoDID resolver privacy boundary",
);

const versionedDocsText = [
  docsIndexText,
  architectureDocsText,
  networksDocsText,
  oracleDocsText,
  computeDocsText,
  datafeedsDocsText,
  verifierDocsText,
  neodidDocsText,
  docsLayoutText,
].join("\n");

assert(
  !versionedDocsText.includes("v1.0.2"),
  "core docs pages still contain stale v1.0.2 version markers",
);
assert(
  versionedDocsText.includes("v1.0.3") || versionedDocsText.includes("REVISION 1.0.3"),
  "core docs pages should expose v1.0.3 version markers",
);

console.log(JSON.stringify({
  ok: true,
  builtins_checked: workerBuiltinNames.size,
  feed_pairs_checked: frontendFeedSymbols.length,
  network_registries_checked: 2,
  stale_fragments_checked: forbiddenFragments.length,
  neodid_fragments_checked: requiredNeoDidFragments.length,
  version_markers_checked: 2,
  extended_doc_checks: 5,
}, null, 2));
