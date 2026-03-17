import fs from 'node:fs/promises';
import path from 'node:path';
import { rpc as neoRpc, wallet } from '@cityofzion/neon-js';
import { loadDotEnv } from './lib-env.mjs';

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

async function invokeRead(rpcClient, contractHash, method, params = []) {
  const result = await rpcClient.invokeFunction(contractHash, method, params);
  if (String(result.state || '').toUpperCase() === 'FAULT') {
    throw new Error(`${method} faulted: ${result.exception || 'unknown error'}`);
  }
  return parseStackItem(result.stack?.[0]);
}

function resolveExpectedUpdater() {
  const updaterHash = normalizeHash160(process.env.MORPHEUS_UPDATER_HASH || '');
  if (updaterHash) return updaterHash;
  const network = trimString(process.env.MORPHEUS_NETWORK || 'testnet').toLowerCase();
  const key = trimString(
    network === 'testnet'
      ? (
        process.env.NEO_TESTNET_WIF
        || process.env.MORPHEUS_RELAYER_NEO_N3_WIF_TESTNET
        || process.env.MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY_TESTNET
        || process.env.MORPHEUS_RELAYER_NEO_N3_WIF
        || process.env.MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY
        || process.env.PHALA_NEO_N3_WIF
        || process.env.PHALA_NEO_N3_PRIVATE_KEY
        || process.env.NEO_N3_WIF
      )
      : (
        process.env.MORPHEUS_RELAYER_NEO_N3_WIF
        || process.env.MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY
        || process.env.NEO_N3_WIF
        || process.env.PHALA_NEO_N3_WIF
        || process.env.PHALA_NEO_N3_PRIVATE_KEY
        || process.env.NEO_TESTNET_WIF
      )
      || '',
  );
  if (!key) return '';
  return normalizeHash160(new wallet.Account(key).scriptHash);
}

function resolveExpectedVerifierPublicKey() {
  const network = trimString(process.env.MORPHEUS_NETWORK || 'testnet').toLowerCase();
  return trimString(
    network === 'testnet'
      ? (
        process.env.MORPHEUS_ORACLE_VERIFIER_PUBLIC_KEY_TESTNET
        || process.env.PHALA_ORACLE_VERIFIER_PUBLIC_KEY_TESTNET
        || ''
      )
      : (
        process.env.MORPHEUS_ORACLE_VERIFIER_PUBLIC_KEY
        || process.env.PHALA_ORACLE_VERIFIER_PUBLIC_KEY
        || ''
      )
  );
}

await loadDotEnv();

const network = trimString(process.env.MORPHEUS_NETWORK || 'testnet') || 'testnet';
const registry = await loadRegistry(network);
const deployments = await loadDeploymentRegistry(network);
const rpcUrl = trimString(process.env.NEO_RPC_URL || registry.neo_n3?.rpc_url || '');
const mainnetRegistry = await loadRegistry('mainnet').catch(() => ({}));
const registryOracleHash = deployments?.neo_n3?.oracle_hash || registry.neo_n3?.contracts?.morpheus_oracle || '';
const registryCallbackHash = deployments?.neo_n3?.example_consumer_hash || registry.neo_n3?.contracts?.oracle_callback_consumer || '';
const candidateOracleHash = trimString(
  network === 'testnet'
    ? (process.env.CONTRACT_MORPHEUS_ORACLE_HASH_TESTNET || registryOracleHash || process.env.CONTRACT_MORPHEUS_ORACLE_HASH || '')
    : (process.env.CONTRACT_MORPHEUS_ORACLE_HASH_MAINNET || process.env.CONTRACT_MORPHEUS_ORACLE_HASH || registryOracleHash || '')
);
const oracleHash = normalizeHash160(
  network === 'testnet' && trimString(candidateOracleHash) === trimString(mainnetRegistry?.neo_n3?.contracts?.morpheus_oracle || '')
    ? registryOracleHash
    : candidateOracleHash
);
const callbackHash = normalizeHash160(
  network === 'testnet'
    ? (process.env.CONTRACT_ORACLE_CALLBACK_CONSUMER_HASH_TESTNET || registryCallbackHash || process.env.CONTRACT_ORACLE_CALLBACK_CONSUMER_HASH || '')
    : (process.env.CONTRACT_ORACLE_CALLBACK_CONSUMER_HASH_MAINNET || process.env.CONTRACT_ORACLE_CALLBACK_CONSUMER_HASH || registryCallbackHash || '')
);
const expectedUpdater = resolveExpectedUpdater();
const expectedVerifierPublicKey = resolveExpectedVerifierPublicKey();

if (!rpcUrl) throw new Error('NEO_RPC_URL is required');
if (!oracleHash) throw new Error('MorpheusOracle hash is required');
if (!callbackHash) throw new Error('OracleCallbackConsumer hash is required');

const rpcClient = new neoRpc.RPCClient(rpcUrl);
const [admin, updater, callbackAllowed, keyVersion, publicKey, consumerOracle] = await Promise.all([
  invokeRead(rpcClient, oracleHash, 'admin'),
  invokeRead(rpcClient, oracleHash, 'updater'),
  invokeRead(rpcClient, oracleHash, 'isAllowedCallback', [{ type: 'Hash160', value: callbackHash }]),
  invokeRead(rpcClient, oracleHash, 'oracleEncryptionKeyVersion'),
  invokeRead(rpcClient, oracleHash, 'oracleEncryptionPublicKey'),
  invokeRead(rpcClient, callbackHash, 'oracle'),
]);
const verifierPublicKey = await invokeRead(rpcClient, oracleHash, 'oracleVerificationPublicKey');

const checks = {
  registry_matches_oracle: normalizeHash160(registry.neo_n3?.contracts?.morpheus_oracle || '') === oracleHash,
  registry_matches_callback: normalizeHash160(registry.neo_n3?.contracts?.oracle_callback_consumer || '') === callbackHash,
  callback_allowed: Boolean(callbackAllowed),
  callback_oracle_matches: normalizeHash160(consumerOracle || '') === oracleHash,
  updater_matches_expected: expectedUpdater ? normalizeHash160(updater || '') === expectedUpdater : null,
  oracle_key_present: trimString(publicKey || '').length > 0,
  oracle_key_version_positive: Number(keyVersion || 0) > 0,
  verifier_key_present: trimString(verifierPublicKey || '').length > 0,
  verifier_key_matches_expected: expectedVerifierPublicKey ? trimString(verifierPublicKey || '') === expectedVerifierPublicKey : null,
};

const report = {
  network,
  rpc_url: rpcUrl,
  oracle_hash: oracleHash,
  callback_hash: callbackHash,
  admin,
  updater,
  expected_updater: expectedUpdater || null,
  expected_verifier_public_key: expectedVerifierPublicKey || null,
  oracle_encryption_key_version: Number(keyVersion || 0),
  oracle_encryption_public_key_present: checks.oracle_key_present,
  oracle_verifier_public_key: verifierPublicKey || null,
  callback_consumer_oracle: consumerOracle,
  checks,
};

console.log(JSON.stringify(report, null, 2));

if (!checks.callback_allowed || !checks.callback_oracle_matches || !checks.registry_matches_oracle || !checks.registry_matches_callback) {
  process.exitCode = 1;
}
if (checks.updater_matches_expected === false) {
  process.exitCode = 1;
}
