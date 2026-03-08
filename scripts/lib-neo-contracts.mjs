import fs from 'node:fs/promises';
import path from 'node:path';
import { experimental, sc, wallet } from '@cityofzion/neon-js';

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
  const rpcAddress = process.env.NEO_RPC_URL || 'https://testnet1.neo.coz.io:443';
  const networkMagic = Number(process.env.NEO_NETWORK_MAGIC || 894710606);
  const wif = process.env.NEO_TESTNET_WIF || '';
  if (!wif) throw new Error('NEO_TESTNET_WIF is required');
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
