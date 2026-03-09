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
  const res = await fetch(`${phalaUrl}/keys/derived?role=worker`, { headers });
  if (!res.ok) throw new Error(`failed to fetch derived keys: ${res.status}`);
  const body = await res.json();
  const publicKey = body?.derived?.neo_n3?.public_key || body?.neo_n3?.public_key || '';
  if (!publicKey) throw new Error('worker neo_n3 public key missing');

  const account = new wallet.Account(wif);
  const contract = new experimental.SmartContract(oracleHash, {
    rpcAddress: rpcUrl,
    networkMagic,
    account,
  });

  console.log('Publishing Morpheus Oracle verifier public key...');
  const txHash = await contract.invoke('setOracleVerificationPublicKey', [
    sc.ContractParam.publicKey(publicKey),
  ]);
  console.log(`setOracleVerificationPublicKey tx: ${txHash}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
