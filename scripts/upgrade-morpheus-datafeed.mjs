import fs from 'node:fs/promises';
import path from 'node:path';
import { experimental, sc, u, wallet } from '@cityofzion/neon-js';
import { loadDotEnv } from './lib-env.mjs';
import { normalizeMorpheusNetwork, resolvePinnedNeoN3Role } from './lib-neo-signers.mjs';

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const requestedNetwork = normalizeMorpheusNetwork(process.env.MORPHEUS_NETWORK || 'testnet');
await loadDotEnv();
const network = normalizeMorpheusNetwork(process.env.MORPHEUS_NETWORK || requestedNetwork);
await loadDotEnv(new URL(`../deploy/phala/morpheus.${network}.env`, import.meta.url), {
  override: true,
});
const rpcAddress = trimString(
  process.env.NEO_RPC_URL ||
    (network === 'mainnet' ? 'http://seed1.neo.org:10332' : 'https://testnet1.neo.coz.io:443')
);
const networkMagic = Number(
  process.env.NEO_NETWORK_MAGIC || (network === 'mainnet' ? 860833102 : 894710606)
);
const signer = resolvePinnedNeoN3Role(network, 'updater', { env: process.env });
const wif = signer.materialized?.wif || signer.materialized?.private_key || '';
const contractHash = trimString(process.env.CONTRACT_MORPHEUS_DATAFEED_HASH || '');

if (!wif) throw new Error('NEO_N3_WIF or MORPHEUS_RELAYER_NEO_N3_WIF is required');
if (!contractHash) throw new Error('CONTRACT_MORPHEUS_DATAFEED_HASH is required');

const account = new wallet.Account(wif);
const nefPath = path.resolve('contracts/build/MorpheusDataFeed.nef');
const manifestPath = path.resolve('contracts/build/MorpheusDataFeed.manifest.json');
const [nefBytes, manifestRaw] = await Promise.all([
  fs.readFile(nefPath),
  fs.readFile(manifestPath, 'utf8'),
]);
const contract = new experimental.SmartContract(contractHash, {
  rpcAddress,
  networkMagic,
  account,
});

console.log(
  JSON.stringify(
    {
      datafeed_hash: contractHash,
      admin_address: account.address,
      admin_script_hash: `0x${account.scriptHash}`,
      rpc: rpcAddress,
    },
    null,
    2
  )
);

const txid = await contract.invoke('update', [
  sc.ContractParam.byteArray(u.HexString.fromHex(nefBytes.toString('hex'), true)),
  sc.ContractParam.string(manifestRaw),
]);

console.log(`MorpheusDataFeed update tx: ${txid}`);
