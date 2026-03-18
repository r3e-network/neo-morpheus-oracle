import fs from 'node:fs/promises';
import path from 'node:path';

const network = process.env.MORPHEUS_NETWORK || 'testnet';
const target = path.resolve('config/networks', `${network}.json`);
const current = JSON.parse(await fs.readFile(target, 'utf8'));
current.neo_x = current.neo_x || {};
current.neo_x.contracts = current.neo_x.contracts || {};
current.neo_x.contracts.morpheus_oracle_x =
  process.env.CONTRACT_MORPHEUS_ORACLE_X_ADDRESS || current.neo_x.contracts.morpheus_oracle_x || '';
current.neo_x.contracts.oracle_callback_consumer_x =
  process.env.CONTRACT_ORACLE_CALLBACK_CONSUMER_X_ADDRESS ||
  current.neo_x.contracts.oracle_callback_consumer_x ||
  '';
current.neo_x.contracts.morpheus_datafeed_x =
  process.env.CONTRACT_MORPHEUS_DATAFEED_X_ADDRESS ||
  current.neo_x.contracts.morpheus_datafeed_x ||
  '';
await fs.writeFile(target, JSON.stringify(current, null, 2) + '\n');
console.log(`updated ${target}`);
