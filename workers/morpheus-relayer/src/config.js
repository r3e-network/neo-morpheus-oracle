import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NEO_N3_SIGNER_ENV_KEYS,
  normalizeMorpheusNetwork,
  resolvePinnedNeoN3Role,
} from './lib/neo-signers.js';
import { trimString } from '@neo-morpheus-oracle/shared/utils';

const DEFAULT_PHALA_TIMEOUT_MS = 30000;
const DEFAULT_NEO_N3_RPC_URLS = {
  mainnet: [
    'http://seed1.neo.org:10332',
    'http://seed2.neo.org:10332',
    'http://seed3.neo.org:10332',
    'http://seed4.neo.org:10332',
    'http://seed5.neo.org:10332',
  ],
  testnet: [],
};
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, '../../..');

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
  const filtered = requested.filter((entry) => entry === 'neo_n3');
  return filtered.length > 0 ? filtered : ['neo_n3'];
}

function parseUrlList(value) {
  return String(value || '')
    .split(',')
    .map((entry) => trimString(entry).replace(/\/$/, ''))
    .filter(Boolean);
}

function uniqueOrdered(values) {
  return [...new Set(values.filter(Boolean))];
}

function resolveNeoN3RpcUrls(network, registry) {
  return uniqueOrdered([
    ...parseUrlList(env('NEO_RPC_URLS')),
    ...parseUrlList(env('NEO_RPC_URL')),
    ...parseUrlList(registry.neo_n3?.rpc_urls || []),
    trimString(registry.neo_n3?.rpc_url || ''),
    ...(DEFAULT_NEO_N3_RPC_URLS[network] || []),
  ]);
}

function parseBoolean(value, fallback = false) {
  const raw = trimString(value).toLowerCase();
  if (!raw) return fallback;
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true;
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
  return fallback;
}

