import fs from 'node:fs/promises';
import path from 'node:path';
import { Contract, JsonRpcProvider, Wallet } from 'ethers';

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function loadRegistry(network) {
  const filePath = path.resolve('config/networks', `${network}.json`);
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

function normalizeAddress(value) {
  const raw = trimString(value).toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(raw) ? raw : '';
}

function resolveExpectedUpdater() {
  const explicit = normalizeAddress(
    process.env.MORPHEUS_UPDATER_ADDRESS || process.env.MORPHEUS_UPDATER_EVM_ADDRESS || ''
  );
  if (explicit) return explicit;
  const privateKey = trimString(
    process.env.MORPHEUS_RELAYER_NEOX_PRIVATE_KEY ||
      process.env.PHALA_NEOX_PRIVATE_KEY ||
      process.env.NEOX_PRIVATE_KEY ||
      ''
  );
  if (!privateKey) return '';
  return normalizeAddress(new Wallet(privateKey).address);
}

function resolveExpectedVerifier() {
  return normalizeAddress(
    process.env.MORPHEUS_ORACLE_VERIFIER_ADDRESS || process.env.PHALA_ORACLE_VERIFIER_ADDRESS || ''
  );
}

const ORACLE_ABI = [
  'function admin() view returns (address)',
  'function updater() view returns (address)',
  'function oracleVerifier() view returns (address)',
  'function allowedCallbacks(address) view returns (bool)',
  'function oracleEncryptionKeyVersion() view returns (uint256)',
  'function oracleEncryptionPublicKey() view returns (string)',
];

const CALLBACK_ABI = ['function oracle() view returns (address)'];

const network = trimString(process.env.MORPHEUS_NETWORK || 'testnet') || 'testnet';
const registry = await loadRegistry(network);
const rpcUrl = trimString(
  process.env.NEOX_RPC_URL || registry.neo_x?.rpc_url || ''
);
const oracleAddress = normalizeAddress(
  process.env.CONTRACT_MORPHEUS_ORACLE_X_ADDRESS ||
    registry.neo_x?.contracts?.morpheus_oracle_x ||
    ''
);
const callbackAddress = normalizeAddress(
  process.env.CONTRACT_ORACLE_CALLBACK_CONSUMER_X_ADDRESS ||
    registry.neo_x?.contracts?.oracle_callback_consumer_x ||
    ''
);
const expectedUpdater = resolveExpectedUpdater();
const expectedVerifier = resolveExpectedVerifier();

if (!rpcUrl) throw new Error('NEOX_RPC_URL is required');
if (!oracleAddress) throw new Error('MorpheusOracleX address is required');
if (!callbackAddress) throw new Error('OracleCallbackConsumerX address is required');

const provider = new JsonRpcProvider(rpcUrl);
const oracle = new Contract(oracleAddress, ORACLE_ABI, provider);
const callback = new Contract(callbackAddress, CALLBACK_ABI, provider);

const [admin, updater, oracleVerifier, callbackAllowed, keyVersion, publicKey, callbackOracle] =
  await Promise.all([
    oracle.admin(),
    oracle.updater(),
    oracle.oracleVerifier(),
    oracle.allowedCallbacks(callbackAddress),
    oracle.oracleEncryptionKeyVersion(),
    oracle.oracleEncryptionPublicKey(),
    callback.oracle(),
  ]);

const checks = {
  registry_matches_oracle:
    normalizeAddress(registry.neo_x?.contracts?.morpheus_oracle_x || '') === oracleAddress,
  registry_matches_callback:
    normalizeAddress(registry.neo_x?.contracts?.oracle_callback_consumer_x || '') ===
    callbackAddress,
  callback_allowed: Boolean(callbackAllowed),
  callback_oracle_matches: normalizeAddress(callbackOracle) === oracleAddress,
  updater_matches_expected: expectedUpdater ? normalizeAddress(updater) === expectedUpdater : null,
  verifier_present: normalizeAddress(oracleVerifier) !== '',
  verifier_matches_expected: expectedVerifier
    ? normalizeAddress(oracleVerifier) === expectedVerifier
    : null,
  oracle_key_present: trimString(publicKey || '').length > 0,
  oracle_key_version_positive: Number(keyVersion || 0n) > 0,
};

const report = {
  network,
  rpc_url: rpcUrl,
  oracle_address: oracleAddress,
  callback_address: callbackAddress,
  admin,
  updater,
  expected_updater: expectedUpdater || null,
  oracle_verifier: oracleVerifier,
  expected_verifier: expectedVerifier || null,
  oracle_encryption_key_version: Number(keyVersion || 0n),
  oracle_encryption_public_key_present: checks.oracle_key_present,
  callback_consumer_oracle: callbackOracle,
  checks,
};

console.log(JSON.stringify(report, null, 2));

if (
  !checks.callback_allowed ||
  !checks.callback_oracle_matches ||
  !checks.registry_matches_oracle ||
  !checks.registry_matches_callback
) {
  process.exitCode = 1;
}
if (checks.updater_matches_expected === false) {
  process.exitCode = 1;
}
