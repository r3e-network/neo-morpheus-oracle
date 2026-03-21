import fs from 'node:fs/promises';
import path from 'node:path';
import { reportPinnedNeoN3Roles, normalizeMorpheusNetwork } from './lib-neo-signers.mjs';

const envPath = path.resolve(process.cwd(), '.env');

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
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function getValue(env, keys) {
  for (const key of keys) {
    const value = trimString(env[key]);
    if (value) return value;
  }
  return '';
}

function hasAny(env, keys) {
  return keys.some((key) => trimString(env[key]));
}

const raw = await fs.readFile(envPath, 'utf8');
const env = parseDotEnv(raw);

const required = {
  web_public: [
    ['NEXT_PUBLIC_APP_NAME'],
    ['NEXT_PUBLIC_APP_URL'],
    [
      'MORPHEUS_RUNTIME_URL',
      'MORPHEUS_MAINNET_RUNTIME_URL',
      'MORPHEUS_TESTNET_RUNTIME_URL',
      'PHALA_API_URL',
    ],
    ['NEXT_PUBLIC_SUPABASE_URL', 'morpheus_SUPABASE_URL'],
    ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_morpheus_SUPABASE_ANON_KEY'],
  ],
  web_server: [
    [
      'MORPHEUS_RUNTIME_URL',
      'MORPHEUS_MAINNET_RUNTIME_URL',
      'MORPHEUS_TESTNET_RUNTIME_URL',
      'PHALA_API_URL',
    ],
    ['SUPABASE_URL', 'morpheus_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'],
    [
      'SUPABASE_SECRET_KEY',
      'morpheus_SUPABASE_SECRET_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'morpheus_SUPABASE_SERVICE_ROLE_KEY',
    ],
    ['MORPHEUS_RUNTIME_TOKEN', 'PHALA_API_TOKEN', 'PHALA_SHARED_SECRET'],
    ['MORPHEUS_NETWORK'],
    ['NEO_RPC_URL'],
    ['NEO_NETWORK_MAGIC'],
    ['CONTRACT_MORPHEUS_ORACLE_HASH'],
    ['CONTRACT_ORACLE_CALLBACK_CONSUMER_HASH'],
  ],
  feed_ops: [
    ['MORPHEUS_FEED_PROVIDER'],
    ['MORPHEUS_FEED_PROJECT_SLUG'],
    ['CRON_SECRET'],
    ['MORPHEUS_FEED_SYMBOLS'],
  ],
  n3_scripts: [
    [
      'NEO_N3_WIF',
      'NEO_TESTNET_WIF',
      'PHALA_NEO_N3_WIF',
      'PHALA_NEO_N3_PRIVATE_KEY',
      'MORPHEUS_RELAYER_NEO_N3_WIF',
      'MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY',
    ],
  ],
};

const report = {
  env_path: envPath,
  missing: {},
  optional_recommendations: {},
  mode: {
    neo_n3_enabled: Boolean(
      getValue(env, ['CONTRACT_MORPHEUS_ORACLE_HASH', 'CONTRACT_ORACLE_CALLBACK_CONSUMER_HASH'])
    ),
    neo_x_enabled: hasAny(env, [
      'CONTRACT_MORPHEUS_ORACLE_X_ADDRESS',
      'CONTRACT_ORACLE_CALLBACK_CONSUMER_X_ADDRESS',
      'CONTRACT_MORPHEUS_DATAFEED_X_ADDRESS',
    ]),
  },
};

const signerNetwork = normalizeMorpheusNetwork(env.MORPHEUS_NETWORK || 'testnet');
report.neo_n3_signers = reportPinnedNeoN3Roles(
  signerNetwork,
  ['worker', 'relayer', 'updater', 'oracle_verifier'],
  { env, allowMissing: true }
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

for (const [section, groups] of Object.entries(required)) {
  report.missing[section] = groups
    .filter((keys) => !getValue(env, keys))
    .map((keys) => keys.join(' | '));
}

if (report.mode.neo_x_enabled) {
  const neoxRequired = [
    ['NEOX_RPC_URL', 'NEO_X_RPC_URL'],
    ['NEOX_CHAIN_ID', 'NEO_X_CHAIN_ID'],
    ['CONTRACT_MORPHEUS_ORACLE_X_ADDRESS'],
    ['CONTRACT_ORACLE_CALLBACK_CONSUMER_X_ADDRESS'],
    ['NEOX_PRIVATE_KEY', 'PHALA_NEOX_PRIVATE_KEY', 'MORPHEUS_RELAYER_NEOX_PRIVATE_KEY'],
  ];
  report.missing.neo_x = neoxRequired
    .filter((keys) => !getValue(env, keys))
    .map((keys) => keys.join(' | '));
} else {
  report.missing.neo_x = [];
}

report.optional_recommendations.admin_api = [
  ['MORPHEUS_PROVIDER_CONFIG_API_KEY', 'ADMIN_CONSOLE_API_KEY'].join(' | '),
].filter((key) => !getValue(env, key.split(' | ')));

report.optional_recommendations.feed_sync = [
  ['MORPHEUS_FEED_PROVIDERS'],
  ['MORPHEUS_FEED_CHANGE_THRESHOLD_BPS'],
  ['MORPHEUS_FEED_MIN_UPDATE_INTERVAL_MS'],
]
  .filter((keys) => !getValue(env, keys))
  .map((keys) => keys.join(' | '));

report.optional_recommendations.oracle_verifier = [
  [
    'MORPHEUS_ORACLE_VERIFIER_WIF',
    'MORPHEUS_ORACLE_VERIFIER_PRIVATE_KEY',
    'PHALA_ORACLE_VERIFIER_WIF',
    'PHALA_ORACLE_VERIFIER_PRIVATE_KEY',
  ],
]
  .filter((keys) => !getValue(env, keys))
  .map((keys) => keys.join(' | '));

report.ok =
  Object.values(report.missing).every((items) => items.length === 0) &&
  report.neo_n3_signers.every((entry) => entry.ok);

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
