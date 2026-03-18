import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, '../../..');

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseList(value) {
  const raw = trimString(value);
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => trimString(entry))
    .filter(Boolean);
}

function parseActiveChains(value) {
  const requested = parseList(value).map((entry) => entry.toLowerCase());
  const filtered = requested.filter((entry) => entry === 'neo_n3' || entry === 'neo_x');
  return filtered.length > 0 ? filtered : ['neo_n3'];
}

let runtimeConfigCache;

function getRuntimeConfig() {
  if (runtimeConfigCache !== undefined) return runtimeConfigCache;
  const raw = trimString(process.env.MORPHEUS_RUNTIME_CONFIG_JSON || '');
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
  return '';
}

function loadJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function resolveNetworkName() {
  return env('MORPHEUS_NETWORK', 'NEXT_PUBLIC_MORPHEUS_NETWORK') || 'testnet';
}

function resolveNeoN3UpdaterWif(networkName) {
  if (networkName === 'mainnet') {
    return env(
      'MORPHEUS_RELAYER_NEO_N3_WIF',
      'MORPHEUS_UPDATER_NEO_N3_WIF',
      'NEO_N3_WIF',
      'PHALA_NEO_N3_WIF',
      'NEO_TESTNET_WIF'
    );
  }
  return env(
    'MORPHEUS_RELAYER_NEO_N3_WIF',
    'MORPHEUS_UPDATER_NEO_N3_WIF',
    'NEO_TESTNET_WIF',
    'PHALA_NEO_N3_WIF',
    'NEO_N3_WIF'
  );
}

function loadNetworkRegistry(networkName) {
  const registryPath = path.resolve(repoRoot, 'config', 'networks', `${networkName}.json`);
  return (
    loadJsonFile(registryPath) || {
      network: networkName,
      neo_n3: { contracts: {} },
      neo_x: { contracts: {} },
    }
  );
}

