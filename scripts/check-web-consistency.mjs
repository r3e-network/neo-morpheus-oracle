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
  feedDefaultsText,
  workerFeedRegistryText,
  mainnetConfigText,
  oracleDocsText,
  quickstartDocsText,
  apiReferenceDocsText,
  datafeedsDocsText,
] = await Promise.all([
  read("apps/web/lib/docs-data.ts"),
  read("workers/phala-worker/src/compute/index.js"),
  read("apps/web/lib/onchain-data.ts"),
  read("apps/web/lib/feed-defaults.ts"),
  read("workers/phala-worker/src/oracle/feed-registry.js"),
  read("config/networks/mainnet.json"),
  read("apps/web/app/docs/oracle/page.tsx"),
  read("apps/web/app/docs/quickstart/page.tsx"),
  read("apps/web/app/docs/api-reference/page.tsx"),
  read("apps/web/app/docs/datafeeds/page.tsx"),
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
const requiredOnchainValues = [
  mainnetConfig.neo_n3.contracts.morpheus_oracle,
  mainnetConfig.neo_n3.contracts.morpheus_datafeed,
  mainnetConfig.neo_n3.domains.morpheus_oracle,
  mainnetConfig.neo_n3.domains.morpheus_datafeed,
];

for (const value of requiredOnchainValues) {
  assert(onchainDataText.includes(value), `apps/web/lib/onchain-data.ts is missing required mainnet value: ${value}`);
}

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
].join("\n");

for (const fragment of forbiddenFragments) {
  assert(!combinedWebDocsText.includes(fragment), `web docs still contain stale fragment: ${fragment}`);
}

console.log(JSON.stringify({
  ok: true,
  builtins_checked: workerBuiltinNames.size,
  feed_pairs_checked: frontendFeedSymbols.length,
  mainnet_values_checked: requiredOnchainValues.length,
  stale_fragments_checked: forbiddenFragments.length,
}, null, 2));
