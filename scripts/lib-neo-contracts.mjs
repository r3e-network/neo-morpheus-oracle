import fs from 'node:fs/promises';
import path from 'node:path';
import { experimental, sc, wallet } from '@cityofzion/neon-js';

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveNeoN3SignerWif(
  network = trimString(process.env.MORPHEUS_NETWORK || 'testnet').toLowerCase()
) {
  if (network === 'testnet') {
    return trimString(
      process.env.NEO_TESTNET_WIF ||
        process.env.NEO_N3_WIF ||
        process.env.MORPHEUS_RELAYER_NEO_N3_WIF ||
        process.env.PHALA_NEO_N3_WIF ||
        ''
    );
  }
  return trimString(
    process.env.NEO_N3_WIF ||
      process.env.MORPHEUS_RELAYER_NEO_N3_WIF ||
      process.env.PHALA_NEO_N3_WIF ||
      process.env.NEO_TESTNET_WIF ||
      ''
  );
}

function resolveNeoN3NetworkDefaults() {
  const network = trimString(process.env.MORPHEUS_NETWORK || 'testnet').toLowerCase();
  if (network === 'mainnet') {
    return {
      rpcAddress: 'https://mainnet1.neo.coz.io:443',
      networkMagic: 860833102,
    };
  }
  return {
    rpcAddress: 'https://testnet1.neo.coz.io:443',
    networkMagic: 894710606,
  };
}

export async function loadContractArtifacts(baseName, buildDir = path.resolve('contracts/build')) {
  const nefPath = path.join(buildDir, `${baseName}.nef`);
  const manifestPath = path.join(buildDir, `${baseName}.manifest.json`);
  const [nefBytes, manifestRaw] = await Promise.all([
    fs.readFile(nefPath),
    fs.readFile(manifestPath, 'utf8'),
  ]);
  return {
    nef: sc.NEF.fromBuffer(nefBytes),
    manifest: sc.ContractManifest.fromJson(JSON.parse(manifestRaw)),
  };
}

export function getDeployConfig() {
  const defaults = resolveNeoN3NetworkDefaults();
  const network = trimString(process.env.MORPHEUS_NETWORK || 'testnet').toLowerCase();
  const rpcAddress = trimString(process.env.NEO_RPC_URL || defaults.rpcAddress);
  const networkMagic = Number(process.env.NEO_NETWORK_MAGIC || defaults.networkMagic);
  const wif = resolveNeoN3SignerWif(network);
  if (!wif) throw new Error('NEO_N3_WIF or compatible Neo N3 WIF env is required');
  const account = new wallet.Account(wif);
  return { rpcAddress, networkMagic, account };
}

export async function deployContract(baseName) {
  const { nef, manifest } = await loadContractArtifacts(baseName);
  return experimental.deployContract(nef, manifest, getDeployConfig());
}

export function createContract(hash) {
  const config = getDeployConfig();
  return new experimental.SmartContract(hash, config);
}

export function signer() {
  const { account } = getDeployConfig();
  return [{ account: account.scriptHash, scopes: 'CalledByEntry' }];
}
