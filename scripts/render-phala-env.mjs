import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const rootEnvPath = path.resolve(repoRoot, '.env');
const outputPath = path.resolve(repoRoot, 'deploy/phala/morpheus.env');

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

async function readExistingOutputEnv() {
  try {
    const raw = await fs.readFile(outputPath, 'utf8');
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
      const processValue = trimString(process.env[key]);
      if (processValue) return processValue;
      const localValue = trimString(localEnv[key]);
      if (localValue) return localValue;
      const existingValue = trimString(existingEnv[key]);
      if (existingValue) return existingValue;
    }
    return '';
  };
}

function line(key, value) {
  return `${key}=${value ?? ''}`;
}

const network = trimString(process.env.MORPHEUS_NETWORK) || 'testnet';
const localEnv = await readLocalEnv();
const existingEnv = await readExistingOutputEnv();
const registry = await readNetworkRegistry(network);
const get = createResolver(localEnv, existingEnv);

const runtimeConfig = {
  TWELVEDATA_API_KEY: get('TWELVEDATA_API_KEY'),
  MORPHEUS_PROVIDER_CONFIG_API_KEY: get('MORPHEUS_PROVIDER_CONFIG_API_KEY', 'ADMIN_CONSOLE_API_KEY'),
  MORPHEUS_NETWORK: network,
  NEO_RPC_URL: get('NEO_RPC_URL') || trimString(registry.neo_n3?.rpc_url) || 'https://testnet1.neo.coz.io:443',
  NEO_NETWORK_MAGIC: get('NEO_NETWORK_MAGIC') || String(registry.neo_n3?.network_magic || 894710606),
  CONTRACT_MORPHEUS_ORACLE_HASH: get('CONTRACT_MORPHEUS_ORACLE_HASH') || trimString(registry.neo_n3?.contracts?.morpheus_oracle || ''),
  CONTRACT_ORACLE_CALLBACK_CONSUMER_HASH: get('CONTRACT_ORACLE_CALLBACK_CONSUMER_HASH') || trimString(registry.neo_n3?.contracts?.oracle_callback_consumer || ''),
  CONTRACT_MORPHEUS_DATAFEED_HASH: get('CONTRACT_MORPHEUS_DATAFEED_HASH') || trimString(registry.neo_n3?.contracts?.morpheus_datafeed || ''),
  PHALA_NEO_N3_WIF: get('PHALA_NEO_N3_WIF', 'NEO_TESTNET_WIF'),
  PHALA_NEO_N3_PRIVATE_KEY: get('PHALA_NEO_N3_PRIVATE_KEY'),
  MORPHEUS_RELAYER_NEO_N3_WIF: get('MORPHEUS_RELAYER_NEO_N3_WIF', 'PHALA_NEO_N3_WIF', 'NEO_TESTNET_WIF'),
  MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY: get('MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY', 'PHALA_NEO_N3_PRIVATE_KEY'),
  NEOX_RPC_URL: get('NEOX_RPC_URL', 'NEO_X_RPC_URL') || trimString(registry.neo_x?.rpc_url) || 'https://neoxt4seed1.ngd.network',
  NEOX_CHAIN_ID: get('NEOX_CHAIN_ID', 'NEO_X_CHAIN_ID') || String(registry.neo_x?.chain_id || 12227332),
  CONTRACT_MORPHEUS_ORACLE_X_ADDRESS: get('CONTRACT_MORPHEUS_ORACLE_X_ADDRESS') || trimString(registry.neo_x?.contracts?.morpheus_oracle_x || ''),
  CONTRACT_ORACLE_CALLBACK_CONSUMER_X_ADDRESS: get('CONTRACT_ORACLE_CALLBACK_CONSUMER_X_ADDRESS') || trimString(registry.neo_x?.contracts?.oracle_callback_consumer_x || ''),
  CONTRACT_MORPHEUS_DATAFEED_X_ADDRESS: get('CONTRACT_MORPHEUS_DATAFEED_X_ADDRESS') || trimString(registry.neo_x?.contracts?.morpheus_datafeed_x || ''),
  PHALA_NEOX_PRIVATE_KEY: get('PHALA_NEOX_PRIVATE_KEY', 'NEOX_PRIVATE_KEY'),
  MORPHEUS_RELAYER_NEOX_PRIVATE_KEY: get('MORPHEUS_RELAYER_NEOX_PRIVATE_KEY', 'PHALA_NEOX_PRIVATE_KEY', 'NEOX_PRIVATE_KEY'),
  MORPHEUS_FEED_PROJECT_SLUG: get('MORPHEUS_FEED_PROJECT_SLUG') || 'demo',
  MORPHEUS_FEED_PROVIDER: get('MORPHEUS_FEED_PROVIDER') || 'twelvedata',
  MORPHEUS_RELAYER_POLL_INTERVAL_MS: get('MORPHEUS_RELAYER_POLL_INTERVAL_MS') || '5000',
  MORPHEUS_RELAYER_CONCURRENCY: get('MORPHEUS_RELAYER_CONCURRENCY') || '4',
  MORPHEUS_RELAYER_MAX_BLOCKS_PER_TICK: get('MORPHEUS_RELAYER_MAX_BLOCKS_PER_TICK') || '250',
  MORPHEUS_RELAYER_MAX_RETRIES: get('MORPHEUS_RELAYER_MAX_RETRIES') || '5',
  MORPHEUS_RELAYER_RETRY_BASE_DELAY_MS: get('MORPHEUS_RELAYER_RETRY_BASE_DELAY_MS') || '5000',
  MORPHEUS_RELAYER_RETRY_MAX_DELAY_MS: get('MORPHEUS_RELAYER_RETRY_MAX_DELAY_MS') || '300000',
  MORPHEUS_RELAYER_PROCESSED_CACHE_SIZE: get('MORPHEUS_RELAYER_PROCESSED_CACHE_SIZE') || '5000',
  MORPHEUS_RELAYER_DEAD_LETTER_LIMIT: get('MORPHEUS_RELAYER_DEAD_LETTER_LIMIT') || '500',
  MORPHEUS_RELAYER_LOG_FORMAT: get('MORPHEUS_RELAYER_LOG_FORMAT', 'LOG_FORMAT') || 'json',
  MORPHEUS_RELAYER_LOG_LEVEL: get('MORPHEUS_RELAYER_LOG_LEVEL', 'LOG_LEVEL') || 'info',
  ORACLE_TIMEOUT: get('ORACLE_TIMEOUT') || '20s',
  ORACLE_SCRIPT_TIMEOUT_MS: get('ORACLE_SCRIPT_TIMEOUT_MS') || '2000',
  COMPUTE_SCRIPT_TIMEOUT_MS: get('COMPUTE_SCRIPT_TIMEOUT_MS') || '2000',
  PHALA_USE_DERIVED_KEYS: get('PHALA_USE_DERIVED_KEYS') || 'true',
  PHALA_EMIT_ATTESTATION: get('PHALA_EMIT_ATTESTATION') || 'true',
  PHALA_DSTACK_ENDPOINT: get('PHALA_DSTACK_ENDPOINT') || '/var/run/dstack.sock',
  PHALA_DSTACK_NEO_N3_KEY_PATH: get('PHALA_DSTACK_NEO_N3_KEY_PATH'),
  PHALA_DSTACK_NEOX_KEY_PATH: get('PHALA_DSTACK_NEOX_KEY_PATH'),
  PHALA_DSTACK_RELAYER_NEO_N3_KEY_PATH: get('PHALA_DSTACK_RELAYER_NEO_N3_KEY_PATH'),
  PHALA_DSTACK_RELAYER_NEOX_KEY_PATH: get('PHALA_DSTACK_RELAYER_NEOX_KEY_PATH'),
  PHALA_DSTACK_ORACLE_ENCRYPTION_KEY_PATH: get('PHALA_DSTACK_ORACLE_ENCRYPTION_KEY_PATH'),
  PHALA_ORACLE_KEYSTORE_PATH: get('PHALA_ORACLE_KEYSTORE_PATH') || '/data/morpheus-oracle-key.json',
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
  line('SUPABASE_SERVICE_ROLE_KEY', get('SUPABASE_SERVICE_ROLE_KEY', 'morpheus_SUPABASE_SERVICE_ROLE_KEY')), 
  line('MORPHEUS_RUNTIME_CONFIG_JSON', JSON.stringify(runtimeConfig)),
  line('MORPHEUS_PROVIDER_CONFIG_API_KEY', get('MORPHEUS_PROVIDER_CONFIG_API_KEY', 'ADMIN_CONSOLE_API_KEY')), 
  '',
  line('MORPHEUS_NETWORK', network),
  '',
  line('NEO_RPC_URL', get('NEO_RPC_URL') || trimString(registry.neo_n3?.rpc_url) || 'https://testnet1.neo.coz.io:443'),
  line('NEO_NETWORK_MAGIC', get('NEO_NETWORK_MAGIC') || String(registry.neo_n3?.network_magic || 894710606)),
  line('CONTRACT_MORPHEUS_ORACLE_HASH', get('CONTRACT_MORPHEUS_ORACLE_HASH') || trimString(registry.neo_n3?.contracts?.morpheus_oracle || '')),
  line('CONTRACT_ORACLE_CALLBACK_CONSUMER_HASH', get('CONTRACT_ORACLE_CALLBACK_CONSUMER_HASH') || trimString(registry.neo_n3?.contracts?.oracle_callback_consumer || '')),
  line('CONTRACT_MORPHEUS_DATAFEED_HASH', get('CONTRACT_MORPHEUS_DATAFEED_HASH') || trimString(registry.neo_n3?.contracts?.morpheus_datafeed || '')),
  line('PHALA_NEO_N3_WIF', get('PHALA_NEO_N3_WIF', 'NEO_TESTNET_WIF')), 
  line('PHALA_NEO_N3_PRIVATE_KEY', get('PHALA_NEO_N3_PRIVATE_KEY')), 
  line('MORPHEUS_RELAYER_NEO_N3_WIF', get('MORPHEUS_RELAYER_NEO_N3_WIF', 'PHALA_NEO_N3_WIF', 'NEO_TESTNET_WIF')), 
  line('MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY', get('MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY', 'PHALA_NEO_N3_PRIVATE_KEY')), 
  '',
  line('NEOX_RPC_URL', get('NEOX_RPC_URL', 'NEO_X_RPC_URL') || trimString(registry.neo_x?.rpc_url) || 'https://neoxt4seed1.ngd.network'),
  line('NEOX_CHAIN_ID', get('NEOX_CHAIN_ID', 'NEO_X_CHAIN_ID') || String(registry.neo_x?.chain_id || 12227332)),
  line('CONTRACT_MORPHEUS_ORACLE_X_ADDRESS', get('CONTRACT_MORPHEUS_ORACLE_X_ADDRESS') || trimString(registry.neo_x?.contracts?.morpheus_oracle_x || '')),
  line('CONTRACT_ORACLE_CALLBACK_CONSUMER_X_ADDRESS', get('CONTRACT_ORACLE_CALLBACK_CONSUMER_X_ADDRESS') || trimString(registry.neo_x?.contracts?.oracle_callback_consumer_x || '')),
  line('CONTRACT_MORPHEUS_DATAFEED_X_ADDRESS', get('CONTRACT_MORPHEUS_DATAFEED_X_ADDRESS') || trimString(registry.neo_x?.contracts?.morpheus_datafeed_x || '')),
  line('PHALA_NEOX_PRIVATE_KEY', get('PHALA_NEOX_PRIVATE_KEY', 'NEOX_PRIVATE_KEY')), 
  line('MORPHEUS_RELAYER_NEOX_PRIVATE_KEY', get('MORPHEUS_RELAYER_NEOX_PRIVATE_KEY', 'PHALA_NEOX_PRIVATE_KEY', 'NEOX_PRIVATE_KEY')), 
  '',
  line('MORPHEUS_FEED_PROJECT_SLUG', get('MORPHEUS_FEED_PROJECT_SLUG') || 'demo'),
  line('MORPHEUS_FEED_PROVIDER', get('MORPHEUS_FEED_PROVIDER') || 'twelvedata'),
  '',
  line('MORPHEUS_RELAYER_POLL_INTERVAL_MS', get('MORPHEUS_RELAYER_POLL_INTERVAL_MS') || '5000'),
  line('MORPHEUS_RELAYER_CONCURRENCY', get('MORPHEUS_RELAYER_CONCURRENCY') || '4'),
  line('MORPHEUS_RELAYER_MAX_BLOCKS_PER_TICK', get('MORPHEUS_RELAYER_MAX_BLOCKS_PER_TICK') || '250'),
  line('MORPHEUS_RELAYER_MAX_RETRIES', get('MORPHEUS_RELAYER_MAX_RETRIES') || '5'),
  line('MORPHEUS_RELAYER_RETRY_BASE_DELAY_MS', get('MORPHEUS_RELAYER_RETRY_BASE_DELAY_MS') || '5000'),
  line('MORPHEUS_RELAYER_RETRY_MAX_DELAY_MS', get('MORPHEUS_RELAYER_RETRY_MAX_DELAY_MS') || '300000'),
  line('MORPHEUS_RELAYER_PROCESSED_CACHE_SIZE', get('MORPHEUS_RELAYER_PROCESSED_CACHE_SIZE') || '5000'),
  line('MORPHEUS_RELAYER_DEAD_LETTER_LIMIT', get('MORPHEUS_RELAYER_DEAD_LETTER_LIMIT') || '500'),
  line('MORPHEUS_RELAYER_LOG_FORMAT', get('MORPHEUS_RELAYER_LOG_FORMAT', 'LOG_FORMAT') || 'json'),
  line('MORPHEUS_RELAYER_LOG_LEVEL', get('MORPHEUS_RELAYER_LOG_LEVEL', 'LOG_LEVEL') || 'info'),
  '',
];

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(`Wrote ${outputPath}`);
