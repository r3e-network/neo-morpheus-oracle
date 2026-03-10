import fs from 'node:fs/promises';
import path from 'node:path';
import { experimental, sc, u, wallet } from '@cityofzion/neon-js';
import { loadDotEnv } from './lib-env.mjs';

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

await loadDotEnv();

const network = trimString(process.env.MORPHEUS_NETWORK || 'testnet').toLowerCase();
const rpcAddress = trimString(process.env.NEO_RPC_URL || (network === 'mainnet' ? 'https://mainnet1.neo.coz.io:443' : 'https://testnet1.neo.coz.io:443'));
const networkMagic = Number(process.env.NEO_NETWORK_MAGIC || (network === 'mainnet' ? 860833102 : 894710606));
const wif = trimString(process.env.NEO_N3_WIF || process.env.NEO_TESTNET_WIF || process.env.MORPHEUS_RELAYER_NEO_N3_WIF || '');
const oracleHash = trimString(process.env.CONTRACT_MORPHEUS_ORACLE_HASH || '');

if (!wif) throw new Error('NEO_N3_WIF or MORPHEUS_RELAYER_NEO_N3_WIF is required');
if (!oracleHash) throw new Error('CONTRACT_MORPHEUS_ORACLE_HASH is required');

const account = new wallet.Account(wif);
const nefPath = path.resolve('contracts/build/MorpheusOracle.nef');
const manifestPath = path.resolve('contracts/build/MorpheusOracle.manifest.json');
const [nefBytes, manifestRaw] = await Promise.all([
  fs.readFile(nefPath),
  fs.readFile(manifestPath, 'utf8'),
]);
const contract = new experimental.SmartContract(oracleHash, {
  rpcAddress,
  networkMagic,
  account,
});

console.log(JSON.stringify({
  oracle_hash: oracleHash,
  admin_address: account.address,
  admin_script_hash: `0x${account.scriptHash}`,
  rpc: rpcAddress,
}, null, 2));

const txid = await contract.invoke('update', [
  sc.ContractParam.byteArray(u.HexString.fromHex(nefBytes.toString('hex'), true)),
  sc.ContractParam.string(manifestRaw),
]);

console.log(`MorpheusOracle update tx: ${txid}`);
