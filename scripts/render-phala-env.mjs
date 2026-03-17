import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const rootEnvPath = path.resolve(repoRoot, '.env');

function parseArgs(argv = process.argv.slice(2)) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === '--network') {
      parsed.network = argv[index + 1] || '';
      index += 1;
      continue;
    }
    if (current === '--output') {
      parsed.output = argv[index + 1] || '';
      index += 1;
    }
  }
  return parsed;
}

const cliArgs = parseArgs();
const requestedNetwork = trimString(cliArgs.network || process.env.PHALA_ENV_NETWORK || '');
const requestedOutput = trimString(cliArgs.output || process.env.PHALA_ENV_OUTPUT || '');

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseDotEnv(raw) {
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

async function readLocalEnv() {
  try {
    const raw = await fs.readFile(rootEnvPath, 'utf8');
    return parseDotEnv(raw);
  } catch {
    return {};
  }
}

async function readExistingOutputEnv(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return parseDotEnv(raw);
  } catch {
    return {};
  }
}

async function readNetworkRegistry(network) {
  try {
    const raw = await fs.readFile(path.resolve(repoRoot, 'config/networks', `${network}.json`), 'utf8');
    return JSON.parse(raw);
  } catch {
    return { neo_n3: { contracts: {} }, neo_x: { contracts: {} } };
  }
}

function createResolver(localEnv, existingEnv) {
  return (...keys) => {
    for (const key of keys) {
      const localValue = trimString(localEnv[key]);
      if (localValue) return localValue;
      const processValue = trimString(process.env[key]);
      if (processValue) return processValue;
      const existingValue = trimString(existingEnv[key]);
      if (existingValue) return existingValue;
    }
    return '';
  };
}

function createExplicitResolver(localEnv, existingEnv) {
  return (key) => {
    if (Object.prototype.hasOwnProperty.call(localEnv, key)) {
      return trimString(localEnv[key]);
    }
    const processValue = trimString(process.env[key]);
    if (processValue || Object.prototype.hasOwnProperty.call(process.env, key)) {
      return processValue;
    }
    if (Object.prototype.hasOwnProperty.call(existingEnv, key)) {
      return trimString(existingEnv[key]);
    }
    return '';
  };
}

function line(key, value) {
  return `${key}=${value ?? ''}`;
}

function resolveOracleKeystorePath(get) {
  const configured = get('PHALA_ORACLE_KEYSTORE_PATH');
  if (!configured || configured === '/data/morpheus-oracle-key.json') {
    return '/data/morpheus/oracle-key.json';
  }
  return configured;
}

const localEnv = await readLocalEnv();
const initialNetwork = requestedNetwork || trimString(process.env.MORPHEUS_NETWORK || localEnv.MORPHEUS_NETWORK) || 'testnet';
const initialOutputPath = path.resolve(
  repoRoot,
  requestedOutput || `deploy/phala/morpheus.${initialNetwork}.env`,
);
const existingEnv = await readExistingOutputEnv(initialOutputPath);
const network = requestedNetwork || trimString(process.env.MORPHEUS_NETWORK || localEnv.MORPHEUS_NETWORK || existingEnv.MORPHEUS_NETWORK) || initialNetwork;
const outputPath = path.resolve(
  repoRoot,
  requestedOutput || `deploy/phala/morpheus.${network}.env`,
);
const registry = await readNetworkRegistry(network);
const get = createResolver(localEnv, existingEnv);
const getExplicit = createExplicitResolver(localEnv, existingEnv);
const explicitNetworkMode = Boolean(requestedNetwork);

function resolveNetworkScoped(...keys) {
  for (const key of keys) {
    const processValue = trimString(process.env[key]);
    if (processValue) return processValue;
  }
  if (!explicitNetworkMode) {
    for (const key of keys) {
      const localValue = trimString(localEnv[key]);
      if (localValue) return localValue;
    }
  }
  for (const key of keys) {
    const existingValue = trimString(existingEnv[key]);
    if (existingValue) return existingValue;
  }
  if (explicitNetworkMode) {
    for (const key of keys) {
      const localValue = trimString(localEnv[key]);
      if (localValue) return localValue;
    }
  }
  return '';
}

function resolveRegistryBackedValue(registryValue, ...keys) {
  if (explicitNetworkMode && trimString(registryValue)) {
    return trimString(registryValue);
  }
  for (const key of keys) {
    const processValue = trimString(process.env[key]);
    if (processValue) return processValue;
  }
  for (const key of keys) {
    const localValue = trimString(localEnv[key]);
    if (localValue) return localValue;
  }
  for (const key of keys) {
    const existingValue = trimString(existingEnv[key]);
    if (existingValue) return existingValue;
  }
  return trimString(registryValue);
}

function resolveNetworkScopedValue(baseKey, { allowGeneric = true, defaultValue = "" } = {}) {
  const scopedKey = `${baseKey}_${network.toUpperCase()}`;
  const scoped = resolveNetworkScoped(scopedKey);
  if (scoped) return scoped;
  if (allowGeneric) {
    const generic = resolveNetworkScoped(baseKey);
    if (generic) return generic;
  }
  return defaultValue;
}

