import fs from 'node:fs/promises';
import path from 'node:path';
import { readMergedDotEnvFiles } from './lib-env.mjs';
import { normalizeMorpheusNetwork, reportPinnedNeoN3Roles } from './lib-neo-signers.mjs';

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
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

async function buildReport(label, filePaths, { allowMissing = false, network = '' } = {}) {
  const envPaths = Array.isArray(filePaths) ? filePaths : [filePaths];
  const exists = (await Promise.all(envPaths.map((filePath) => pathExists(filePath)))).some(
    Boolean
  );
  if (!exists) {
    return {
      label,
      env_path: envPaths[0],
      env_paths: envPaths,
      exists: false,
      ok: allowMissing,
      signers: [],
    };
  }

  const env = await readMergedDotEnvFiles(envPaths);
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
    env_path: envPaths[0],
    env_paths: envPaths,
    exists: true,
    ok: signers.every((entry) => entry.ok),
    signers,
  };
}

const repoRoot = process.cwd();
const reports = await Promise.all([
  buildReport('root_env', [path.resolve(repoRoot, '.env'), path.resolve(repoRoot, '.env.local')], {
    allowMissing: true,
  }),
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
