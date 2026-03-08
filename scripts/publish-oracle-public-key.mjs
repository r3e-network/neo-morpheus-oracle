import { experimental, sc, wallet } from '@cityofzion/neon-js';

async function main() {
  const phalaUrl = (process.env.PHALA_API_URL || '').replace(/\/$/, '');
  const phalaToken = process.env.PHALA_API_TOKEN || process.env.PHALA_SHARED_SECRET || '';
  const rpcUrl = process.env.NEO_RPC_URL || 'https://testnet1.neo.coz.io:443';
  const networkMagic = Number(process.env.NEO_NETWORK_MAGIC || 894710606);
  const oracleHash = process.env.CONTRACT_MORPHEUS_ORACLE_HASH || '';
  const wif = process.env.NEO_TESTNET_WIF || '';

  if (!phalaUrl || !oracleHash || !wif) {
    throw new Error('PHALA_API_URL, CONTRACT_MORPHEUS_ORACLE_HASH, and NEO_TESTNET_WIF are required');
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
  const signers = [{ account: account.scriptHash, scopes: 'CalledByEntry' }];
  const params = [
    sc.ContractParam.string(key.algorithm),
    sc.ContractParam.string(key.public_key),
  ];

  console.log('Publishing Morpheus Oracle public key...');
  const txHash = await contract.invoke('setOracleEncryptionKey', params, signers);
  console.log(`setOracleEncryptionKey tx: ${txHash}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
