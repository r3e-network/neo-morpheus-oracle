import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeMorpheusNetwork, reportPinnedNeoN3Roles } from './lib-neo-signers.mjs';

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

function isTrue(value) {
  const normalized = trimString(value).toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function resolveEnvPath() {
  const network =
    trimString(process.env.MORPHEUS_NETWORK || process.env.PHALA_ENV_NETWORK || 'mainnet') ||
    'mainnet';
  const configuredPath = trimString(process.env.PHALA_ENV_FILE || '');
  return configuredPath
    ? path.resolve(process.cwd(), configuredPath)
    : path.resolve(process.cwd(), `deploy/phala/morpheus.${network}.env`);
}

const required = [
  'PHALA_SHARED_SECRET',
  'SUPABASE_URL',
  'MORPHEUS_NETWORK',
  'NEO_RPC_URL',
  'NEO_NETWORK_MAGIC',
  'CONTRACT_MORPHEUS_ORACLE_HASH',
  'CONTRACT_ORACLE_CALLBACK_CONSUMER_HASH',
];

const requiredEither = [
  ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
  ['PHALA_NEO_N3_WIF', 'PHALA_NEO_N3_PRIVATE_KEY'],
  ['MORPHEUS_RELAYER_NEO_N3_WIF', 'MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY'],
];

const envPath = resolveEnvPath();
const raw = await fs.readFile(envPath, 'utf8');
const env = parseDotEnv(raw);
const runtimeConfig = parseRuntimeConfig(env);
const missing = required.filter((key) => !getValue(env, runtimeConfig, key));
const useDerivedKeys = isTrue(getValue(env, runtimeConfig, 'PHALA_USE_DERIVED_KEYS'));
const missingEither = requiredEither.filter((group) => {
  if (
    useDerivedKeys &&
    (group[0].startsWith('PHALA_NEO_N3_') || group[0].startsWith('MORPHEUS_RELAYER_NEO_N3_'))
  ) {
    return false;
  }
  return !group.some((key) => getValue(env, runtimeConfig, key));
});

const report = {
  env_path: envPath,
  mode: 'n3-only',
  missing_required: missing,
  missing_either_of: missingEither,
  optional_recommendations: {
    oracle_verifier: [],
  },
  ok: missing.length === 0 && missingEither.length === 0,
};

report.neo_n3_signers = reportPinnedNeoN3Roles(
  normalizeMorpheusNetwork(getValue(env, runtimeConfig, 'MORPHEUS_NETWORK') || 'testnet'),
  ['worker', 'relayer', 'updater', 'oracle_verifier'],
  { env: { ...runtimeConfig, ...env }, allowMissing: false }
).map((entry) => ({
  network: entry.network,
  role: entry.role,
  pinned: entry.pinned,
  selected_source: entry.selected_source,
  selected_identity: entry.selected_identity,
  public_key: entry.public_key,
  issues: entry.issues,
  ok: entry.ok,
}));

const explicitOracleVerifierKeys = [
  'MORPHEUS_ORACLE_VERIFIER_PRIVATE_KEY',
  'MORPHEUS_ORACLE_VERIFIER_WIF',
  'PHALA_ORACLE_VERIFIER_PRIVATE_KEY',
  'PHALA_ORACLE_VERIFIER_WIF',
];

if (!explicitOracleVerifierKeys.some((key) => getValue(env, runtimeConfig, key))) {
  report.optional_recommendations.oracle_verifier.push(explicitOracleVerifierKeys.join(' | '));
}

report.ok = report.ok && report.neo_n3_signers.every((entry) => entry.ok);

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