function resolveSignerForNetwork(role = 'worker') {
  if (network === 'testnet') {
    return resolveNetworkScoped('NEO_TESTNET_WIF');
  }
  if (role === 'worker') {
    return resolveNetworkScoped('PHALA_NEO_N3_WIF', 'NEO_N3_WIF', 'MORPHEUS_RELAYER_NEO_N3_WIF');
  }
  return resolveNetworkScoped('MORPHEUS_RELAYER_NEO_N3_WIF', 'MORPHEUS_UPDATER_NEO_N3_WIF', 'NEO_N3_WIF');
}

function resolveNeoN3PrivateKeyForNetwork(role = 'worker') {
  if (network === 'testnet') {
    return role === 'worker'
      ? resolveNetworkScoped('PHALA_NEO_N3_PRIVATE_KEY_TESTNET', 'MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY_TESTNET')
      : resolveNetworkScoped('MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY_TESTNET', 'PHALA_NEO_N3_PRIVATE_KEY_TESTNET');
  }
  return role === 'worker'
    ? get('PHALA_NEO_N3_PRIVATE_KEY', 'MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY')
    : get('MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY', 'PHALA_NEO_N3_PRIVATE_KEY');
}

function resolveOracleVerifierSignerForNetwork() {
  if (network === 'testnet') {
    const scopedTestnet = resolveNetworkScoped(
      'MORPHEUS_ORACLE_VERIFIER_WIF_TESTNET',
      'PHALA_ORACLE_VERIFIER_WIF_TESTNET',
    );
    return scopedTestnet || resolveSignerForNetwork('worker');
  }
  return resolveNetworkScoped(
    'MORPHEUS_ORACLE_VERIFIER_WIF',
    'PHALA_ORACLE_VERIFIER_WIF',
  );
}

function resolveOracleVerifierPrivateKeyForNetwork() {
  if (network === 'testnet') {
    return resolveNetworkScoped(
      'MORPHEUS_ORACLE_VERIFIER_PRIVATE_KEY_TESTNET',
      'PHALA_ORACLE_VERIFIER_PRIVATE_KEY_TESTNET',
    );
  }
  return resolveNetworkScoped(
    'MORPHEUS_ORACLE_VERIFIER_PRIVATE_KEY',
    'PHALA_ORACLE_VERIFIER_PRIVATE_KEY',
  );
}

function resolveUseDerivedKeysDefault() {
  const explicit = get('PHALA_USE_DERIVED_KEYS');
  if (explicit) return explicit;

  const hasExplicitTestnetVerifier = network === 'testnet'
    && Boolean(resolveOracleVerifierSignerForNetwork() || resolveOracleVerifierPrivateKeyForNetwork());
  return hasExplicitTestnetVerifier ? 'false' : 'true';
}

function resolveNeoN3ScanModeDefault() {
  const explicit = get('MORPHEUS_RELAYER_NEO_N3_SCAN_MODE');
  if (explicit) return explicit;
  return network === 'testnet' ? 'request_cursor' : '';
}

function mergeCsvList(primary, additions = []) {
  const seen = new Set();
  const out = [];
  for (const raw of [primary, ...additions]) {
    for (const item of String(raw || '').split(',')) {
      const normalized = trimString(item);
      if (!normalized) continue;
      const dedupeKey = normalized.toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      out.push(normalized);
    }
  }
  return out.join(',');
}

