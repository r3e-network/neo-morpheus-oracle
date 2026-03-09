import fs from 'node:fs/promises';
import path from 'node:path';
import { rpc as neoRpc, wallet } from '@cityofzion/neon-js';

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
        return Buffer.from(raw, 'base64').toString('utf8');
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
  const key = trimString(
    process.env.MORPHEUS_RELAYER_NEO_N3_WIF
      || process.env.MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY
      || process.env.PHALA_NEO_N3_WIF
      || process.env.PHALA_NEO_N3_PRIVATE_KEY
      || process.env.NEO_TESTNET_WIF
      || '',
  );
  if (!key) return '';
  return normalizeHash160(new wallet.Account(key).scriptHash);
}

const network = trimString(process.env.MORPHEUS_NETWORK || 'testnet') || 'testnet';
const registry = await loadRegistry(network);
const rpcUrl = trimString(process.env.NEO_RPC_URL || registry.neo_n3?.rpc_url || '');
const oracleHash = normalizeHash160(process.env.CONTRACT_MORPHEUS_ORACLE_HASH || registry.neo_n3?.contracts?.morpheus_oracle || '');
const callbackHash = normalizeHash160(process.env.CONTRACT_ORACLE_CALLBACK_CONSUMER_HASH || registry.neo_n3?.contracts?.oracle_callback_consumer || '');
const expectedUpdater = resolveExpectedUpdater();

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

const checks = {
  registry_matches_oracle: normalizeHash160(registry.neo_n3?.contracts?.morpheus_oracle || '') === oracleHash,
  registry_matches_callback: normalizeHash160(registry.neo_n3?.contracts?.oracle_callback_consumer || '') === callbackHash,
  callback_allowed: Boolean(callbackAllowed),
  callback_oracle_matches: normalizeHash160(consumerOracle || '') === oracleHash,
  updater_matches_expected: expectedUpdater ? normalizeHash160(updater || '') === expectedUpdater : null,
  oracle_key_present: trimString(publicKey || '').length > 0,
  oracle_key_version_positive: Number(keyVersion || 0) > 0,
};

const report = {
  network,
  rpc_url: rpcUrl,
  oracle_hash: oracleHash,
  callback_hash: callbackHash,
  admin,
  updater,
  expected_updater: expectedUpdater || null,
  oracle_encryption_key_version: Number(keyVersion || 0),
  oracle_encryption_public_key_present: checks.oracle_key_present,
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
