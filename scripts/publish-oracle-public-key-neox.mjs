import { Contract, JsonRpcProvider, Wallet } from 'ethers';

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const ORACLE_ABI = ['function setOracleEncryptionKey(string algorithm, string publicKey)'];

const phalaUrl = trimString(
  process.env.MORPHEUS_RUNTIME_URL || process.env.PHALA_API_URL || ''
).replace(/\/$/, '');
const phalaToken = trimString(
  process.env.MORPHEUS_RUNTIME_TOKEN || process.env.PHALA_API_TOKEN || process.env.PHALA_SHARED_SECRET || ''
);
const rpcUrl = trimString(process.env.NEOX_RPC_URL || process.env.NEO_X_RPC_URL || '');
const privateKey = trimString(
  process.env.NEOX_PRIVATE_KEY || process.env.PHALA_NEOX_PRIVATE_KEY || ''
);
const oracleAddress = trimString(process.env.CONTRACT_MORPHEUS_ORACLE_X_ADDRESS || '');

if (!phalaUrl || !rpcUrl || !privateKey || !oracleAddress) {
  throw new Error(
    'MORPHEUS_RUNTIME_URL or PHALA_API_URL, NEOX_RPC_URL, NEOX_PRIVATE_KEY/PHALA_NEOX_PRIVATE_KEY, and CONTRACT_MORPHEUS_ORACLE_X_ADDRESS are required'
  );
}

const headers = phalaToken ? { authorization: `Bearer ${phalaToken}` } : {};
const res = await fetch(`${phalaUrl}/oracle/public-key`, { headers });
if (!res.ok) throw new Error(`failed to fetch oracle public key: ${res.status}`);
const key = await res.json();

const provider = new JsonRpcProvider(rpcUrl);
const wallet = new Wallet(privateKey, provider);
const oracle = new Contract(oracleAddress, ORACLE_ABI, wallet);

const tx = await oracle.setOracleEncryptionKey(key.algorithm, key.public_key);
await tx.wait();

console.log(
  JSON.stringify(
    {
      oracle_address: oracleAddress,
      txid: tx.hash,
      algorithm: key.algorithm,
    },
    null,
    2
  )
);
