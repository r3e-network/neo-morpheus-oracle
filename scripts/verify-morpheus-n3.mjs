import fs from 'node:fs/promises';
import path from 'node:path';
import { rpc as neoRpc, wallet } from '@cityofzion/neon-js';
import { loadDotEnv } from './lib-env.mjs';
import {
  resolvePinnedNeoN3UpdaterHash,
  resolvePinnedNeoN3VerifierPublicKey,
} from './lib-neo-signers.mjs';
import {
  detectMorpheusOracleInterface,
  resolveNetworkScopedValue,
  snapshotEnv,
} from './lib-verify-morpheus-n3.mjs';

const CONTRACT_ENV_KEYS = [
  'CONTRACT_MORPHEUS_ORACLE_HASH',
  'CONTRACT_MORPHEUS_ORACLE_HASH_MAINNET',
  'CONTRACT_MORPHEUS_ORACLE_HASH_TESTNET',
  'CONTRACT_ORACLE_CALLBACK_CONSUMER_HASH',
  'CONTRACT_ORACLE_CALLBACK_CONSUMER_HASH_MAINNET',
  'CONTRACT_ORACLE_CALLBACK_CONSUMER_HASH_TESTNET',
];

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function strip0x(value) {
  return trimString(value).replace(/^0x/i, '').toLowerCase();
}

function normalizeHash160(value) {
  const raw = trimString(value);
  if (!raw) return '';
  if (wallet.isAddress(raw)) {
    return `0x${wallet.getScriptHashFromAddress(raw).toLowerCase()}`;
  }
  const hex = strip0x(raw);
  return /^[0-9a-f]{40}$/.test(hex) ? `0x${hex}` : '';
}

function parseStackItem(item) {
  if (!item || typeof item !== 'object') return null;
  const type = trimString(item.type).toLowerCase();
  switch (type) {
    case 'hash160':
    case 'hash256':
    case 'string':
      return String(item.value ?? '');
    case 'integer':
      return String(item.value ?? '0');
    case 'boolean':
      return Boolean(item.value);
    case 'bytestring':
    case 'bytearray': {
      const raw = trimString(item.value);
      if (!raw) return '';
      try {
        const bytes = Buffer.from(raw, 'base64');
        if (bytes.length === 20) {
          return `0x${Buffer.from(bytes).reverse().toString('hex')}`;
        }
        if (bytes.length === 33 || bytes.length === 65) {
          return bytes.toString('hex');
        }
        const text = bytes.toString('utf8');
        return /^[\x09\x0a\x0d\x20-\x7e]*$/.test(text) ? text : bytes.toString('hex');
      } catch {
        return raw;
      }
    }
    default:
      return item.value ?? null;
  }
}

function isTransientRpcError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /HTTP code 502|HTTP code 503|HTTP code 504|ECONNRESET|ETIMEDOUT|socket hang up|fetch failed/i.test(
    message
  );
}