const runtimeConfig = {
  TWELVEDATA_API_KEY: get('TWELVEDATA_API_KEY'),
  WEB3AUTH_CLIENT_ID: get('WEB3AUTH_CLIENT_ID', 'NEXT_PUBLIC_WEB3AUTH_CLIENT_ID'),
  WEB3AUTH_JWKS_URL: get('WEB3AUTH_JWKS_URL') || 'https://api-auth.web3auth.io/.well-known/jwks.json',
  MORPHEUS_PROVIDER_CONFIG_API_KEY: get('MORPHEUS_PROVIDER_CONFIG_API_KEY', 'ADMIN_CONSOLE_API_KEY'),
  MORPHEUS_RELAYER_ADMIN_API_KEY: get('MORPHEUS_RELAYER_ADMIN_API_KEY', 'MORPHEUS_OPERATOR_API_KEY', 'ADMIN_CONSOLE_API_KEY'),
  MORPHEUS_SIGNING_ADMIN_API_KEY: get('MORPHEUS_SIGNING_ADMIN_API_KEY', 'MORPHEUS_OPERATOR_API_KEY', 'ADMIN_CONSOLE_API_KEY'),
  MORPHEUS_RELAY_ADMIN_API_KEY: get('MORPHEUS_RELAY_ADMIN_API_KEY', 'MORPHEUS_OPERATOR_API_KEY', 'ADMIN_CONSOLE_API_KEY'),
  MORPHEUS_OPERATOR_API_KEY: get('MORPHEUS_OPERATOR_API_KEY', 'ADMIN_CONSOLE_API_KEY'),
  MORPHEUS_NETWORK: network,
  NEO_RPC_URL: resolveRegistryBackedValue(registry.neo_n3?.rpc_url || '', 'NEO_RPC_URL'),
  NEO_NETWORK_MAGIC: resolveRegistryBackedValue(String(registry.neo_n3?.network_magic || 894710606), 'NEO_NETWORK_MAGIC'),
  CONTRACT_MORPHEUS_ORACLE_HASH: resolveRegistryBackedValue(registry.neo_n3?.contracts?.morpheus_oracle || '', 'CONTRACT_MORPHEUS_ORACLE_HASH'),
  CONTRACT_ORACLE_CALLBACK_CONSUMER_HASH: resolveRegistryBackedValue(registry.neo_n3?.contracts?.oracle_callback_consumer || '', 'CONTRACT_ORACLE_CALLBACK_CONSUMER_HASH'),
  CONTRACT_MORPHEUS_DATAFEED_HASH: resolveRegistryBackedValue(registry.neo_n3?.contracts?.morpheus_datafeed || '', 'CONTRACT_MORPHEUS_DATAFEED_HASH'),
  PHALA_NEO_N3_WIF: resolveSignerForNetwork('worker'),
  PHALA_NEO_N3_PRIVATE_KEY: resolveNeoN3PrivateKeyForNetwork('worker'),
  MORPHEUS_ORACLE_VERIFIER_WIF: resolveOracleVerifierSignerForNetwork(),
  MORPHEUS_ORACLE_VERIFIER_PRIVATE_KEY: resolveOracleVerifierPrivateKeyForNetwork(),
  PHALA_ORACLE_VERIFIER_WIF: resolveOracleVerifierSignerForNetwork(),
  PHALA_ORACLE_VERIFIER_PRIVATE_KEY: resolveOracleVerifierPrivateKeyForNetwork(),
  MORPHEUS_RELAYER_NEO_N3_WIF: resolveSignerForNetwork('relayer'),
  MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY: resolveNeoN3PrivateKeyForNetwork('relayer'),
  NEOX_RPC_URL: resolveRegistryBackedValue(registry.neo_x?.rpc_url || 'https://neoxt4seed1.ngd.network', 'NEOX_RPC_URL', 'NEO_X_RPC_URL'),
  NEOX_CHAIN_ID: resolveRegistryBackedValue(String(registry.neo_x?.chain_id || 12227332), 'NEOX_CHAIN_ID', 'NEO_X_CHAIN_ID'),
  CONTRACT_MORPHEUS_ORACLE_X_ADDRESS: resolveRegistryBackedValue(registry.neo_x?.contracts?.morpheus_oracle_x || '', 'CONTRACT_MORPHEUS_ORACLE_X_ADDRESS'),
  CONTRACT_ORACLE_CALLBACK_CONSUMER_X_ADDRESS: resolveRegistryBackedValue(registry.neo_x?.contracts?.oracle_callback_consumer_x || '', 'CONTRACT_ORACLE_CALLBACK_CONSUMER_X_ADDRESS'),
  CONTRACT_MORPHEUS_DATAFEED_X_ADDRESS: resolveRegistryBackedValue(registry.neo_x?.contracts?.morpheus_datafeed_x || '', 'CONTRACT_MORPHEUS_DATAFEED_X_ADDRESS'),
  PHALA_NEOX_PRIVATE_KEY: get('PHALA_NEOX_PRIVATE_KEY', 'NEOX_PRIVATE_KEY'),
  MORPHEUS_RELAYER_NEOX_PRIVATE_KEY: get('MORPHEUS_RELAYER_NEOX_PRIVATE_KEY', 'PHALA_NEOX_PRIVATE_KEY', 'NEOX_PRIVATE_KEY'),
  MORPHEUS_FEED_PROJECT_SLUG: get('MORPHEUS_FEED_PROJECT_SLUG') || 'demo',
  MORPHEUS_FEED_PROVIDER: get('MORPHEUS_FEED_PROVIDER') || 'twelvedata',
  MORPHEUS_FEED_PROVIDERS: get('MORPHEUS_FEED_PROVIDERS') || 'twelvedata',
  MORPHEUS_FEED_SYMBOLS: get('MORPHEUS_FEED_SYMBOLS') || 'NEO-USD,GAS-USD,FLM-USD,BTC-USD,ETH-USD,SOL-USD,TRX-USD,PAXG-USD,WTI-USD,BRENT-USD,NATGAS-USD,COPPER-USD,WHEAT-USD,CORN-USD,SOY-USD,USDT-USD,USDC-USD,BNB-USD,XRP-USD,DOGE-USD,AAPL-USD,GOOGL-USD,MSFT-USD,AMZN-USD,TSLA-USD,META-USD,NVDA-USD,SPY-USD,QQQ-USD,GLD-USD,EUR-USD,GBP-USD,JPY-USD,CNY-USD',
  MORPHEUS_FEED_CHANGE_THRESHOLD_BPS: get('MORPHEUS_FEED_CHANGE_THRESHOLD_BPS') || '10',
  MORPHEUS_FEED_MIN_UPDATE_INTERVAL_MS: get('MORPHEUS_FEED_MIN_UPDATE_INTERVAL_MS') || '60000',
  MORPHEUS_FEED_SYNC_INTERVAL_MS: get('MORPHEUS_FEED_SYNC_INTERVAL_MS') || '60000',
  MORPHEUS_FEED_PAIR_REGISTRY_JSON: get('MORPHEUS_FEED_PAIR_REGISTRY_JSON') || '',
  MORPHEUS_RELAYER_POLL_INTERVAL_MS: get('MORPHEUS_RELAYER_POLL_INTERVAL_MS') || '5000',
  MORPHEUS_RELAYER_CONCURRENCY: get('MORPHEUS_RELAYER_CONCURRENCY') || '4',
  MORPHEUS_RELAYER_MAX_BLOCKS_PER_TICK: get('MORPHEUS_RELAYER_MAX_BLOCKS_PER_TICK') || '250',
  MORPHEUS_RELAYER_MAX_RETRIES: get('MORPHEUS_RELAYER_MAX_RETRIES') || '5',
  MORPHEUS_RELAYER_RETRY_BASE_DELAY_MS: get('MORPHEUS_RELAYER_RETRY_BASE_DELAY_MS') || '5000',
  MORPHEUS_RELAYER_RETRY_MAX_DELAY_MS: get('MORPHEUS_RELAYER_RETRY_MAX_DELAY_MS') || '300000',
  MORPHEUS_RELAYER_PROCESSED_CACHE_SIZE: get('MORPHEUS_RELAYER_PROCESSED_CACHE_SIZE') || '5000',
  MORPHEUS_RELAYER_DEAD_LETTER_LIMIT: get('MORPHEUS_RELAYER_DEAD_LETTER_LIMIT') || '500',
  MORPHEUS_RELAYER_NEO_N3_SCAN_MODE: resolveNeoN3ScanModeDefault(),
  MORPHEUS_RELAYER_NEO_N3_START_REQUEST_ID: get('MORPHEUS_RELAYER_NEO_N3_START_REQUEST_ID') || '',
  MORPHEUS_AUTOMATION_ENABLED: get('MORPHEUS_AUTOMATION_ENABLED') || 'true',
  MORPHEUS_AUTOMATION_BATCH_SIZE: get('MORPHEUS_AUTOMATION_BATCH_SIZE') || '50',
  MORPHEUS_AUTOMATION_MAX_QUEUED_PER_TICK: get('MORPHEUS_AUTOMATION_MAX_QUEUED_PER_TICK') || '10',
  MORPHEUS_AUTOMATION_PRICE_PAIRS_PER_TICK: get('MORPHEUS_AUTOMATION_PRICE_PAIRS_PER_TICK') || '64',
  MORPHEUS_AUTOMATION_DEFAULT_PRICE_COOLDOWN_MS: get('MORPHEUS_AUTOMATION_DEFAULT_PRICE_COOLDOWN_MS') || '60000',
  MORPHEUS_RELAYER_LOG_FORMAT: get('MORPHEUS_RELAYER_LOG_FORMAT', 'LOG_FORMAT') || 'json',
  MORPHEUS_RELAYER_LOG_LEVEL: get('MORPHEUS_RELAYER_LOG_LEVEL', 'LOG_LEVEL') || 'info',
  MORPHEUS_RELAYER_NEO_N3_START_BLOCK: resolveNetworkScopedValue(
    'MORPHEUS_RELAYER_NEO_N3_START_BLOCK',
    { allowGeneric: network === 'mainnet', defaultValue: network === 'mainnet' ? (existingEnv.MORPHEUS_RELAYER_NEO_N3_START_BLOCK || '') : '' },
  ) || '',
  MORPHEUS_RELAYER_NEO_X_START_BLOCK: resolveNetworkScopedValue(
    'MORPHEUS_RELAYER_NEO_X_START_BLOCK',
    { allowGeneric: network === 'mainnet', defaultValue: network === 'mainnet' ? (existingEnv.MORPHEUS_RELAYER_NEO_X_START_BLOCK || '') : '' },
  ) || '',
  ORACLE_TIMEOUT: get('ORACLE_TIMEOUT') || '20s',
  ORACLE_SCRIPT_TIMEOUT_MS: get('ORACLE_SCRIPT_TIMEOUT_MS') || '2000',
  ORACLE_WASM_TIMEOUT_MS: get('ORACLE_WASM_TIMEOUT_MS') || get('MORPHEUS_WASM_TIMEOUT_MS') || '30000',
  COMPUTE_SCRIPT_TIMEOUT_MS: get('COMPUTE_SCRIPT_TIMEOUT_MS') || '2000',
  COMPUTE_WASM_TIMEOUT_MS: get('COMPUTE_WASM_TIMEOUT_MS') || get('MORPHEUS_WASM_TIMEOUT_MS') || '30000',
  MORPHEUS_WASM_TIMEOUT_MS: get('MORPHEUS_WASM_TIMEOUT_MS') || '30000',
  MORPHEUS_ENABLE_UNTRUSTED_SCRIPTS: get('MORPHEUS_ENABLE_UNTRUSTED_SCRIPTS'),
  PHALA_USE_DERIVED_KEYS: resolveUseDerivedKeysDefault(),
  PHALA_EMIT_ATTESTATION: get('PHALA_EMIT_ATTESTATION') || 'true',
  PHALA_DSTACK_ENDPOINT: get('PHALA_DSTACK_ENDPOINT') || '/var/run/dstack.sock',
  PHALA_DSTACK_NEO_N3_KEY_PATH: get('PHALA_DSTACK_NEO_N3_KEY_PATH'),
  PHALA_DSTACK_NEOX_KEY_PATH: get('PHALA_DSTACK_NEOX_KEY_PATH'),
  PHALA_DSTACK_RELAYER_NEO_N3_KEY_PATH: get('PHALA_DSTACK_RELAYER_NEO_N3_KEY_PATH'),
  PHALA_DSTACK_RELAYER_NEOX_KEY_PATH: get('PHALA_DSTACK_RELAYER_NEOX_KEY_PATH'),
  PHALA_DSTACK_ORACLE_ENCRYPTION_KEY_PATH: get('PHALA_DSTACK_ORACLE_ENCRYPTION_KEY_PATH'),
  PHALA_ORACLE_KEYSTORE_PATH: resolveOracleKeystorePath(get),
  MORPHEUS_PAYMASTER_TESTNET_ENABLED: get('MORPHEUS_PAYMASTER_TESTNET_ENABLED'),
  MORPHEUS_PAYMASTER_TESTNET_POLICY_ID: get('MORPHEUS_PAYMASTER_TESTNET_POLICY_ID'),
  MORPHEUS_PAYMASTER_TESTNET_MAX_GAS_UNITS: get('MORPHEUS_PAYMASTER_TESTNET_MAX_GAS_UNITS'),
  MORPHEUS_PAYMASTER_TESTNET_ALLOW_TARGETS: mergeCsvList(
    get('MORPHEUS_PAYMASTER_TESTNET_ALLOW_TARGETS'),
    [trimString(registry.neo_n3?.contracts?.abstract_account || '')],
  ),
  MORPHEUS_PAYMASTER_TESTNET_ALLOW_METHODS: mergeCsvList(
    get('MORPHEUS_PAYMASTER_TESTNET_ALLOW_METHODS'),
    ['executeUserOp', 'executeUnifiedByAddress'],
  ),
  MORPHEUS_PAYMASTER_TESTNET_ALLOW_ACCOUNTS: get('MORPHEUS_PAYMASTER_TESTNET_ALLOW_ACCOUNTS'),
  MORPHEUS_PAYMASTER_TESTNET_BLOCK_ACCOUNTS: get('MORPHEUS_PAYMASTER_TESTNET_BLOCK_ACCOUNTS'),
  MORPHEUS_PAYMASTER_TESTNET_ALLOW_DAPPS: get('MORPHEUS_PAYMASTER_TESTNET_ALLOW_DAPPS'),
  MORPHEUS_PAYMASTER_TESTNET_TTL_MS: get('MORPHEUS_PAYMASTER_TESTNET_TTL_MS'),
  MORPHEUS_PAYMASTER_MAINNET_ENABLED: get('MORPHEUS_PAYMASTER_MAINNET_ENABLED'),
  MORPHEUS_PAYMASTER_MAINNET_POLICY_ID: get('MORPHEUS_PAYMASTER_MAINNET_POLICY_ID'),
  MORPHEUS_PAYMASTER_MAINNET_MAX_GAS_UNITS: get('MORPHEUS_PAYMASTER_MAINNET_MAX_GAS_UNITS'),
  MORPHEUS_PAYMASTER_MAINNET_ALLOW_TARGETS: get('MORPHEUS_PAYMASTER_MAINNET_ALLOW_TARGETS'),
  MORPHEUS_PAYMASTER_MAINNET_ALLOW_METHODS: get('MORPHEUS_PAYMASTER_MAINNET_ALLOW_METHODS'),
  MORPHEUS_PAYMASTER_MAINNET_ALLOW_ACCOUNTS: get('MORPHEUS_PAYMASTER_MAINNET_ALLOW_ACCOUNTS'),
  MORPHEUS_PAYMASTER_MAINNET_BLOCK_ACCOUNTS: get('MORPHEUS_PAYMASTER_MAINNET_BLOCK_ACCOUNTS'),
  MORPHEUS_PAYMASTER_MAINNET_ALLOW_DAPPS: get('MORPHEUS_PAYMASTER_MAINNET_ALLOW_DAPPS'),
  MORPHEUS_PAYMASTER_MAINNET_TTL_MS: get('MORPHEUS_PAYMASTER_MAINNET_TTL_MS'),
};

