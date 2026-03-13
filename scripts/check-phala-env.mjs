import fs from 'node:fs/promises';
import path from 'node:path';

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
    const value = trimmed.slice(index + 1).trim();
    out[key] = value;
  }
  return out;
}

function parseRuntimeConfig(env) {
  try {
    return JSON.parse(trimString(env.MORPHEUS_RUNTIME_CONFIG_JSON || '{}'));
  } catch {
    return {};
  }
}

function getValue(env, runtimeConfig, key) {
  return trimString(env[key]) || trimString(runtimeConfig[key]);
}

function anyPresent(env, runtimeConfig, keys) {
  return keys.some((key) => getValue(env, runtimeConfig, key));
}

function isTrue(value) {
  const normalized = trimString(value).toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function resolveEnvPath() {
  const network = trimString(process.env.MORPHEUS_NETWORK || process.env.PHALA_ENV_NETWORK || 'mainnet') || 'mainnet';
  const configuredPath = trimString(process.env.PHALA_ENV_FILE || '');
  return configuredPath
    ? path.resolve(process.cwd(), configuredPath)
    : path.resolve(process.cwd(), `deploy/phala/morpheus.${network}.env`);
}

const required = [
  'PHALA_SHARED_SECRET',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'MORPHEUS_NETWORK',
  'NEO_RPC_URL',
  'NEO_NETWORK_MAGIC',
  'CONTRACT_MORPHEUS_ORACLE_HASH',
  'CONTRACT_ORACLE_CALLBACK_CONSUMER_HASH',
];

const requiredEither = [
  ['PHALA_NEO_N3_WIF', 'PHALA_NEO_N3_PRIVATE_KEY'],
  ['MORPHEUS_RELAYER_NEO_N3_WIF', 'MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY'],
];

const neoXFields = [
  'NEOX_RPC_URL',
  'NEOX_CHAIN_ID',
  'CONTRACT_MORPHEUS_ORACLE_X_ADDRESS',
  'CONTRACT_ORACLE_CALLBACK_CONSUMER_X_ADDRESS',
  'MORPHEUS_RELAYER_NEOX_PRIVATE_KEY',
];

const envPath = resolveEnvPath();
const raw = await fs.readFile(envPath, 'utf8');
const env = parseDotEnv(raw);
const runtimeConfig = parseRuntimeConfig(env);
const missing = required.filter((key) => !getValue(env, runtimeConfig, key));
const useDerivedKeys = isTrue(getValue(env, runtimeConfig, 'PHALA_USE_DERIVED_KEYS'));
const missingEither = requiredEither.filter((group) => {
  if (useDerivedKeys && group[0].startsWith('PHALA_NEO_N3_')) return false;
  return !group.some((key) => getValue(env, runtimeConfig, key));
});

const neoXEnabled = anyPresent(env, runtimeConfig, [
  'CONTRACT_MORPHEUS_ORACLE_X_ADDRESS',
  'CONTRACT_ORACLE_CALLBACK_CONSUMER_X_ADDRESS',
  'CONTRACT_MORPHEUS_DATAFEED_X_ADDRESS',
]);
const missingNeoX = neoXEnabled ? neoXFields.filter((key) => !getValue(env, runtimeConfig, key)) : [];

const report = {
  env_path: envPath,
  mode: neoXEnabled ? 'n3+neox' : 'n3-only',
  missing_required: missing,
  missing_either_of: missingEither,
  missing_neox_required: missingNeoX,
  ok: missing.length === 0 && missingEither.length === 0 && missingNeoX.length === 0,
};

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
