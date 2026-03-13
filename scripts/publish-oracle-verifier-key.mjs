import { experimental, sc, wallet } from '@cityofzion/neon-js';
import { loadDotEnv } from './lib-env.mjs';

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveNeoN3SignerWif(network = trimString(process.env.MORPHEUS_NETWORK || 'testnet').toLowerCase()) {
  if (network === 'testnet') {
    return trimString(
      process.env.NEO_TESTNET_WIF
      || process.env.NEO_N3_WIF
      || process.env.MORPHEUS_RELAYER_NEO_N3_WIF
      || '',
    );
  }
  return trimString(
    process.env.NEO_N3_WIF
    || process.env.MORPHEUS_RELAYER_NEO_N3_WIF
    || process.env.NEO_TESTNET_WIF
    || '',
  );
}

async function main() {
  await loadDotEnv();
  const phalaUrl = (process.env.PHALA_API_URL || '').replace(/\/$/, '');
  const phalaToken = process.env.PHALA_API_TOKEN || process.env.PHALA_SHARED_SECRET || '';
  const network = (process.env.MORPHEUS_NETWORK || 'testnet').trim().toLowerCase();
  const rpcUrl = process.env.NEO_RPC_URL || (network === 'mainnet' ? 'https://mainnet1.neo.coz.io:443' : 'https://testnet1.neo.coz.io:443');
  const networkMagic = Number(process.env.NEO_NETWORK_MAGIC || (network === 'mainnet' ? 860833102 : 894710606));
  const oracleHash = process.env.CONTRACT_MORPHEUS_ORACLE_HASH || '';
  const wif = resolveNeoN3SignerWif(network);

  if (!phalaUrl || !oracleHash || !wif) {
    throw new Error('PHALA_API_URL, CONTRACT_MORPHEUS_ORACLE_HASH, and NEO_N3_WIF are required');
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