function resolveRelayerMode(value) {
  const normalized = trimString(value).toLowerCase();
  if (normalized === 'feed_only' || normalized === 'requests_only') return normalized;
  return 'combined';
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

function envNetworkScoped(network, genericKey) {
  const suffix = network === 'mainnet' ? 'MAINNET' : 'TESTNET';
  return env(`${genericKey}_${suffix}`) || env(genericKey);
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

function resolvePublicRuntimeCandidates(network, registry) {
  return uniqueOrdered([
    trimString(registry.phala?.public_api_url || ''),
    `https://oracle.meshmini.app/${network}`,
    `https://edge.meshmini.app/${network}`,
  ]);
}

function resolvePhalaApiUrls(network, registry) {
  const explicit = uniqueOrdered(
    parseUrlList(
      env(
        `MORPHEUS_${network.toUpperCase()}_RUNTIME_URL`,
        'MORPHEUS_RUNTIME_URL',
        `MORPHEUS_${network.toUpperCase()}_PHALA_API_URL`,
        'PHALA_API_URL'
      )
    )
  );
  const publicFallbacks = resolvePublicRuntimeCandidates(network, registry);
  const combined = uniqueOrdered([...explicit, ...publicFallbacks]);
  return combined.join(',');
}

function snapshotSignerEnv() {
  const snapshot = {};
  for (const key of NEO_N3_SIGNER_ENV_KEYS) {
    const value = env(key);
    if (value) snapshot[key] = value;
  }
  return snapshot;
}

function loadNetworkRegistry(networkName) {
  const registryPath = path.resolve(repoRoot, 'config', 'networks', `${networkName}.json`);
  return (
    loadJsonFile(registryPath) || {
      network: networkName,
      neo_n3: { contracts: {} },
    }
  );
}

export function createRelayerConfig() {
  const network = normalizeMorpheusNetwork(resolveNetworkName());
  const registry = loadNetworkRegistry(network);
  const neoN3RpcUrls = resolveNeoN3RpcUrls(network, registry);
  const mode = resolveRelayerMode(env('MORPHEUS_RELAYER_MODE') || 'combined');
  const useDerivedKeys = parseBoolean(env('PHALA_USE_DERIVED_KEYS'), false);
  const hasSupabaseUrl = Boolean(
    env('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'morpheus_SUPABASE_URL')
  );
  const hasSupabaseKey = Boolean(
    env(
      'SUPABASE_SECRET_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'morpheus_SUPABASE_SECRET_KEY',
      'morpheus_SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_SERVICE_KEY'
    )
  );
  const durableQueueEnabled = parseBoolean(
    env('MORPHEUS_DURABLE_QUEUE_ENABLED'),
    hasSupabaseUrl && hasSupabaseKey
  );
  const stateFile = path.resolve(
    repoRoot,
    env('MORPHEUS_RELAYER_STATE_FILE') ||
      (mode === 'combined'
        ? '.morpheus-relayer-state.json'
        : `.morpheus-relayer-state.${mode}.json`)
  );
  const updaterSigner = resolvePinnedNeoN3Role(network, 'updater', {
    env: snapshotSignerEnv(),
  });

  return {
    repoRoot,
    network,
    mode,
    useDerivedKeys,
    instanceId:
      trimString(env('MORPHEUS_RELAYER_INSTANCE_ID')) ||
      `${mode}:${network}:${trimString(os.hostname() || 'host')}:${process.pid}`,
    activeChains: parseActiveChains(env('MORPHEUS_ACTIVE_CHAINS') || 'neo_n3'),
    pollIntervalMs: Number(env('MORPHEUS_RELAYER_POLL_INTERVAL_MS') || 5000),
    concurrency: Math.max(Number(env('MORPHEUS_RELAYER_CONCURRENCY') || 4), 1),
    maxBlocksPerTick: Math.max(Number(env('MORPHEUS_RELAYER_MAX_BLOCKS_PER_TICK') || 250), 1),
    maxRetries: Math.max(Number(env('MORPHEUS_RELAYER_MAX_RETRIES') || 5), 0),
    retryBaseDelayMs: Math.max(Number(env('MORPHEUS_RELAYER_RETRY_BASE_DELAY_MS') || 5000), 250),
    retryMaxDelayMs: Math.max(Number(env('MORPHEUS_RELAYER_RETRY_MAX_DELAY_MS') || 300000), 1000),
    processedCacheSize: Math.max(Number(env('MORPHEUS_RELAYER_PROCESSED_CACHE_SIZE') || 5000), 100),
    deadLetterLimit: Math.max(Number(env('MORPHEUS_RELAYER_DEAD_LETTER_LIMIT') || 500), 10),
    durableQueue: {
      enabled: durableQueueEnabled,
      failClosed: parseBoolean(env('MORPHEUS_DURABLE_QUEUE_FAIL_CLOSED'), durableQueueEnabled),
      syncLimit: Math.max(Number(env('MORPHEUS_DURABLE_QUEUE_SYNC_LIMIT') || 200), 1),
      staleProcessingMs: Math.max(
        Number(env('MORPHEUS_DURABLE_QUEUE_STALE_PROCESSING_MS') || 45000),
        1000
      ),
    },
    backpressure: {
      maxFreshEventsPerTick: Math.max(
        Number(env('MORPHEUS_RELAYER_MAX_FRESH_EVENTS_PER_TICK') || 32),
        1
      ),
      maxRetryEventsPerTick: Math.max(
        Number(env('MORPHEUS_RELAYER_MAX_RETRY_EVENTS_PER_TICK') || 16),
        1
      ),
      deferDelayMs: Math.max(Number(env('MORPHEUS_RELAYER_DEFER_DELAY_MS') || 5000), 250),
    },
    feedSync: {
      enabled: (env('MORPHEUS_FEED_SYNC_ENABLED') || 'true').toLowerCase() !== 'false',
      intervalMs: Math.max(Number(env('MORPHEUS_FEED_SYNC_INTERVAL_MS') || 60000), 1000),
      timeoutMs: Math.max(Number(env('MORPHEUS_FEED_SYNC_TIMEOUT_MS') || 120000), 1000),
      projectSlug: env('MORPHEUS_FEED_PROJECT_SLUG') || 'morpheus',
      provider: env('MORPHEUS_FEED_PROVIDER'),
      providers: parseList(env('MORPHEUS_FEED_PROVIDERS')),
      symbols: parseList(env('MORPHEUS_FEED_SYMBOLS')),
      changeThresholdBps: env('MORPHEUS_FEED_CHANGE_THRESHOLD_BPS') || '10',
      minUpdateIntervalMs: env('MORPHEUS_FEED_MIN_UPDATE_INTERVAL_MS') || '60000',
      staleAfterMs: env('MORPHEUS_FEED_STALE_AFTER_MS') || '300000',
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
    },
    startRequestIds: {
      neo_n3: env('MORPHEUS_RELAYER_NEO_N3_START_REQUEST_ID')
        ? Number(env('MORPHEUS_RELAYER_NEO_N3_START_REQUEST_ID'))
        : null,
    },
    startBlocks: {
      neo_n3: env('MORPHEUS_RELAYER_NEO_N3_START_BLOCK')
        ? Number(env('MORPHEUS_RELAYER_NEO_N3_START_BLOCK'))
        : null,
    },
    stateFile,
    phala: {
      apiUrl: resolvePhalaApiUrls(network, registry),
      token: env('MORPHEUS_RUNTIME_TOKEN', 'PHALA_API_TOKEN', 'PHALA_SHARED_SECRET'),
      timeoutMs: Number(env('MORPHEUS_PHALA_TIMEOUT_MS') || DEFAULT_PHALA_TIMEOUT_MS),
      useDerivedKeys,
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
      rpcUrl: neoN3RpcUrls[0] || '',
      rpcUrls: neoN3RpcUrls,
      networkMagic: Number(env('NEO_NETWORK_MAGIC') || registry.neo_n3?.network_magic || 894710606),
      oracleContract:
        envNetworkScoped(network, 'CONTRACT_MORPHEUS_ORACLE_HASH') ||
        trimString(registry.neo_n3?.contracts?.morpheus_oracle || ''),
      datafeedContract:
        envNetworkScoped(network, 'CONTRACT_MORPHEUS_DATAFEED_HASH') ||
        trimString(registry.neo_n3?.contracts?.morpheus_datafeed || ''),
      updaterWif: updaterSigner.materialized?.wif || '',
      updaterPrivateKey: updaterSigner.materialized?.private_key || '',
    },
    metricsServer: {
      host: env('MORPHEUS_RELAYER_METRICS_HOST') || '127.0.0.1',
      port: Math.max(Number(env('MORPHEUS_RELAYER_METRICS_PORT') || 9464), 1),
      path: env('MORPHEUS_RELAYER_METRICS_PATH') || '/metrics',
    },
  };
}
