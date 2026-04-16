import fs from 'node:fs/promises';
import path from 'node:path';
import { NEO_N3_SIGNER_ENV_KEYS } from './lib-neo-signers.mjs';

const repoRoot = process.cwd();

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function stableStringify(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(',')}}`;
}

function parseArgs(argv = process.argv.slice(2)) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === '--output') {
      parsed.output = argv[index + 1] || '';
      index += 1;
    }
  }
  return parsed;
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

async function readEnvFile(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return parseDotEnv(raw);
}

async function readOptionalEnvFile(filePath) {
  try {
    return await readEnvFile(filePath);
  } catch {
    return {};
  }
}

function line(key, value) {
  return `${key}=${value ?? ''}`;
}

function pick(envs, ...keys) {
  for (const env of envs) {
    for (const key of keys) {
      const value = trimString(env?.[key]);
      if (value) return value;
    }
  }
  return '';
}

function parseRuntimeConfig(env) {
  const raw = trimString(env?.MORPHEUS_RUNTIME_CONFIG_JSON || '');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function resolveRuntimeValue(key, fileEnv, runtimeConfig) {
  const direct = trimString(fileEnv?.[key]);
  if (direct) return direct;
  const packed = runtimeConfig?.[key];
  if (packed === undefined || packed === null) return '';
  return String(packed).trim();
}

function buildSharedRuntimeConfig(mainnetRuntimeConfig, testnetRuntimeConfig) {
  const shared = {};
  const keys = new Set([
    ...Object.keys(mainnetRuntimeConfig || {}),
    ...Object.keys(testnetRuntimeConfig || {}),
  ]);
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(mainnetRuntimeConfig, key)) continue;
    if (!Object.prototype.hasOwnProperty.call(testnetRuntimeConfig, key)) continue;
    if (stableStringify(mainnetRuntimeConfig[key]) !== stableStringify(testnetRuntimeConfig[key])) {
      continue;
    }
    shared[key] = mainnetRuntimeConfig[key];
  }
  return shared;
}

function resolveSharedHubSignerValue(
  key,
  mainnetEnv,
  testnetEnv,
  mainnetRuntimeConfig,
  testnetRuntimeConfig
) {
  if (key.endsWith('_MAINNET')) {
    return resolveRuntimeValue(key.slice(0, -8), mainnetEnv, mainnetRuntimeConfig);
  }
  if (key.endsWith('_TESTNET')) {
    return resolveRuntimeValue(key.slice(0, -8), testnetEnv, testnetRuntimeConfig);
  }
  if (key === 'NEO_N3_WIF') {
    return resolveRuntimeValue(key, mainnetEnv, mainnetRuntimeConfig);
  }
  if (key === 'NEO_TESTNET_WIF') {
    return resolveRuntimeValue(key, testnetEnv, testnetRuntimeConfig);
  }
  return '';
}

const args = parseArgs();
const outputPath = path.resolve(
  repoRoot,
  trimString(args.output) || 'deploy/phala/morpheus.hub.env'
);

const rootEnv = await readOptionalEnvFile(path.resolve(repoRoot, '.env'));
const localEnv = await readOptionalEnvFile(path.resolve(repoRoot, '.env.local'));
const mainnetEnv = await readEnvFile(path.resolve(repoRoot, 'deploy/phala/morpheus.mainnet.env'));
const testnetEnv = await readEnvFile(path.resolve(repoRoot, 'deploy/phala/morpheus.testnet.env'));
const envs = [localEnv, rootEnv, mainnetEnv, testnetEnv];
const mainnetRuntimeConfig = parseRuntimeConfig(mainnetEnv);
const testnetRuntimeConfig = parseRuntimeConfig(testnetEnv);
const sharedRuntimeConfig = buildSharedRuntimeConfig(mainnetRuntimeConfig, testnetRuntimeConfig);

const requestHubDomain =
  pick(envs, 'MORPHEUS_REQUEST_HUB_CUSTOM_DOMAIN', 'MORPHEUS_SHARED_CUSTOM_DOMAIN') ||
  'morpheus-hub.meshmini.app';

const lines = [
  '# Generated from deploy/phala/morpheus.mainnet.env and morpheus.testnet.env; do not edit.',
  line('MORPHEUS_PHALA_WORKER_IMAGE', pick(envs, 'MORPHEUS_PHALA_WORKER_IMAGE')),
  line('MORPHEUS_RELAYER_IMAGE', pick(envs, 'MORPHEUS_RELAYER_IMAGE')),
  '',
  line('MORPHEUS_PUBLIC_PORT', pick(envs, 'MORPHEUS_PUBLIC_PORT') || '3000'),
  line('PHALA_SHARED_SECRET', pick(envs, 'PHALA_SHARED_SECRET')),
  line('PHALA_API_TOKEN', pick(envs, 'PHALA_API_TOKEN')),
  line('SUPABASE_URL', pick(envs, 'SUPABASE_URL')),
  line('SUPABASE_SECRET_KEY', pick(envs, 'SUPABASE_SECRET_KEY')),
  line('SUPABASE_SERVICE_ROLE_KEY', pick(envs, 'SUPABASE_SERVICE_ROLE_KEY')),
  line('NEXT_PUBLIC_SUPABASE_URL', pick(envs, 'NEXT_PUBLIC_SUPABASE_URL')),
  line('NEXT_PUBLIC_SUPABASE_ANON_KEY', pick(envs, 'NEXT_PUBLIC_SUPABASE_ANON_KEY')),
  '',
  line('UPSTASH_REDIS_REST_URL', pick(envs, 'UPSTASH_REDIS_REST_URL')),
  line('UPSTASH_REDIS_REST_TOKEN', pick(envs, 'UPSTASH_REDIS_REST_TOKEN')),
  line('MORPHEUS_UPSTASH_GUARDS_ENABLED', pick(envs, 'MORPHEUS_UPSTASH_GUARDS_ENABLED') || 'true'),
  line('MORPHEUS_UPSTASH_FAIL_CLOSED', pick(envs, 'MORPHEUS_UPSTASH_FAIL_CLOSED') || 'false'),
  line('MORPHEUS_FEED_PAIR_REGISTRY_JSON', pick(envs, 'MORPHEUS_FEED_PAIR_REGISTRY_JSON')),
  '',
  line('CLOUDFLARE_DNS_API_TOKEN', pick(envs, 'CLOUDFLARE_DNS_API_TOKEN')),
  line('CERTBOT_EMAIL', pick(envs, 'CERTBOT_EMAIL')),
  line('MORPHEUS_CUSTOM_DOMAIN', requestHubDomain),
  line('MORPHEUS_INGRESS_PORT', pick(envs, 'MORPHEUS_INGRESS_PORT') || '443'),
  line('MORPHEUS_INGRESS_SET_CAA', pick(envs, 'MORPHEUS_INGRESS_SET_CAA') || 'false'),
  '',
  line('MAINNET_RUNTIME_CONFIG_JSON', trimString(mainnetEnv.MORPHEUS_RUNTIME_CONFIG_JSON)),
  line('TESTNET_RUNTIME_CONFIG_JSON', trimString(testnetEnv.MORPHEUS_RUNTIME_CONFIG_JSON)),
  line('SHARED_RUNTIME_CONFIG_JSON', JSON.stringify(sharedRuntimeConfig)),
  '',
  ...NEO_N3_SIGNER_ENV_KEYS.map((key) =>
    line(
      key,
      resolveSharedHubSignerValue(
        key,
        mainnetEnv,
        testnetEnv,
        mainnetRuntimeConfig,
        testnetRuntimeConfig
      )
    )
  ),
  '',
];

await fs.mkdir(path.dirname(outputPath), { recursive: true });
const rendered = `${lines.join('\n')}\n`;
await fs.writeFile(outputPath, rendered, 'utf8');

const requiredKeys = [
  'PHALA_SHARED_SECRET',
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'MAINNET_RUNTIME_CONFIG_JSON',
  'TESTNET_RUNTIME_CONFIG_JSON',
  'SHARED_RUNTIME_CONFIG_JSON',
];
for (const key of requiredKeys) {
  if (!rendered.includes(key + '=') || rendered.includes(key + '=\n')) {
    console.error(`WARN: ${key} appears empty in rendered env`);
    process.exitCode = 1;
  }
}

console.log(JSON.stringify({ output: path.relative(repoRoot, outputPath) }, null, 2));
