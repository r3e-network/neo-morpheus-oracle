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

async function readDotEnv(filePath) {
  try {
    return parseDotEnv(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function parseRuntimeConfig(env) {
  try {
    return JSON.parse(trimString(env.MORPHEUS_RUNTIME_CONFIG_JSON || '{}'));
  } catch {
    return {};
  }
}

async function buildReport(label, filePath, { allowMissing = false, network = '' } = {}) {
  const env = await readDotEnv(filePath);
  if (!env) {
    return {
      label,
      env_path: filePath,
      exists: false,
      ok: allowMissing,
      signers: [],
    };
  }
  const runtimeConfig = parseRuntimeConfig(env);
  const resolvedNetwork = normalizeMorpheusNetwork(
    network || env.MORPHEUS_NETWORK || runtimeConfig.MORPHEUS_NETWORK || 'testnet'
  );
  const signers = reportPinnedNeoN3Roles(
    resolvedNetwork,
    ['worker', 'relayer', 'updater', 'oracle_verifier'],
    { env: { ...runtimeConfig, ...env }, allowMissing }
  ).map((entry) => ({
    role: entry.role,
    network: entry.network,
    selected_source: entry.selected_source,
    selected_identity: entry.selected_identity,
    public_key: entry.public_key,
    pinned: entry.pinned,
    issues: entry.issues,
    ok: entry.ok,
  }));
  return {
    label,
    env_path: filePath,
    exists: true,
    ok: signers.every((entry) => entry.ok),
    signers,
  };
}

const repoRoot = process.cwd();
const reports = await Promise.all([
  buildReport('root_env', path.resolve(repoRoot, '.env'), { allowMissing: true }),
  buildReport('testnet_phala_env', path.resolve(repoRoot, 'deploy/phala/morpheus.testnet.env'), {
    allowMissing: false,
    network: 'testnet',
  }),
  buildReport('mainnet_phala_env', path.resolve(repoRoot, 'deploy/phala/morpheus.mainnet.env'), {
    allowMissing: false,
    network: 'mainnet',
  }),
]);

const output = {
  ok: reports.every((entry) => entry.ok),
  reports,
};

console.log(JSON.stringify(output, null, 2));
if (!output.ok) process.exitCode = 1;