async function withRetries(label, task, attempts = 5) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (!isTransientRpcError(error) || attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  throw new Error(
    `${label} failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}

async function loadRegistry(network) {
  const filePath = path.resolve('config/networks', `${network}.json`);
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function loadDeploymentRegistry(network) {
  const filePath = path.resolve('examples', 'deployments', `${network}.json`);
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return {};
    throw error;
  }
}

async function loadEnvSnapshot(filePath) {
  const text = await fs.readFile(filePath, 'utf8');
  const snapshot = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = trimString(line);
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const separatorIndex = trimmed.indexOf('=');
    const key = trimString(trimmed.slice(0, separatorIndex));
    let value = trimmed.slice(separatorIndex + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    snapshot[key] = value;
  }
  return snapshot;
}

async function invokeRead(rpcClient, contractHash, method, params = []) {
  const result = await withRetries(`invokeRead:${method}`, () =>
    rpcClient.invokeFunction(contractHash, method, params)
  );
  if (String(result.state || '').toUpperCase() === 'FAULT') {
    throw new Error(`${method} faulted: ${result.exception || 'unknown error'}`);
  }
  return parseStackItem(result.stack?.[0]);
}

async function loadContractMethods(rpcClient, contractHash) {
  const state = await withRetries(`getContractState:${contractHash}`, () =>
    rpcClient.getContractState(contractHash)
  );
  return new Set(
    (state.manifest?.abi?.methods || []).map(
      (method) => `${method.name}/${method.parameters?.length ?? 0}`
    )
  );
}

function optionalBoolean(value) {
  return value === null || value === undefined ? null : Boolean(value);
}

const requestedNetwork = trimString(process.env.MORPHEUS_NETWORK || '');
const requestedRpcUrl = trimString(process.env.NEO_RPC_URL || '');
const explicitContractEnvSnapshot = snapshotEnv(CONTRACT_ENV_KEYS);
await loadDotEnv();
const network =
  trimString(requestedNetwork || process.env.MORPHEUS_NETWORK || 'testnet') || 'testnet';
const selectedPhalaEnvPath = path.resolve('deploy', 'phala', `morpheus.${network}.env`);
await loadDotEnv(selectedPhalaEnvPath, { override: true });
const signerEnvSnapshot = await loadEnvSnapshot(selectedPhalaEnvPath);

const registry = await loadRegistry(network);
const deployments = await loadDeploymentRegistry(network);
const rpcUrl = trimString(
  requestedRpcUrl || process.env.NEO_RPC_URL || registry.neo_n3?.rpc_url || ''
);
const registryOracleHash =
  deployments?.neo_n3?.oracle_hash || registry.neo_n3?.contracts?.morpheus_oracle || '';
const registryCallbackHash =
  deployments?.neo_n3?.example_consumer_hash ||
  registry.neo_n3?.contracts?.oracle_callback_consumer ||
  '';
const candidateOracleHash = trimString(
  resolveNetworkScopedValue({
    network,
    explicitEnv: explicitContractEnvSnapshot,
    selectedEnv: signerEnvSnapshot,
    loadedEnv: process.env,
    genericKey: 'CONTRACT_MORPHEUS_ORACLE_HASH',
    mainnetKey: 'CONTRACT_MORPHEUS_ORACLE_HASH_MAINNET',
    testnetKey: 'CONTRACT_MORPHEUS_ORACLE_HASH_TESTNET',
    registryValue: registryOracleHash,
  })
);
const oracleHash = normalizeHash160(candidateOracleHash);
const callbackHash = normalizeHash160(
  resolveNetworkScopedValue({
    network,
    explicitEnv: explicitContractEnvSnapshot,
    selectedEnv: signerEnvSnapshot,
    loadedEnv: process.env,
    genericKey: 'CONTRACT_ORACLE_CALLBACK_CONSUMER_HASH',
    mainnetKey: 'CONTRACT_ORACLE_CALLBACK_CONSUMER_HASH_MAINNET',
    testnetKey: 'CONTRACT_ORACLE_CALLBACK_CONSUMER_HASH_TESTNET',
    registryValue: registryCallbackHash,
  })
);
const expectedUpdater = resolvePinnedNeoN3UpdaterHash(network, signerEnvSnapshot);
const expectedVerifierPublicKey = resolvePinnedNeoN3VerifierPublicKey(network, signerEnvSnapshot);

if (!rpcUrl) throw new Error('NEO_RPC_URL is required');
if (!oracleHash) throw new Error('MorpheusOracle hash is required');
if (!callbackHash) throw new Error('OracleCallbackConsumer hash is required');

const rpcClient = new neoRpc.RPCClient(rpcUrl);
const oracleMethods = await loadContractMethods(rpcClient, oracleHash);
const contractInterface = detectMorpheusOracleInterface(oracleMethods);
const supportsLegacyCallbackAllowlist = oracleMethods.has('isAllowedCallback/1');
const supportsMiniAppRuntime = contractInterface === 'miniapp_runtime';

const [admin, updater, keyVersion, publicKey] = await Promise.all([
  invokeRead(rpcClient, oracleHash, 'admin'),
  invokeRead(rpcClient, oracleHash, 'updater'),
  invokeRead(rpcClient, oracleHash, 'oracleEncryptionKeyVersion'),
  invokeRead(rpcClient, oracleHash, 'oracleEncryptionPublicKey'),
]);
const [callbackAllowed, consumerOracle, miniAppCount, systemModuleCount] = await Promise.all([
  supportsLegacyCallbackAllowlist
    ? invokeRead(rpcClient, oracleHash, 'isAllowedCallback', [
        { type: 'Hash160', value: callbackHash },
      ])
    : Promise.resolve(null),
  callbackHash ? invokeRead(rpcClient, callbackHash, 'oracle') : Promise.resolve(null),
  supportsMiniAppRuntime
    ? invokeRead(rpcClient, oracleHash, 'getMiniAppCount')
    : Promise.resolve(null),
  supportsMiniAppRuntime
    ? invokeRead(rpcClient, oracleHash, 'getSystemModuleCount')
    : Promise.resolve(null),
]);
const verifierPublicKey = await invokeRead(rpcClient, oracleHash, 'oracleVerificationPublicKey');

const checks = {
  registry_matches_oracle:
    normalizeHash160(registry.neo_n3?.contracts?.morpheus_oracle || '') === oracleHash,
  registry_matches_callback:
    normalizeHash160(registry.neo_n3?.contracts?.oracle_callback_consumer || '') === callbackHash,
  callback_allowed: optionalBoolean(callbackAllowed),
  callback_oracle_matches: callbackHash
    ? normalizeHash160(consumerOracle || '') === oracleHash
    : null,
  updater_matches_expected: expectedUpdater
    ? normalizeHash160(updater || '') === expectedUpdater
    : null,
  oracle_key_present: trimString(publicKey || '').length > 0,
  oracle_key_version_positive: Number(keyVersion || 0) > 0,
  verifier_key_present: trimString(verifierPublicKey || '').length > 0,
  verifier_key_matches_expected: expectedVerifierPublicKey
    ? trimString(verifierPublicKey || '') === expectedVerifierPublicKey
    : null,
  miniapp_count_positive: supportsMiniAppRuntime ? Number(miniAppCount || 0) > 0 : null,
  system_module_count_positive: supportsMiniAppRuntime ? Number(systemModuleCount || 0) > 0 : null,
};

const report = {
  network,
  rpc_url: rpcUrl,
  oracle_hash: oracleHash,
  callback_hash: callbackHash,
  contract_interface: contractInterface,
  admin,
  updater,
  expected_updater: expectedUpdater || null,
  expected_verifier_public_key: expectedVerifierPublicKey || null,
  oracle_encryption_key_version: Number(keyVersion || 0),
  oracle_encryption_public_key_present: checks.oracle_key_present,
  oracle_verifier_public_key: verifierPublicKey || null,
  callback_consumer_oracle: consumerOracle,
  miniapp_count: miniAppCount === null ? null : Number(miniAppCount || 0),
  system_module_count: systemModuleCount === null ? null : Number(systemModuleCount || 0),
  checks,
};

console.log(JSON.stringify(report, null, 2));

if (!checks.registry_matches_oracle || !checks.registry_matches_callback) {
  process.exitCode = 1;
}
if (checks.callback_allowed === false || checks.callback_oracle_matches === false) {
  process.exitCode = 1;
}
if (checks.updater_matches_expected === false) {
  process.exitCode = 1;
}
if (
  !checks.oracle_key_present ||
  !checks.oracle_key_version_positive ||
  !checks.verifier_key_present ||
  checks.verifier_key_matches_expected === false ||
  checks.miniapp_count_positive === false ||
  checks.system_module_count_positive === false
) {
  process.exitCode = 1;
}
