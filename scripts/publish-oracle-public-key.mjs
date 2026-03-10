import { experimental, sc, wallet } from '@cityofzion/neon-js';
import { loadDotEnv } from './lib-env.mjs';

async function main() {
  await loadDotEnv();
  const phalaUrl = (process.env.PHALA_API_URL || '').replace(/\/$/, '');
  const phalaToken = process.env.PHALA_API_TOKEN || process.env.PHALA_SHARED_SECRET || '';
  const network = (process.env.MORPHEUS_NETWORK || 'testnet').trim().toLowerCase();
  const rpcUrl = process.env.NEO_RPC_URL || (network === 'mainnet' ? 'https://mainnet1.neo.coz.io:443' : 'https://testnet1.neo.coz.io:443');
  const networkMagic = Number(process.env.NEO_NETWORK_MAGIC || (network === 'mainnet' ? 860833102 : 894710606));
  const oracleHash = process.env.CONTRACT_MORPHEUS_ORACLE_HASH || '';
  const wif = process.env.NEO_N3_WIF || process.env.NEO_TESTNET_WIF || process.env.MORPHEUS_RELAYER_NEO_N3_WIF || '';

  if (!phalaUrl || !oracleHash || !wif) {
    throw new Error('PHALA_API_URL, CONTRACT_MORPHEUS_ORACLE_HASH, and NEO_N3_WIF are required');
  }

  const headers = phalaToken ? { authorization: `Bearer ${phalaToken}` } : {};
  const res = await fetch(`${phalaUrl}/oracle/public-key`, { headers });
  if (!res.ok) throw new Error(`failed to fetch oracle public key: ${res.status}`);
  const key = await res.json();

  const account = new wallet.Account(wif);
  const contract = new experimental.SmartContract(oracleHash, {
    rpcAddress: rpcUrl,
    networkMagic,
    account,
  });

  console.log('Publishing Morpheus Oracle public key...');
  const txHash = await contract.invoke('setOracleEncryptionKey', [
    sc.ContractParam.string(key.algorithm),
    sc.ContractParam.string(key.public_key),
  ]);
  console.log(`setOracleEncryptionKey tx: ${txHash}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
