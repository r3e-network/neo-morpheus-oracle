import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, "../../..");

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

let runtimeConfigCache;

function getRuntimeConfig() {
  if (runtimeConfigCache !== undefined) return runtimeConfigCache;
  const raw = trimString(process.env.MORPHEUS_RUNTIME_CONFIG_JSON || "");
  if (!raw) {
    runtimeConfigCache = {};
    return runtimeConfigCache;
  }
  try {
    runtimeConfigCache = JSON.parse(raw);
  } catch {
    runtimeConfigCache = {};
  }
  return runtimeConfigCache;
}

function env(...names) {
  const runtimeConfig = getRuntimeConfig();
  for (const name of names) {
    const direct = trimString(process.env[name]);
    if (direct) return direct;
    const packed = runtimeConfig[name];
    if (packed !== undefined && packed !== null && `${packed}`.trim()) {
      return `${packed}`.trim();
    }
  }
  return "";
}

function loadJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function resolveNetworkName() {
  return env("MORPHEUS_NETWORK", "NEXT_PUBLIC_MORPHEUS_NETWORK") || "testnet";
}

function loadNetworkRegistry(networkName) {
  const registryPath = path.resolve(repoRoot, "config", "networks", `${networkName}.json`);
  return loadJsonFile(registryPath) || { network: networkName, neo_n3: { contracts: {} }, neo_x: { contracts: {} } };
}

export function createRelayerConfig() {
  const network = resolveNetworkName();
  const registry = loadNetworkRegistry(network);
  const stateFile = path.resolve(
    repoRoot,
    env("MORPHEUS_RELAYER_STATE_FILE") || ".morpheus-relayer-state.json",
  );

  return {
    repoRoot,
    network,
    pollIntervalMs: Number(env("MORPHEUS_RELAYER_POLL_INTERVAL_MS") || 5000),
    concurrency: Math.max(Number(env("MORPHEUS_RELAYER_CONCURRENCY") || 4), 1),
    maxBlocksPerTick: Math.max(Number(env("MORPHEUS_RELAYER_MAX_BLOCKS_PER_TICK") || 250), 1),
    maxRetries: Math.max(Number(env("MORPHEUS_RELAYER_MAX_RETRIES") || 5), 0),
    retryBaseDelayMs: Math.max(Number(env("MORPHEUS_RELAYER_RETRY_BASE_DELAY_MS") || 5000), 250),
    retryMaxDelayMs: Math.max(Number(env("MORPHEUS_RELAYER_RETRY_MAX_DELAY_MS") || 300000), 1000),
    processedCacheSize: Math.max(Number(env("MORPHEUS_RELAYER_PROCESSED_CACHE_SIZE") || 5000), 100),
    deadLetterLimit: Math.max(Number(env("MORPHEUS_RELAYER_DEAD_LETTER_LIMIT") || 500), 10),
    logFormat: env("MORPHEUS_RELAYER_LOG_FORMAT", "LOG_FORMAT") || "json",
    logLevel: env("MORPHEUS_RELAYER_LOG_LEVEL", "LOG_LEVEL") || "info",
    confirmations: {
      neo_n3: Number(env("MORPHEUS_RELAYER_NEO_N3_CONFIRMATIONS") || 1),
      neo_x: Number(env("MORPHEUS_RELAYER_NEO_X_CONFIRMATIONS") || 1),
    },
    startBlocks: {
      neo_n3: env("MORPHEUS_RELAYER_NEO_N3_START_BLOCK") ? Number(env("MORPHEUS_RELAYER_NEO_N3_START_BLOCK")) : null,
      neo_x: env("MORPHEUS_RELAYER_NEO_X_START_BLOCK") ? Number(env("MORPHEUS_RELAYER_NEO_X_START_BLOCK")) : null,
    },
    stateFile,
    phala: {
      apiUrl: env("PHALA_API_URL"),
      token: env("PHALA_API_TOKEN", "PHALA_SHARED_SECRET"),
    },
    neo_n3: {
      rpcUrl: env("NEO_RPC_URL") || trimString(registry.neo_n3?.rpc_url || ""),
      networkMagic: Number(env("NEO_NETWORK_MAGIC") || registry.neo_n3?.network_magic || 894710606),
      oracleContract: env("CONTRACT_MORPHEUS_ORACLE_HASH") || trimString(registry.neo_n3?.contracts?.morpheus_oracle || ""),
      updaterWif: env("MORPHEUS_RELAYER_NEO_N3_WIF", "MORPHEUS_UPDATER_NEO_N3_WIF", "PHALA_NEO_N3_WIF", "NEO_TESTNET_WIF"),
      updaterPrivateKey: env("MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY", "MORPHEUS_UPDATER_NEO_N3_PRIVATE_KEY", "PHALA_NEO_N3_PRIVATE_KEY"),
    },
    neo_x: {
      rpcUrl: env("NEOX_RPC_URL", "NEO_X_RPC_URL") || trimString(registry.neo_x?.rpc_url || ""),
      chainId: Number(env("NEOX_CHAIN_ID", "NEO_X_CHAIN_ID") || registry.neo_x?.chain_id || 12227332),
      oracleContract: env("CONTRACT_MORPHEUS_ORACLE_X_ADDRESS") || trimString(registry.neo_x?.contracts?.morpheus_oracle_x || ""),
      updaterPrivateKey: env("MORPHEUS_RELAYER_NEOX_PRIVATE_KEY", "MORPHEUS_UPDATER_NEOX_PRIVATE_KEY", "PHALA_NEOX_PRIVATE_KEY"),
    },
  };
}
