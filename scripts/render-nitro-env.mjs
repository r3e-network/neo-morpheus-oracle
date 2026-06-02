import fs from 'node:fs/promises';
import path from 'node:path';
import { readMergedDotEnvFiles } from './lib-env.mjs';
import { reportPinnedNeoN3Role } from './lib-neo-signers.mjs';

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    network: 'mainnet',
    outputDir: '',
    source: [],
    allowMissing: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--network') out.network = argv[++index] || out.network;
    else if (arg.startsWith('--network=')) out.network = arg.slice('--network='.length);
    else if (arg === '--output-dir') out.outputDir = argv[++index] || out.outputDir;
    else if (arg.startsWith('--output-dir=')) out.outputDir = arg.slice('--output-dir='.length);
    else if (arg === '--source') out.source.push(argv[++index] || '');
    else if (arg.startsWith('--source=')) out.source.push(arg.slice('--source='.length));
    else if (arg === '--allow-missing') out.allowMissing = true;
  }
  return out;
}

function pick(env, keys) {
  for (const key of keys) {
    const value = trimString(env[key]);
    if (value) return value;
  }
  return '';
}

function line(key, value) {
  return `${key}=${String(value || '').replace(/\n/g, '')}`;
}

async function write0600(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, { mode: 0o600 });
  await fs.chmod(filePath, 0o600);
}

const args = parseArgs();
const repoRoot = process.cwd();
const network = trimString(args.network) || 'mainnet';
const suffix = network === 'mainnet' ? 'MAINNET' : 'TESTNET';
const outputDir = path.resolve(args.outputDir || '.secrets/nitro');
const sources = args.source.filter(Boolean).length
  ? args.source
  : [
      '.env',
      '.env.local',
      `deploy/phala/morpheus.${network}.env`,
      'deploy/phala/morpheus.hub.env',
      '.automation-logs/hourly-full-stack-validation/20260522-090604/workspace-secrets.env',
    ];
const env = await readMergedDotEnvFiles(sources.map((entry) => path.resolve(repoRoot, entry)));

const signerReports = ['updater', 'oracle_verifier'].map((role) =>
  reportPinnedNeoN3Role(network, role, { env, allowMissing: false })
);
const missingRoles = signerReports
  .filter((entry) => !entry.ok || !entry.materialized)
  .map((entry) => ({
    role: entry.role,
    pinned: entry.pinned,
    issues: entry.issues,
  }));

if (missingRoles.length && !args.allowMissing) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        reason: 'missing pinned Nitro signer material',
        missing_roles: missingRoles,
        checked_sources: sources,
      },
      null,
      2
    )
  );
  process.exit(2);
}

const runtimeToken = pick(env, [
  'NITRO_SIGNER_TOKEN',
  'MORPHEUS_RUNTIME_TOKEN',
  'PHALA_SHARED_SECRET',
]);
const signerEnv =
  [
    line('MORPHEUS_NETWORK', network),
    line('PORT', '8080'),
    line('NITRO_SIGNER_VSOCK_PORT', '8787'),
    line('MORPHEUS_ALLOW_UNPINNED_SIGNERS', pick(env, ['MORPHEUS_ALLOW_UNPINNED_SIGNERS']) || 'true'),
    line('NITRO_SIGNER_TOKEN', runtimeToken),
    line('MORPHEUS_RUNTIME_TOKEN', runtimeToken),
    line(
      `MORPHEUS_UPDATER_NEO_N3_WIF_${suffix}`,
      pick(env, [`MORPHEUS_UPDATER_NEO_N3_WIF_${suffix}`, 'MORPHEUS_UPDATER_NEO_N3_WIF'])
    ),
    line(
      `MORPHEUS_UPDATER_NEO_N3_PRIVATE_KEY_${suffix}`,
      pick(env, [
        `MORPHEUS_UPDATER_NEO_N3_PRIVATE_KEY_${suffix}`,
        'MORPHEUS_UPDATER_NEO_N3_PRIVATE_KEY',
      ])
    ),
    line(
      `MORPHEUS_ORACLE_VERIFIER_WIF_${suffix}`,
      pick(env, [
        `MORPHEUS_ORACLE_VERIFIER_WIF_${suffix}`,
        `PHALA_ORACLE_VERIFIER_WIF_${suffix}`,
        'MORPHEUS_ORACLE_VERIFIER_WIF',
        'PHALA_ORACLE_VERIFIER_WIF',
      ])
    ),
    line(
      `MORPHEUS_ORACLE_VERIFIER_PRIVATE_KEY_${suffix}`,
      pick(env, [
        `MORPHEUS_ORACLE_VERIFIER_PRIVATE_KEY_${suffix}`,
        `PHALA_ORACLE_VERIFIER_PRIVATE_KEY_${suffix}`,
        'MORPHEUS_ORACLE_VERIFIER_PRIVATE_KEY',
        'PHALA_ORACLE_VERIFIER_PRIVATE_KEY',
      ])
    ),
  ].join('\n') + '\n';

const relayerEnv =
  [
    line('MORPHEUS_NETWORK', network),
    line('MORPHEUS_RELAYER_MODE', 'combined'),
    line('MORPHEUS_ACTIVE_CHAINS', 'neo_n3'),
    line('MORPHEUS_RUNTIME_URL', 'http://127.0.0.1:8787'),
    line('PHALA_API_URL', 'http://127.0.0.1:8787'),
    line('PHALA_USE_DERIVED_KEYS', 'true'),
    line('MORPHEUS_RUNTIME_TOKEN', runtimeToken),
    line('PHALA_SHARED_SECRET', runtimeToken),
    line(
      'SUPABASE_URL',
      pick(env, ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'morpheus_SUPABASE_URL'])
    ),
    line(
      'SUPABASE_SECRET_KEY',
      pick(env, [
        'SUPABASE_SECRET_KEY',
        'SUPABASE_SERVICE_ROLE_KEY',
        'morpheus_SUPABASE_SECRET_KEY',
        'morpheus_SUPABASE_SERVICE_ROLE_KEY',
      ])
    ),
    line(
      'MORPHEUS_BETTERSTACK_RELAYER_HEARTBEAT_URL',
      pick(env, ['MORPHEUS_BETTERSTACK_RELAYER_HEARTBEAT_URL'])
    ),
    line(
      'MORPHEUS_BETTERSTACK_RELAYER_FEED_HEARTBEAT_URL',
      pick(env, ['MORPHEUS_BETTERSTACK_RELAYER_FEED_HEARTBEAT_URL'])
    ),
    line(
      'MORPHEUS_BETTERSTACK_RELAYER_FAILURE_URL',
      pick(env, ['MORPHEUS_BETTERSTACK_RELAYER_FAILURE_URL'])
    ),
  ].join('\n') + '\n';

await write0600(path.join(outputDir, 'morpheus-nitro-signer.env'), signerEnv);
await write0600(path.join(outputDir, 'morpheus-relayer.env'), relayerEnv);

console.log(
  JSON.stringify(
    {
      ok: missingRoles.length === 0,
      output_dir: outputDir,
      signer_env: path.join(outputDir, 'morpheus-nitro-signer.env'),
      relayer_env: path.join(outputDir, 'morpheus-relayer.env'),
      checked_sources: sources,
      signer_roles: signerReports.map((entry) => ({
        role: entry.role,
        ok: entry.ok,
        selected_source: entry.selected_source,
        selected_identity: entry.selected_identity,
      })),
    },
    null,
    2
  )
);
