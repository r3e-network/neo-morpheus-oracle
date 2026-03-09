import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, "../../..");

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function loadJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function resolveNetworkName() {
  return trimString(process.env.MORPHEUS_NETWORK || process.env.NEXT_PUBLIC_MORPHEUS_NETWORK || "testnet") || "testnet";
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
    process.env.MORPHEUS_RELAYER_STATE_FILE || ".morpheus-relayer-state.json",
  );

  return {
    repoRoot,
    network,
    pollIntervalMs: Number(process.env.MORPHEUS_RELAYER_POLL_INTERVAL_MS || 5000),
    confirmations: {
      neo_n3: Number(process.env.MORPHEUS_RELAYER_NEO_N3_CONFIRMATIONS || 1),
      neo_x: Number(process.env.MORPHEUS_RELAYER_NEO_X_CONFIRMATIONS || 1),
    },
    startBlocks: {
      neo_n3: process.env.MORPHEUS_RELAYER_NEO_N3_START_BLOCK !== undefined ? Number(process.env.MORPHEUS_RELAYER_NEO_N3_START_BLOCK) : null,
      neo_x: process.env.MORPHEUS_RELAYER_NEO_X_START_BLOCK !== undefined ? Number(process.env.MORPHEUS_RELAYER_NEO_X_START_BLOCK) : null,
    },
    stateFile,
    phala: {
      apiUrl: trimString(process.env.PHALA_API_URL || ""),
      token: trimString(process.env.PHALA_API_TOKEN || process.env.PHALA_SHARED_SECRET || ""),
    },
    neo_n3: {
      rpcUrl: trimString(process.env.NEO_RPC_URL || registry.neo_n3?.rpc_url || ""),
      networkMagic: Number(process.env.NEO_NETWORK_MAGIC || registry.neo_n3?.network_magic || 894710606),
      oracleContract: trimString(process.env.CONTRACT_MORPHEUS_ORACLE_HASH || registry.neo_n3?.contracts?.morpheus_oracle || ""),
      updaterWif: trimString(process.env.MORPHEUS_RELAYER_NEO_N3_WIF || process.env.MORPHEUS_UPDATER_NEO_N3_WIF || process.env.PHALA_NEO_N3_WIF || process.env.NEO_TESTNET_WIF || ""),
      updaterPrivateKey: trimString(process.env.MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY || process.env.MORPHEUS_UPDATER_NEO_N3_PRIVATE_KEY || process.env.PHALA_NEO_N3_PRIVATE_KEY || ""),
    },
    neo_x: {
      rpcUrl: trimString(process.env.NEOX_RPC_URL || process.env.NEO_X_RPC_URL || registry.neo_x?.rpc_url || ""),
      chainId: Number(process.env.NEOX_CHAIN_ID || process.env.NEO_X_CHAIN_ID || registry.neo_x?.chain_id || 12227332),
      oracleContract: trimString(process.env.CONTRACT_MORPHEUS_ORACLE_X_ADDRESS || registry.neo_x?.contracts?.morpheus_oracle_x || ""),
      updaterPrivateKey: trimString(process.env.MORPHEUS_RELAYER_NEOX_PRIVATE_KEY || process.env.MORPHEUS_UPDATER_NEOX_PRIVATE_KEY || process.env.PHALA_NEOX_PRIVATE_KEY || ""),
    },
  };
}