export function createRelayerConfig() {
  const network = resolveNetworkName();
  const registry = loadNetworkRegistry(network);
  const stateFile = path.resolve(
    repoRoot,
    env('MORPHEUS_RELAYER_STATE_FILE') || '.morpheus-relayer-state.json'
  );

  return {
    repoRoot,
    network,
    activeChains: parseActiveChains(env('MORPHEUS_ACTIVE_CHAINS') || 'neo_n3'),
    pollIntervalMs: Number(env('MORPHEUS_RELAYER_POLL_INTERVAL_MS') || 5000),
    concurrency: Math.max(Number(env('MORPHEUS_RELAYER_CONCURRENCY') || 4), 1),
    maxBlocksPerTick: Math.max(Number(env('MORPHEUS_RELAYER_MAX_BLOCKS_PER_TICK') || 250), 1),
    maxRetries: Math.max(Number(env('MORPHEUS_RELAYER_MAX_RETRIES') || 5), 0),
    retryBaseDelayMs: Math.max(Number(env('MORPHEUS_RELAYER_RETRY_BASE_DELAY_MS') || 5000), 250),
    retryMaxDelayMs: Math.max(Number(env('MORPHEUS_RELAYER_RETRY_MAX_DELAY_MS') || 300000), 1000),
    processedCacheSize: Math.max(Number(env('MORPHEUS_RELAYER_PROCESSED_CACHE_SIZE') || 5000), 100),
    deadLetterLimit: Math.max(Number(env('MORPHEUS_RELAYER_DEAD_LETTER_LIMIT') || 500), 10),
    feedSync: {
      enabled: (env('MORPHEUS_FEED_SYNC_ENABLED') || 'true').toLowerCase() !== 'false',
      intervalMs: Math.max(Number(env('MORPHEUS_FEED_SYNC_INTERVAL_MS') || 60000), 1000),
      projectSlug: env('MORPHEUS_FEED_PROJECT_SLUG') || 'demo',
      provider: env('MORPHEUS_FEED_PROVIDER'),
      providers: parseList(env('MORPHEUS_FEED_PROVIDERS')),
      symbols: parseList(env('MORPHEUS_FEED_SYMBOLS')),
      changeThresholdBps: env('MORPHEUS_FEED_CHANGE_THRESHOLD_BPS') || '10',
      minUpdateIntervalMs: env('MORPHEUS_FEED_MIN_UPDATE_INTERVAL_MS') || '60000',
    },
    automation: {
      enabled: (env('MORPHEUS_AUTOMATION_ENABLED') || 'true').toLowerCase() !== 'false',
      batchSize: Math.max(Number(env('MORPHEUS_AUTOMATION_BATCH_SIZE') || 50), 1),
      maxQueuedPerTick: Math.max(Number(env('MORPHEUS_AUTOMATION_MAX_QUEUED_PER_TICK') || 10), 1),
      pricePollPairsPerTick: Math.max(
        Number(env('MORPHEUS_AUTOMATION_PRICE_PAIRS_PER_TICK') || 25),
        1
      ),
      defaultPriceCooldownMs: Math.max(
        Number(env('MORPHEUS_AUTOMATION_DEFAULT_PRICE_COOLDOWN_MS') || 60000),
        0
      ),
    },
    logFormat: env('MORPHEUS_RELAYER_LOG_FORMAT', 'LOG_FORMAT') || 'json',
    logLevel: env('MORPHEUS_RELAYER_LOG_LEVEL', 'LOG_LEVEL') || 'info',
    confirmations: {
      neo_n3: Number(env('MORPHEUS_RELAYER_NEO_N3_CONFIRMATIONS') || 1),
      neo_x: Number(env('MORPHEUS_RELAYER_NEO_X_CONFIRMATIONS') || 1),
    },
    startRequestIds: {
      neo_n3: env('MORPHEUS_RELAYER_NEO_N3_START_REQUEST_ID')
        ? Number(env('MORPHEUS_RELAYER_NEO_N3_START_REQUEST_ID'))
        : null,
      neo_x: env('MORPHEUS_RELAYER_NEO_X_START_REQUEST_ID')
        ? Number(env('MORPHEUS_RELAYER_NEO_X_START_REQUEST_ID'))
        : null,
    },
    startBlocks: {
      neo_n3: env('MORPHEUS_RELAYER_NEO_N3_START_BLOCK')
        ? Number(env('MORPHEUS_RELAYER_NEO_N3_START_BLOCK'))
        : null,
      neo_x: env('MORPHEUS_RELAYER_NEO_X_START_BLOCK')
        ? Number(env('MORPHEUS_RELAYER_NEO_X_START_BLOCK'))
        : null,
    },
    stateFile,
    phala: {
      apiUrl: env('PHALA_API_URL'),
      token: env('PHALA_API_TOKEN', 'PHALA_SHARED_SECRET'),
      timeoutMs: Number(env('MORPHEUS_PHALA_TIMEOUT_MS') || 30000),
    },
    neo_n3: {
      scanMode:
        trimString(env('MORPHEUS_RELAYER_NEO_N3_SCAN_MODE')) ||
        (network === 'testnet' ? 'n3index_notifications' : 'block_cursor'),
      indexerUrl:
        trimString(env('MORPHEUS_RELAYER_NEO_N3_INDEXER_URL')) || 'https://api.n3index.dev/rest/v1',
      startRequestId: env('MORPHEUS_RELAYER_NEO_N3_START_REQUEST_ID')
        ? Number(env('MORPHEUS_RELAYER_NEO_N3_START_REQUEST_ID'))
        : null,
      rpcUrl: env('NEO_RPC_URL') || trimString(registry.neo_n3?.rpc_url || ''),
      networkMagic: Number(env('NEO_NETWORK_MAGIC') || registry.neo_n3?.network_magic || 894710606),
      oracleContract:
        env('CONTRACT_MORPHEUS_ORACLE_HASH') ||
        trimString(registry.neo_n3?.contracts?.morpheus_oracle || ''),
      datafeedContract:
        env('CONTRACT_MORPHEUS_DATAFEED_HASH') ||
        trimString(registry.neo_n3?.contracts?.morpheus_datafeed || ''),
      updaterWif: resolveNeoN3UpdaterWif(network),
      updaterPrivateKey: env(
        'MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY',
        'MORPHEUS_UPDATER_NEO_N3_PRIVATE_KEY',
        'PHALA_NEO_N3_PRIVATE_KEY'
      ),
    },
    neo_x: {
      rpcUrl: env('NEOX_RPC_URL', 'NEO_X_RPC_URL') || trimString(registry.neo_x?.rpc_url || ''),
      chainId: Number(
        env('NEOX_CHAIN_ID', 'NEO_X_CHAIN_ID') || registry.neo_x?.chain_id || 12227332
      ),
      oracleContract:
        env('CONTRACT_MORPHEUS_ORACLE_X_ADDRESS') ||
        trimString(registry.neo_x?.contracts?.morpheus_oracle_x || ''),
      datafeedContract:
        env('CONTRACT_MORPHEUS_DATAFEED_X_ADDRESS') ||
        trimString(registry.neo_x?.contracts?.morpheus_datafeed_x || ''),
      updaterPrivateKey: env(
        'MORPHEUS_RELAYER_NEOX_PRIVATE_KEY',
        'MORPHEUS_UPDATER_NEOX_PRIVATE_KEY',
        'PHALA_NEOX_PRIVATE_KEY'
      ),
    },
  };
}
