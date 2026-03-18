import { Contract, ContractFactory, JsonRpcProvider, Wallet } from 'ethers';
import {
  compileSolidityExample,
  loadExampleEnv,
  normalizeAddress,
  readDeploymentRegistry,
  trimString,
  writeDeploymentRegistry,
  jsonPretty,
} from './common.mjs';

const ORACLE_ABI = [
  'function addAllowedCallback(address callbackContract)',
  'function allowedCallbacks(address callbackContract) view returns (bool)',
];

await loadExampleEnv();

const network = trimString(process.env.MORPHEUS_NETWORK || 'testnet') || 'testnet';
const rpcUrl = trimString(process.env.NEOX_RPC_URL || process.env.NEO_X_RPC_URL || '');
const chainId = Number(process.env.NEOX_CHAIN_ID || process.env.NEO_X_CHAIN_ID || 12227332);
const privateKey = trimString(
  process.env.NEOX_PRIVATE_KEY || process.env.PHALA_NEOX_PRIVATE_KEY || ''
);
const oracleAddress = normalizeAddress(process.env.CONTRACT_MORPHEUS_ORACLE_X_ADDRESS || '');
const datafeedAddress = normalizeAddress(process.env.CONTRACT_MORPHEUS_DATAFEED_X_ADDRESS || '');

if (!rpcUrl) throw new Error('NEOX_RPC_URL is required');
if (!privateKey) throw new Error('NEOX_PRIVATE_KEY or PHALA_NEOX_PRIVATE_KEY is required');
if (!oracleAddress) throw new Error('CONTRACT_MORPHEUS_ORACLE_X_ADDRESS is required');
if (!datafeedAddress) throw new Error('CONTRACT_MORPHEUS_DATAFEED_X_ADDRESS is required');

const provider = new JsonRpcProvider(rpcUrl);
const signer = new Wallet(privateKey, provider);

console.log('Compiling Neo X example contracts...');
const [consumerArtifact, readerArtifact] = await Promise.all([
  compileSolidityExample('examples/contracts/neox/UserConsumerX.sol', 'UserConsumerX'),
  compileSolidityExample('examples/contracts/neox/FeedReaderX.sol', 'FeedReaderX'),
]);

console.log('Deploying Neo X example consumer...');
const consumerFactory = new ContractFactory(
  consumerArtifact.abi,
  consumerArtifact.bytecode,
  signer
);
const consumer = await consumerFactory.deploy(oracleAddress);
await consumer.waitForDeployment();

console.log('Deploying Neo X example feed reader...');
const readerFactory = new ContractFactory(readerArtifact.abi, readerArtifact.bytecode, signer);
const reader = await readerFactory.deploy(datafeedAddress);
await reader.waitForDeployment();

const consumerAddress = await consumer.getAddress();
const readerAddress = await reader.getAddress();
const oracle = new Contract(oracleAddress, ORACLE_ABI, signer);

let allowTxHash = null;
const alreadyAllowed = await oracle.allowedCallbacks(consumerAddress);
if (!alreadyAllowed) {
  console.log('Allowlisting Neo X example consumer on live oracle...');
  const allowTx = await oracle.addAllowedCallback(consumerAddress, { chainId });
  await allowTx.wait();
  allowTxHash = allowTx.hash;
}

const allowlisted = await oracle.allowedCallbacks(consumerAddress);
if (!allowlisted) {
  throw new Error(`failed to allowlist Neo X example consumer ${consumerAddress}`);
}

const registry = await readDeploymentRegistry(network);
registry.updated_at = new Date().toISOString();
registry.neo_x = {
  deployed_at: new Date().toISOString(),
  rpc_url: rpcUrl,
  chain_id: chainId,
  deployer: signer.address,
  oracle_address: oracleAddress,
  datafeed_address: datafeedAddress,
  example_consumer_address: consumerAddress,
  example_feed_reader_address: readerAddress,
  allowlisted: true,
  transactions: {
    consumer_deploy: consumer.deploymentTransaction()?.hash || null,
    feed_reader_deploy: reader.deploymentTransaction()?.hash || null,
    allow_callback: allowTxHash,
  },
};
await writeDeploymentRegistry(network, registry);

process.stdout.write(
  jsonPretty({
    network,
    neo_x: registry.neo_x,
  })
);
