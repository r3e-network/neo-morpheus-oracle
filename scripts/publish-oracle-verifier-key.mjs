import { experimental, sc, wallet } from '@cityofzion/neon-js';
import { loadDotEnv } from './lib-env.mjs';
import {
  normalizeMorpheusNetwork,
  resolvePinnedNeoN3Role,
  resolvePinnedNeoN3VerifierPublicKey,
} from './lib-neo-signers.mjs';

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function main() {
  const requestedNetwork = normalizeMorpheusNetwork(process.env.MORPHEUS_NETWORK || 'testnet');
  await loadDotEnv();
  const network = normalizeMorpheusNetwork(process.env.MORPHEUS_NETWORK || requestedNetwork);
  await loadDotEnv(new URL(`../deploy/phala/morpheus.${network}.env`, import.meta.url), {
    override: true,
  });
  const phalaUrl = (
    process.env[`MORPHEUS_${network.toUpperCase()}_RUNTIME_URL`] ||
    process.env.MORPHEUS_RUNTIME_URL ||
    process.env.PHALA_API_URL ||
    ''
  ).replace(/\/$/, '');
  const phalaToken =
    process.env.MORPHEUS_RUNTIME_TOKEN ||
    process.env.PHALA_API_TOKEN ||
    process.env.PHALA_SHARED_SECRET ||
    '';
  const rpcUrl =
    process.env.NEO_RPC_URL ||
    (network === 'mainnet' ? 'https://api.n3index.dev/mainnet' : 'https://api.n3index.dev/testnet');
  const networkMagic = Number(
    process.env.NEO_NETWORK_MAGIC || (network === 'mainnet' ? 860833102 : 894710606)
  );
  const oracleHash = process.env.CONTRACT_MORPHEUS_ORACLE_HASH || '';
  const signer = resolvePinnedNeoN3Role(network, 'updater', { env: process.env });
  const wif = signer.materialized?.wif || signer.materialized?.private_key || '';

  if (!phalaUrl || !oracleHash || !wif) {
    throw new Error(
      'MORPHEUS_RUNTIME_URL or PHALA_API_URL, CONTRACT_MORPHEUS_ORACLE_HASH, and NEO_N3_WIF are required'
    );
  }

  const headers = phalaToken ? { authorization: `Bearer ${phalaToken}` } : {};
  let publicKey = resolvePinnedNeoN3VerifierPublicKey(network, process.env);
  if (!publicKey) {
    const res = await fetch(`${phalaUrl}/keys/derived?role=worker`, { headers });
    if (!res.ok) throw new Error(`failed to fetch derived keys: ${res.status}`);
    const body = await res.json();
    publicKey = body?.derived?.neo_n3?.public_key || body?.neo_n3?.public_key || '';
  }
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