const lines = [
  '# Generated from root .env and config/networks; do not commit.',
  line('MORPHEUS_PHALA_WORKER_IMAGE', get('MORPHEUS_PHALA_WORKER_IMAGE') || 'ghcr.io/r3e-network/neo-morpheus-oracle-phala-worker:latest'),
  line('MORPHEUS_RELAYER_IMAGE', get('MORPHEUS_RELAYER_IMAGE') || 'ghcr.io/r3e-network/neo-morpheus-oracle-relayer:latest'),
  '',
  line('PHALA_WORKER_PORT', get('PHALA_WORKER_PORT') || '8080'),
  line('PHALA_SHARED_SECRET', get('PHALA_SHARED_SECRET')), 
  line('PHALA_API_TOKEN', get('PHALA_API_TOKEN')), 
  line('TWELVEDATA_API_KEY', get('TWELVEDATA_API_KEY')), 
  '',
  line('NEXT_PUBLIC_SUPABASE_URL', get('NEXT_PUBLIC_SUPABASE_URL', 'morpheus_SUPABASE_URL')), 
  line('NEXT_PUBLIC_SUPABASE_ANON_KEY', get('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_morpheus_SUPABASE_ANON_KEY')), 
  line('SUPABASE_URL', get('SUPABASE_URL', 'morpheus_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL')), 
  line('SUPABASE_SECRET_KEY', get('SUPABASE_SECRET_KEY', 'morpheus_SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'morpheus_SUPABASE_SERVICE_ROLE_KEY')),
  line('SUPABASE_SERVICE_ROLE_KEY', get('SUPABASE_SERVICE_ROLE_KEY', 'morpheus_SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY', 'morpheus_SUPABASE_SECRET_KEY')), 
  line('MORPHEUS_RUNTIME_CONFIG_JSON', JSON.stringify(runtimeConfig)),
  line('MORPHEUS_PROVIDER_CONFIG_API_KEY', get('MORPHEUS_PROVIDER_CONFIG_API_KEY', 'ADMIN_CONSOLE_API_KEY')), 
  line('MORPHEUS_RELAYER_ADMIN_API_KEY', get('MORPHEUS_RELAYER_ADMIN_API_KEY', 'MORPHEUS_OPERATOR_API_KEY', 'ADMIN_CONSOLE_API_KEY')),
  line('MORPHEUS_SIGNING_ADMIN_API_KEY', get('MORPHEUS_SIGNING_ADMIN_API_KEY', 'MORPHEUS_OPERATOR_API_KEY', 'ADMIN_CONSOLE_API_KEY')),
  line('MORPHEUS_RELAY_ADMIN_API_KEY', get('MORPHEUS_RELAY_ADMIN_API_KEY', 'MORPHEUS_OPERATOR_API_KEY', 'ADMIN_CONSOLE_API_KEY')),
  line('MORPHEUS_OPERATOR_API_KEY', get('MORPHEUS_OPERATOR_API_KEY', 'ADMIN_CONSOLE_API_KEY')),
  '',
  line('MORPHEUS_NETWORK', network),
  '',
  line('NEO_RPC_URL', runtimeConfig.NEO_RPC_URL),
  line('NEO_NETWORK_MAGIC', runtimeConfig.NEO_NETWORK_MAGIC),
  line('CONTRACT_MORPHEUS_ORACLE_HASH', runtimeConfig.CONTRACT_MORPHEUS_ORACLE_HASH),
  line('CONTRACT_ORACLE_CALLBACK_CONSUMER_HASH', runtimeConfig.CONTRACT_ORACLE_CALLBACK_CONSUMER_HASH),
  line('CONTRACT_MORPHEUS_DATAFEED_HASH', runtimeConfig.CONTRACT_MORPHEUS_DATAFEED_HASH),
  line('PHALA_NEO_N3_WIF', runtimeConfig.PHALA_NEO_N3_WIF),
  line('PHALA_NEO_N3_PRIVATE_KEY', runtimeConfig.PHALA_NEO_N3_PRIVATE_KEY),
  line('MORPHEUS_ORACLE_VERIFIER_WIF', runtimeConfig.MORPHEUS_ORACLE_VERIFIER_WIF),
  line('MORPHEUS_ORACLE_VERIFIER_PRIVATE_KEY', runtimeConfig.MORPHEUS_ORACLE_VERIFIER_PRIVATE_KEY),
  line('PHALA_ORACLE_VERIFIER_WIF', runtimeConfig.PHALA_ORACLE_VERIFIER_WIF),
  line('PHALA_ORACLE_VERIFIER_PRIVATE_KEY', runtimeConfig.PHALA_ORACLE_VERIFIER_PRIVATE_KEY),
  line('MORPHEUS_RELAYER_NEO_N3_WIF', runtimeConfig.MORPHEUS_RELAYER_NEO_N3_WIF),
  line('MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY', runtimeConfig.MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY),
  '',
  line('NEOX_RPC_URL', runtimeConfig.NEOX_RPC_URL),
  line('NEOX_CHAIN_ID', runtimeConfig.NEOX_CHAIN_ID),
  line('CONTRACT_MORPHEUS_ORACLE_X_ADDRESS', runtimeConfig.CONTRACT_MORPHEUS_ORACLE_X_ADDRESS),
  line('CONTRACT_ORACLE_CALLBACK_CONSUMER_X_ADDRESS', runtimeConfig.CONTRACT_ORACLE_CALLBACK_CONSUMER_X_ADDRESS),
  line('CONTRACT_MORPHEUS_DATAFEED_X_ADDRESS', runtimeConfig.CONTRACT_MORPHEUS_DATAFEED_X_ADDRESS),
  line('PHALA_NEOX_PRIVATE_KEY', get('PHALA_NEOX_PRIVATE_KEY', 'NEOX_PRIVATE_KEY')),
  line('MORPHEUS_RELAYER_NEOX_PRIVATE_KEY', get('MORPHEUS_RELAYER_NEOX_PRIVATE_KEY', 'PHALA_NEOX_PRIVATE_KEY', 'NEOX_PRIVATE_KEY')),
  '',
  line('MORPHEUS_FEED_PROJECT_SLUG', get('MORPHEUS_FEED_PROJECT_SLUG') || 'demo'),
  line('MORPHEUS_FEED_PROVIDER', get('MORPHEUS_FEED_PROVIDER') || 'twelvedata'),
  line('MORPHEUS_FEED_PROVIDERS', get('MORPHEUS_FEED_PROVIDERS') || 'twelvedata'),
  line('MORPHEUS_FEED_SYMBOLS', get('MORPHEUS_FEED_SYMBOLS') || 'NEO-USD,GAS-USD,FLM-USD,BTC-USD,ETH-USD,SOL-USD,TRX-USD,PAXG-USD,WTI-USD,BRENT-USD,NATGAS-USD,COPPER-USD,WHEAT-USD,CORN-USD,SOY-USD,USDT-USD,USDC-USD,BNB-USD,XRP-USD,DOGE-USD,AAPL-USD,GOOGL-USD,MSFT-USD,AMZN-USD,TSLA-USD,META-USD,NVDA-USD,SPY-USD,QQQ-USD,GLD-USD,EUR-USD,GBP-USD,JPY-USD,CNY-USD'),
  line('MORPHEUS_FEED_CHANGE_THRESHOLD_BPS', get('MORPHEUS_FEED_CHANGE_THRESHOLD_BPS') || '10'),
  line('MORPHEUS_FEED_MIN_UPDATE_INTERVAL_MS', get('MORPHEUS_FEED_MIN_UPDATE_INTERVAL_MS') || '60000'),
  line('MORPHEUS_FEED_SYNC_INTERVAL_MS', get('MORPHEUS_FEED_SYNC_INTERVAL_MS') || '60000'),
  line('MORPHEUS_FEED_PAIR_REGISTRY_JSON', get('MORPHEUS_FEED_PAIR_REGISTRY_JSON') || ''),
  '',
  line('MORPHEUS_RELAYER_POLL_INTERVAL_MS', get('MORPHEUS_RELAYER_POLL_INTERVAL_MS') || '5000'),
  line('MORPHEUS_RELAYER_CONCURRENCY', get('MORPHEUS_RELAYER_CONCURRENCY') || '4'),
  line('MORPHEUS_RELAYER_MAX_BLOCKS_PER_TICK', get('MORPHEUS_RELAYER_MAX_BLOCKS_PER_TICK') || '250'),
  line('MORPHEUS_RELAYER_MAX_RETRIES', get('MORPHEUS_RELAYER_MAX_RETRIES') || '5'),
  line('MORPHEUS_RELAYER_RETRY_BASE_DELAY_MS', get('MORPHEUS_RELAYER_RETRY_BASE_DELAY_MS') || '5000'),
  line('MORPHEUS_RELAYER_RETRY_MAX_DELAY_MS', get('MORPHEUS_RELAYER_RETRY_MAX_DELAY_MS') || '300000'),
  line('MORPHEUS_RELAYER_PROCESSED_CACHE_SIZE', get('MORPHEUS_RELAYER_PROCESSED_CACHE_SIZE') || '5000'),
  line('MORPHEUS_RELAYER_DEAD_LETTER_LIMIT', get('MORPHEUS_RELAYER_DEAD_LETTER_LIMIT') || '500'),
  line('MORPHEUS_RELAYER_NEO_N3_SCAN_MODE', runtimeConfig.MORPHEUS_RELAYER_NEO_N3_SCAN_MODE),
  line('MORPHEUS_RELAYER_NEO_N3_START_REQUEST_ID', runtimeConfig.MORPHEUS_RELAYER_NEO_N3_START_REQUEST_ID),
  line('MORPHEUS_AUTOMATION_ENABLED', get('MORPHEUS_AUTOMATION_ENABLED') || 'true'),
  line('MORPHEUS_AUTOMATION_BATCH_SIZE', get('MORPHEUS_AUTOMATION_BATCH_SIZE') || '50'),
  line('MORPHEUS_AUTOMATION_MAX_QUEUED_PER_TICK', get('MORPHEUS_AUTOMATION_MAX_QUEUED_PER_TICK') || '10'),
  line('MORPHEUS_AUTOMATION_PRICE_PAIRS_PER_TICK', get('MORPHEUS_AUTOMATION_PRICE_PAIRS_PER_TICK') || '64'),
  line('MORPHEUS_AUTOMATION_DEFAULT_PRICE_COOLDOWN_MS', get('MORPHEUS_AUTOMATION_DEFAULT_PRICE_COOLDOWN_MS') || '60000'),
  line('MORPHEUS_RELAYER_LOG_FORMAT', get('MORPHEUS_RELAYER_LOG_FORMAT', 'LOG_FORMAT') || 'json'),
  line('MORPHEUS_RELAYER_LOG_LEVEL', get('MORPHEUS_RELAYER_LOG_LEVEL', 'LOG_LEVEL') || 'info'),
  line('MORPHEUS_RELAYER_NEO_N3_START_BLOCK', get('MORPHEUS_RELAYER_NEO_N3_START_BLOCK') || ''),
  line('MORPHEUS_RELAYER_NEO_X_START_BLOCK', get('MORPHEUS_RELAYER_NEO_X_START_BLOCK') || ''),
  line('ORACLE_TIMEOUT', get('ORACLE_TIMEOUT') || '20s'),
  line('ORACLE_SCRIPT_TIMEOUT_MS', get('ORACLE_SCRIPT_TIMEOUT_MS') || '2000'),
  line('ORACLE_WASM_TIMEOUT_MS', get('ORACLE_WASM_TIMEOUT_MS') || get('MORPHEUS_WASM_TIMEOUT_MS') || '30000'),
  line('COMPUTE_SCRIPT_TIMEOUT_MS', get('COMPUTE_SCRIPT_TIMEOUT_MS') || '2000'),
  line('COMPUTE_WASM_TIMEOUT_MS', get('COMPUTE_WASM_TIMEOUT_MS') || get('MORPHEUS_WASM_TIMEOUT_MS') || '30000'),
  line('MORPHEUS_WASM_TIMEOUT_MS', get('MORPHEUS_WASM_TIMEOUT_MS') || '30000'),
  line('MORPHEUS_ENABLE_UNTRUSTED_SCRIPTS', get('MORPHEUS_ENABLE_UNTRUSTED_SCRIPTS')),
  line('PHALA_USE_DERIVED_KEYS', resolveUseDerivedKeysDefault()),
  line('PHALA_EMIT_ATTESTATION', get('PHALA_EMIT_ATTESTATION') || 'true'),
  line('PHALA_DSTACK_ENDPOINT', get('PHALA_DSTACK_ENDPOINT') || '/var/run/dstack.sock'),
  line('PHALA_DSTACK_NEO_N3_KEY_PATH', get('PHALA_DSTACK_NEO_N3_KEY_PATH')),
  line('PHALA_DSTACK_NEOX_KEY_PATH', get('PHALA_DSTACK_NEOX_KEY_PATH')),
  line('PHALA_DSTACK_RELAYER_NEO_N3_KEY_PATH', get('PHALA_DSTACK_RELAYER_NEO_N3_KEY_PATH')),
  line('PHALA_DSTACK_RELAYER_NEOX_KEY_PATH', get('PHALA_DSTACK_RELAYER_NEOX_KEY_PATH')),
  line('PHALA_DSTACK_ORACLE_ENCRYPTION_KEY_PATH', get('PHALA_DSTACK_ORACLE_ENCRYPTION_KEY_PATH')),
  line('PHALA_ORACLE_KEYSTORE_PATH', resolveOracleKeystorePath(get)),
  line('MORPHEUS_PAYMASTER_TESTNET_ENABLED', get('MORPHEUS_PAYMASTER_TESTNET_ENABLED')),
  line('MORPHEUS_PAYMASTER_TESTNET_POLICY_ID', get('MORPHEUS_PAYMASTER_TESTNET_POLICY_ID')),
  line('MORPHEUS_PAYMASTER_TESTNET_MAX_GAS_UNITS', get('MORPHEUS_PAYMASTER_TESTNET_MAX_GAS_UNITS')),
  line('MORPHEUS_PAYMASTER_TESTNET_ALLOW_TARGETS', runtimeConfig.MORPHEUS_PAYMASTER_TESTNET_ALLOW_TARGETS),
  line('MORPHEUS_PAYMASTER_TESTNET_ALLOW_METHODS', runtimeConfig.MORPHEUS_PAYMASTER_TESTNET_ALLOW_METHODS),
  line('MORPHEUS_PAYMASTER_TESTNET_ALLOW_ACCOUNTS', runtimeConfig.MORPHEUS_PAYMASTER_TESTNET_ALLOW_ACCOUNTS),
  line('MORPHEUS_PAYMASTER_TESTNET_BLOCK_ACCOUNTS', get('MORPHEUS_PAYMASTER_TESTNET_BLOCK_ACCOUNTS')),
  line('MORPHEUS_PAYMASTER_TESTNET_ALLOW_DAPPS', get('MORPHEUS_PAYMASTER_TESTNET_ALLOW_DAPPS')),
  line('MORPHEUS_PAYMASTER_TESTNET_TTL_MS', get('MORPHEUS_PAYMASTER_TESTNET_TTL_MS')),
  line('MORPHEUS_PAYMASTER_MAINNET_ENABLED', get('MORPHEUS_PAYMASTER_MAINNET_ENABLED')),
  line('MORPHEUS_PAYMASTER_MAINNET_POLICY_ID', get('MORPHEUS_PAYMASTER_MAINNET_POLICY_ID')),
  line('MORPHEUS_PAYMASTER_MAINNET_MAX_GAS_UNITS', get('MORPHEUS_PAYMASTER_MAINNET_MAX_GAS_UNITS')),
  line('MORPHEUS_PAYMASTER_MAINNET_ALLOW_TARGETS', get('MORPHEUS_PAYMASTER_MAINNET_ALLOW_TARGETS')),
  line('MORPHEUS_PAYMASTER_MAINNET_ALLOW_METHODS', get('MORPHEUS_PAYMASTER_MAINNET_ALLOW_METHODS')),
  line('MORPHEUS_PAYMASTER_MAINNET_ALLOW_ACCOUNTS', get('MORPHEUS_PAYMASTER_MAINNET_ALLOW_ACCOUNTS')),
  line('MORPHEUS_PAYMASTER_MAINNET_BLOCK_ACCOUNTS', get('MORPHEUS_PAYMASTER_MAINNET_BLOCK_ACCOUNTS')),
  line('MORPHEUS_PAYMASTER_MAINNET_ALLOW_DAPPS', get('MORPHEUS_PAYMASTER_MAINNET_ALLOW_DAPPS')),
  line('MORPHEUS_PAYMASTER_MAINNET_TTL_MS', get('MORPHEUS_PAYMASTER_MAINNET_TTL_MS')),
  '',
];

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(`Wrote ${outputPath} for network=${network}`);
