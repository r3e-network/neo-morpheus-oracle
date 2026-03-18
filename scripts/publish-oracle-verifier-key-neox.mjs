import { Contract, JsonRpcProvider, Wallet } from 'ethers';

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const ORACLE_ABI = ['function setOracleVerifier(address verifier)'];

const phalaUrl = trimString(process.env.PHALA_API_URL || '').replace(/\/$/, '');
const phalaToken = trimString(process.env.PHALA_API_TOKEN || process.env.PHALA_SHARED_SECRET || '');
const rpcUrl = trimString(process.env.NEOX_RPC_URL || process.env.NEO_X_RPC_URL || '');
const privateKey = trimString(
  process.env.NEOX_PRIVATE_KEY || process.env.PHALA_NEOX_PRIVATE_KEY || ''
);
const oracleAddress = trimString(process.env.CONTRACT_MORPHEUS_ORACLE_X_ADDRESS || '');

if (!phalaUrl || !rpcUrl || !privateKey || !oracleAddress) {
  throw new Error(
    'PHALA_API_URL, NEOX_RPC_URL, NEOX_PRIVATE_KEY/PHALA_NEOX_PRIVATE_KEY, and CONTRACT_MORPHEUS_ORACLE_X_ADDRESS are required'
  );
}

const headers = phalaToken ? { authorization: `Bearer ${phalaToken}` } : {};
const res = await fetch(`${phalaUrl}/keys/derived?role=worker`, { headers });
if (!res.ok) throw new Error(`failed to fetch derived keys: ${res.status}`);
const body = await res.json();
const verifier = trimString(body?.derived?.neo_x?.address || body?.neo_x?.address || '');
if (!verifier) throw new Error('worker neo_x verifier address missing');

const provider = new JsonRpcProvider(rpcUrl);
const wallet = new Wallet(privateKey, provider);
const oracle = new Contract(oracleAddress, ORACLE_ABI, wallet);

const tx = await oracle.setOracleVerifier(verifier);
await tx.wait();

console.log(
  JSON.stringify(
    {
      oracle_address: oracleAddress,
      verifier,
      txid: tx.hash,
    },
    null,
    2
  )
);
