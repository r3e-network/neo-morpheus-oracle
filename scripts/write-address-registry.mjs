import fs from 'node:fs/promises';
import path from 'node:path';

const network = process.env.MORPHEUS_NETWORK || 'testnet';
const target = path.resolve('config/networks', `${network}.json`);
const current = JSON.parse(await fs.readFile(target, 'utf8'));

const next = {
  ...current,
  neo_n3: {
    ...current.neo_n3,
    rpc_url: process.env.NEO_RPC_URL || current.neo_n3?.rpc_url || '',
    network_magic: Number(process.env.NEO_NETWORK_MAGIC || current.neo_n3?.network_magic || 0),
    contracts: {
      ...current.neo_n3?.contracts,
      morpheus_oracle: process.env.CONTRACT_MORPHEUS_ORACLE_HASH || current.neo_n3?.contracts?.morpheus_oracle || '',
      oracle_callback_consumer: process.env.CONTRACT_ORACLE_CALLBACK_CONSUMER_HASH || current.neo_n3?.contracts?.oracle_callback_consumer || '',
    },
  },
  neo_x: {
    ...current.neo_x,
    rpc_url: process.env.NEOX_RPC_URL || current.neo_x?.rpc_url || '',
    chain_id: Number(process.env.NEOX_CHAIN_ID || current.neo_x?.chain_id || 0),
  },
};

await fs.writeFile(target, JSON.stringify(next, null, 2) + '\n');
console.log(`updated ${target}`);
