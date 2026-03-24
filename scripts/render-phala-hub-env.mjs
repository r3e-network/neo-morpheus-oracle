import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
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

const requestHubDomain = pick(
  envs,
  'MORPHEUS_REQUEST_HUB_CUSTOM_DOMAIN',
  'MORPHEUS_SHARED_CUSTOM_DOMAIN'
) || 'morpheus.meshmini.app';

const lines = [
  '# Generated from deploy/phala/morpheus.mainnet.env and morpheus.testnet.env; do not edit.',
  line('MORPHEUS_PHALA_WORKER_IMAGE', pick(envs, 'MORPHEUS_PHALA_WORKER_IMAGE')),
  line('MORPHEUS_RELAYER_IMAGE', pick(envs, 'MORPHEUS_RELAYER_IMAGE')),
  '',
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
  line(
    'MORPHEUS_UPSTASH_GUARDS_ENABLED',
    pick(envs, 'MORPHEUS_UPSTASH_GUARDS_ENABLED') || 'true'
  ),
  line(
    'MORPHEUS_UPSTASH_FAIL_CLOSED',
    pick(envs, 'MORPHEUS_UPSTASH_FAIL_CLOSED') || 'false'
  ),
  '',
  line('CLOUDFLARE_DNS_API_TOKEN', pick(envs, 'CLOUDFLARE_DNS_API_TOKEN')),
  line('CERTBOT_EMAIL', pick(envs, 'CERTBOT_EMAIL')),
  line('MORPHEUS_CUSTOM_DOMAIN', requestHubDomain),
  line('MORPHEUS_INGRESS_PORT', pick(envs, 'MORPHEUS_INGRESS_PORT') || '443'),
  line(
    'MORPHEUS_INGRESS_SET_CAA',
    pick(envs, 'MORPHEUS_INGRESS_SET_CAA') || 'false'
  ),
  '',
  line('MAINNET_RUNTIME_CONFIG_JSON', trimString(mainnetEnv.MORPHEUS_RUNTIME_CONFIG_JSON)),
  line('TESTNET_RUNTIME_CONFIG_JSON', trimString(testnetEnv.MORPHEUS_RUNTIME_CONFIG_JSON)),
  '',
];

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(JSON.stringify({ output: path.relative(repoRoot, outputPath) }, null, 2));
