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

const DEFAULT_NITRO_TIMEOUT_MS = 10_000;
const MAX_REQUEST_TIMEOUT_MS = 10_000;
const MAX_FEED_SYNC_TIMEOUT_MS = 30_000;
// Sanity ceiling for the retry backoff cap — generous enough that operators can
// slow poison-item retries to minutes, while still bounding accidental
// misconfiguration (the default cap stays at 10s).
const MAX_RETRY_MAX_DELAY_MS = 600_000;
const DEFAULT_NEO_N3_RPC_URLS = {
  mainnet: [
    'http://seed1.neo.org:10332',
    'http://seed2.neo.org:10332',
    'http://seed3.neo.org:10332',
    'https://api.n3index.dev/mainnet',
    'https://mainnet1.neo.coz.io:443',
    'https://mainnet2.neo.coz.io:443',
  ],
  testnet: [
    'http://seed3.neo.org:20332',
    'http://seed4.neo.org:20332',
    'http://seed5.neo.org:20332',
    'https://api.n3index.dev/testnet',
    'https://testnet1.neo.coz.io:443',
  ],
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

const SUPPORTED_CHAINS = ['neo_n3', 'neox'];

function parseActiveChains(value) {
  const requested = parseList(value).map((entry) => entry.toLowerCase());
  const filtered = requested.filter((entry) => SUPPORTED_CHAINS.includes(entry));
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

function rpcUrlRank(value) {
  const normalized = trimString(value).toLowerCase();
  if (/^https?:\/\/seed\d+\.neo\.org(?::|\/|$)/.test(normalized)) return 0;
  if (normalized.includes('neo.org')) return 1;
  if (normalized.startsWith('https://')) return 2;
  return 3;
}

function uniqueRankedRpcUrls(values) {
  return uniqueOrdered(values).sort((left, right) => rpcUrlRank(left) - rpcUrlRank(right));
}

function resolveNeoN3RpcUrls(network, registry) {
  const scopedRpcUrls =
    network === 'mainnet'
      ? parseUrlList(
          env(
            'NEO_MAINNET_RPC_URLS',
            'MAINNET_RPC_URLS',
            'NEO_RPC_URLS_MAINNET',
            'NEO_MAINNET_RPC_URL',
            'MAINNET_RPC_URL',
            'NEO_RPC_MAINNET'
          )
        )
      : parseUrlList(
          env(
            'NEO_TESTNET_RPC_URLS',
            'TESTNET_RPC_URLS',
            'NEO_RPC_URLS_TESTNET',
            'NEO_TESTNET_RPC_URL',
            'TESTNET_RPC_URL',
            'NEO_RPC_TESTNET'
          )
        );
  const genericRpcUrls = parseUrlList(env('NEO_RPC_URLS', 'NEO_RPC_URL'));
  return uniqueRankedRpcUrls([
    ...scopedRpcUrls,
    ...parseUrlList(registry.neo_n3?.rpc_urls || []),
    trimString(registry.neo_n3?.rpc_url || ''),
    ...(parseBoolean(env('ALLOW_GENERIC_NEO_RPC_URL'), false) ? genericRpcUrls : []),
    ...(DEFAULT_NEO_N3_RPC_URLS[network] || []),
  ]);
}

function resolveNeoN3NetworkMagic(network, registry) {
  const scopedMagic =
    network === 'mainnet'
      ? env('NEO_MAINNET_MAGIC', 'MAINNET_NETWORK_MAGIC')
      : env('NEO_TESTNET_MAGIC', 'TESTNET_NETWORK_MAGIC');
  const genericMagic = parseBoolean(env('ALLOW_GENERIC_NEO_NETWORK_MAGIC'), false)
    ? env('NEO_NETWORK_MAGIC')
    : '';
  return Number(
    scopedMagic ||
      registry.neo_n3?.network_magic ||
      genericMagic ||
      (network === 'mainnet' ? 860833102 : 894710606)
  );
}

function parseBoolean(value, fallback = false) {
  const raw = trimString(value).toLowerCase();
  if (!raw) return fallback;
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true;
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
  return fallback;
}

function parseIntegerString(value, fallback) {
  const raw = trimString(value);
  if (!/^[0-9]+$/.test(raw)) return fallback;
  return raw;
}

function resolveRelayerMode(value) {
  const normalized = trimString(value).toLowerCase();
  if (normalized === 'feed_only' || normalized === 'requests_only') return normalized;
  return 'combined';
}

let runtimeConfigCache;
let runtimeConfigCacheRaw;

function getRuntimeConfig() {
  const raw = trimString(process.env.MORPHEUS_RUNTIME_CONFIG_JSON || '');
  if (runtimeConfigCache !== undefined && raw === runtimeConfigCacheRaw) return runtimeConfigCache;
  runtimeConfigCacheRaw = raw;
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
  }
  for (const name of names) {
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
  // Prefer the `nitro` registry key; fall back to the legacy `phala` key so a
  // live box whose deployed registry has not yet been redeployed still resolves.
  const runtimeRegistry = registry.nitro ?? registry.phala;
  return uniqueOrdered([
    trimString(runtimeRegistry?.public_api_url || ''),
    `https://oracle.meshmini.app/${network}`,
    `https://edge.meshmini.app/${network}`,
  ]);
}

function resolveNitroApiUrls(network, registry) {
  const explicit = uniqueOrdered(
    parseUrlList(
      env(
        `MORPHEUS_${network.toUpperCase()}_RUNTIME_URL`,
        'MORPHEUS_RUNTIME_URL',
        `MORPHEUS_${network.toUpperCase()}_NITRO_API_URL`,
        `MORPHEUS_${network.toUpperCase()}_PHALA_API_URL`,
        'NITRO_API_URL',
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
  const useDerivedKeys = parseBoolean(
    env('NITRO_USE_DERIVED_KEYS', 'PHALA_USE_DERIVED_KEYS'),
    false
  );
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
  const activeChains = parseActiveChains(env('MORPHEUS_ACTIVE_CHAINS') || 'neo_n3');
  const maxRetries = Math.max(Number(env('MORPHEUS_RELAYER_MAX_RETRIES') || 5), 0);
  // Neo N3 updater signer material is only required when Neo N3 is an active
  // chain — a neox-only (or feed-only / derived-key) relayer must not demand it.
  const updaterSigner =
    mode === 'feed_only' || useDerivedKeys || !activeChains.includes('neo_n3')
      ? { materialized: null }
      : resolvePinnedNeoN3Role(network, 'updater', {
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
    activeChains,
    pollIntervalMs: Number(env('MORPHEUS_RELAYER_POLL_INTERVAL_MS') || 5000),
    concurrency: Math.max(Number(env('MORPHEUS_RELAYER_CONCURRENCY') || 4), 1),
    maxBlocksPerTick: Math.max(Number(env('MORPHEUS_RELAYER_MAX_BLOCKS_PER_TICK') || 250), 1),
    maxRetries,
    // Ceiling on callback-delivery / failure-finalize redelivery attempts; once a
    // prepared fulfillment exceeds it the request is dead-lettered for manual
    // replay instead of retrying forever.
    maxCallbackRetries: Math.max(
      Number(env('MORPHEUS_RELAYER_MAX_CALLBACK_RETRIES') || maxRetries * 2),
      1
    ),
    retryBaseDelayMs: Math.max(Number(env('MORPHEUS_RELAYER_RETRY_BASE_DELAY_MS') || 5000), 250),
    retryMaxDelayMs: Math.min(
      Math.max(Number(env('MORPHEUS_RELAYER_RETRY_MAX_DELAY_MS') || 10_000), 1000),
      MAX_RETRY_MAX_DELAY_MS
    ),
    // Minimum interval between local state-file writes; bursts of persistState
    // calls inside one processEvent coalesce into a single trailing write. 0
    // restores write-on-every-call.
    statePersistMinIntervalMs: Math.max(
      Number(env('MORPHEUS_RELAYER_STATE_PERSIST_MIN_INTERVAL_MS') || 250),
      0
    ),
    processedCacheSize: Math.max(Number(env('MORPHEUS_RELAYER_PROCESSED_CACHE_SIZE') || 5000), 100),
    deadLetterLimit: Math.max(Number(env('MORPHEUS_RELAYER_DEAD_LETTER_LIMIT') || 500), 10),
    // Ceiling on the in-memory retry queue per chain. A sustained ingestion burst
    // combined with a downstream failure can grow the retry queue unboundedly (and
    // the whole array is re-serialized on every persist). When set, the oldest
    // retry items beyond the limit are shed into the dead-letter lane (recoverable
    // via manual replay) and counted. Defaults to 0 = no ceiling, so the live box
    // behaves identically until the operator sets the variable.
    retryQueueLimit: Math.max(Number(env('MORPHEUS_RELAYER_RETRY_QUEUE_LIMIT') || 0), 0),
    durableQueue: {
      enabled: durableQueueEnabled,
      failClosed: parseBoolean(env('MORPHEUS_DURABLE_QUEUE_FAIL_CLOSED'), durableQueueEnabled),
      // When Supabase persistence is in quota/outage backoff the cross-instance
      // claim cannot run. Default true: grant the local claim (single-instance
      // deploys, the current topology, are unaffected). Set false for
      // multi-instance deploys so a relayer SKIPS processing during backoff
      // rather than risk two instances double-broadcasting the same fulfillment.
      allowLocalClaimDuringBackoff: parseBoolean(
        env('MORPHEUS_DURABLE_QUEUE_ALLOW_LOCAL_CLAIM_DURING_BACKOFF'),
        true
      ),
      syncLimit: Math.max(Number(env('MORPHEUS_DURABLE_QUEUE_SYNC_LIMIT') || 200), 1),
      staleProcessingMs: Math.max(
        Number(env('MORPHEUS_DURABLE_QUEUE_STALE_PROCESSING_MS') || 45000),
        1000
      ),
    },
    runSnapshots: {
      enabled: parseBoolean(env('MORPHEUS_RELAYER_RUN_SNAPSHOTS_ENABLED'), true),
      intervalMs: Math.max(Number(env('MORPHEUS_RELAYER_RUN_SNAPSHOT_INTERVAL_MS') || 60000), 0),
      errorBackoffMs: Math.max(
        Number(env('MORPHEUS_RELAYER_RUN_SNAPSHOT_ERROR_BACKOFF_MS') || 300000),
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
      timeoutMs: Math.min(
        Math.max(Number(env('MORPHEUS_FEED_SYNC_TIMEOUT_MS') || 10000), 1000),
        MAX_FEED_SYNC_TIMEOUT_MS
      ),
      waitForSubmission: parseBoolean(env('MORPHEUS_FEED_SYNC_WAIT_FOR_SUBMISSION'), false),
      projectSlug: env('MORPHEUS_FEED_PROJECT_SLUG') || 'morpheus',
      projectConfigEnabled: parseBoolean(env('MORPHEUS_FEED_SYNC_PROJECT_CONFIG_ENABLED'), false),
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
      claimStaleMs: Math.max(Number(env('MORPHEUS_AUTOMATION_CLAIM_STALE_MS') || 120000), 1000),
    },
    logFormat: env('MORPHEUS_RELAYER_LOG_FORMAT', 'LOG_FORMAT') || 'json',
    logLevel: env('MORPHEUS_RELAYER_LOG_LEVEL', 'LOG_LEVEL') || 'info',
    confirmations: {
      neo_n3: Number(env('MORPHEUS_RELAYER_NEO_N3_CONFIRMATIONS') || 1),
      neox: Number(env('MORPHEUS_RELAYER_NEOX_CONFIRMATIONS') || 2),
    },
    startRequestIds: {
      neo_n3: env('MORPHEUS_RELAYER_NEO_N3_START_REQUEST_ID')
        ? Number(env('MORPHEUS_RELAYER_NEO_N3_START_REQUEST_ID'))
        : null,
      neox: env('MORPHEUS_RELAYER_NEOX_START_REQUEST_ID')
        ? Number(env('MORPHEUS_RELAYER_NEOX_START_REQUEST_ID'))
        : null,
    },
    startBlocks: {
      neo_n3: env('MORPHEUS_RELAYER_NEO_N3_START_BLOCK')
        ? Number(env('MORPHEUS_RELAYER_NEO_N3_START_BLOCK'))
        : null,
      neox: env('MORPHEUS_RELAYER_NEOX_START_BLOCK')
        ? Number(env('MORPHEUS_RELAYER_NEOX_START_BLOCK'))
        : null,
    },
    stateFile,
    nitro: {
      apiUrl: resolveNitroApiUrls(network, registry),
      // Endpoint that holds the signing keys (enclave). Used for /sign/payload +
      // key derivation. Defaults to the worker apiUrl so single-endpoint
      // deployments are unchanged; set NITRO_SIGNER_URL when the worker (compute)
      // and the signer (enclave) run on separate ports.
      signerUrl:
        trimString(env('NITRO_SIGNER_URL', 'MORPHEUS_SIGNER_URL')) ||
        resolveNitroApiUrls(network, registry),
      token: env(
        'MORPHEUS_RUNTIME_TOKEN',
        'NITRO_API_TOKEN',
        'PHALA_API_TOKEN',
        'NITRO_SHARED_SECRET',
        'PHALA_SHARED_SECRET'
      ),
      timeoutMs: Math.min(
        Math.max(
          Number(
            env('MORPHEUS_NITRO_TIMEOUT_MS', 'MORPHEUS_PHALA_TIMEOUT_MS') ||
              DEFAULT_NITRO_TIMEOUT_MS
          ),
          1000
        ),
        MAX_REQUEST_TIMEOUT_MS
      ),
      useDerivedKeys,
    },
    neo_n3: {
      scanMode:
        trimString(env('MORPHEUS_RELAYER_NEO_N3_SCAN_MODE')) ||
        (network === 'testnet' ? 'n3index_notifications' : 'block_cursor'),
      // How long to poll a broadcast fulfillRequest's application log for a
      // concrete VM state before treating it as a confirmation timeout. 0/unset
      // falls back to the in-module default (45s).
      fulfillConfirmTimeoutMs: env('MORPHEUS_RELAYER_NEO_N3_FULFILL_CONFIRM_TIMEOUT_MS')
        ? Number(env('MORPHEUS_RELAYER_NEO_N3_FULFILL_CONFIRM_TIMEOUT_MS'))
        : null,
      // When true (default), a fulfillRequest whose application log never appears
      // before the timeout is treated as transient and re-broadcast on a later
      // tick (idempotent) instead of silently recorded as fulfilled. Set false
      // to restore the prior best-effort UNKNOWN behavior.
      fulfillConfirmThrowOnTimeout: parseBoolean(
        env('MORPHEUS_RELAYER_NEO_N3_FULFILL_CONFIRM_THROW_ON_TIMEOUT'),
        true
      ),
      indexerUrl:
        trimString(env('MORPHEUS_RELAYER_NEO_N3_INDEXER_URL')) || 'https://api.n3index.dev/rest/v1',
      startRequestId: env('MORPHEUS_RELAYER_NEO_N3_START_REQUEST_ID')
        ? Number(env('MORPHEUS_RELAYER_NEO_N3_START_REQUEST_ID'))
        : null,
      rpcUrl: neoN3RpcUrls[0] || '',
      rpcUrls: neoN3RpcUrls,
      networkMagic: resolveNeoN3NetworkMagic(network, registry),
      oracleContract:
        envNetworkScoped(network, 'CONTRACT_MORPHEUS_ORACLE_HASH') ||
        trimString(registry.neo_n3?.contracts?.morpheus_oracle || ''),
      datafeedContract:
        envNetworkScoped(network, 'CONTRACT_MORPHEUS_DATAFEED_HASH') ||
        trimString(registry.neo_n3?.contracts?.morpheus_datafeed || ''),
      updaterWif: updaterSigner.materialized?.wif || '',
      updaterPrivateKey: updaterSigner.materialized?.private_key || '',
      feeTopUp: {
        enabled: parseBoolean(env('MORPHEUS_RELAYER_NEO_N3_AUTO_TOPUP_ENABLED'), true),
        minBalance: parseIntegerString(
          env('MORPHEUS_RELAYER_NEO_N3_AUTO_TOPUP_MIN_FIXED8'),
          '50000000'
        ),
        topUpAmount: parseIntegerString(
          env('MORPHEUS_RELAYER_NEO_N3_AUTO_TOPUP_AMOUNT_FIXED8'),
          '100000000'
        ),
        maxTopUpAmount: parseIntegerString(
          env('MORPHEUS_RELAYER_NEO_N3_AUTO_TOPUP_MAX_FIXED8'),
          '500000000'
        ),
        funderWif: env(
          'MORPHEUS_RELAYER_NEO_N3_FEE_FUNDER_WIF',
          'MORPHEUS_NEO_N3_FEE_FUNDER_WIF',
          'NITRO_NEO_N3_WIF',
          'PHALA_NEO_N3_WIF',
          'MORPHEUS_RELAYER_NEO_N3_WIF'
        ),
        funderPrivateKey: env(
          'MORPHEUS_RELAYER_NEO_N3_FEE_FUNDER_PRIVATE_KEY',
          'MORPHEUS_NEO_N3_FEE_FUNDER_PRIVATE_KEY',
          'NITRO_NEO_N3_PRIVATE_KEY',
          'PHALA_NEO_N3_PRIVATE_KEY',
          'MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY'
        ),
      },
    },
    neox: {
      // EVM kernel uses request-cursor discovery (getRequest/totalRequests) — no
      // genesis block scan, cold-starts at the request-id tail like Neo N3.
      scanMode: trimString(env('MORPHEUS_RELAYER_NEOX_SCAN_MODE')) || 'request_cursor',
      rpcUrl:
        trimString(env('MORPHEUS_RELAYER_NEOX_RPC_URL', 'NEOX_RPC')) ||
        trimString(registry.neox?.rpc_url || '') ||
        (network === 'mainnet'
          ? 'https://mainnet-1.rpc.banelabs.org'
          : 'https://neoxt4seed1.ngd.network'),
      // Failover RPC list for READS (B4): a single dead Neo X RPC must not kill
      // the whole neox lane (Neo N3 already rotates). The primary rpcUrl above is
      // always first; the rest come from MORPHEUS_RELAYER_NEOX_RPC_URLS / registry
      // plus per-net public defaults. De-duped, order preserved. The signer/submit
      // path stays pinned to rpcUrl (a stable per-signer key) so failover never
      // rotates the URL used for nonce management mid-flight.
      rpcUrls: uniqueOrdered([
        trimString(env('MORPHEUS_RELAYER_NEOX_RPC_URL', 'NEOX_RPC')) ||
          trimString(registry.neox?.rpc_url || '') ||
          (network === 'mainnet'
            ? 'https://mainnet-1.rpc.banelabs.org'
            : 'https://neoxt4seed1.ngd.network'),
        ...parseUrlList(env('MORPHEUS_RELAYER_NEOX_RPC_URLS', 'NEOX_RPC_URLS')),
        ...parseUrlList(registry.neox?.rpc_urls || []),
        ...(network === 'mainnet'
          ? ['https://mainnet-1.rpc.banelabs.org', 'https://mainnet-2.rpc.banelabs.org']
          : ['https://neoxt4seed1.ngd.network', 'https://neoxt4seed2.ngd.network']),
      ]),
      // Neo X chain ids: mainnet 47763 (0xba93), T4 testnet 12227332 (0xba9304).
      // Must be correct — it is bound into the fulfillment digest the kernel verifies.
      chainId: Number(
        env('MORPHEUS_RELAYER_NEOX_CHAIN_ID', 'NEOX_CHAIN_ID') ||
          registry.neox?.chain_id ||
          (network === 'mainnet' ? 47763 : 12227332)
      ),
      oracleContract:
        trimString(env('MORPHEUS_RELAYER_NEOX_ORACLE', 'NEOX_ORACLE')) ||
        trimString(registry.neox?.contracts?.morpheus_oracle || ''),
      // EVM signer is a raw secp256k1 key (the Nitro enclave signs secp256r1 only).
      updaterPrivateKey: trimString(
        env('MORPHEUS_RELAYER_NEOX_UPDATER_PK', 'NEOX_UPDATER_PK', 'NEOX_FEED_PK')
      ),
      verifierPrivateKey: trimString(env('MORPHEUS_RELAYER_NEOX_VERIFIER_PK', 'NEOX_VERIFIER_PK')),
      // Deadline for the fulfillRequest receipt wait — a never-mined tx must not
      // wedge the per-signer submission queue (mirrors the Neo N3 45s default).
      confirmTimeoutMs: Math.max(
        Number(env('MORPHEUS_RELAYER_NEOX_CONFIRM_TIMEOUT_MS') || 45_000),
        1000
      ),
      workerUrl: trimString(env('MORPHEUS_RELAYER_NEOX_WORKER_URL', 'NEOX_WORKER_URL')),
    },
    metricsServer: {
      host: env('MORPHEUS_RELAYER_METRICS_HOST') || '127.0.0.1',
      port: Math.max(Number(env('MORPHEUS_RELAYER_METRICS_PORT') || 9464), 1),
      path: env('MORPHEUS_RELAYER_METRICS_PATH') || '/metrics',
    },
    heartbeats: {
      relayer: env('MORPHEUS_BETTERSTACK_RELAYER_HEARTBEAT_URL'),
      feedRelayer: env('MORPHEUS_BETTERSTACK_RELAYER_FEED_HEARTBEAT_URL'),
      failure: env('MORPHEUS_BETTERSTACK_RELAYER_FAILURE_URL'),
      // Dead-letter (permanent callback loss) push alert (F1). Falls back to the
      // generic failure URL when unset, so configuring only the failure URL keeps
      // the existing single-channel behavior; set a dedicated URL to route the
      // single most important incident — a permanently dropped oracle callback —
      // to its own alert channel.
      deadLetter: env('MORPHEUS_BETTERSTACK_RELAYER_DEADLETTER_URL'),
    },
  };
}
