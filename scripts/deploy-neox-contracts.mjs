import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ContractFactory, JsonRpcProvider, Wallet } from 'ethers';

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function loadArtifact(sourceFile, contractName) {
  const filePath = path.resolve(
    'contracts/neox/artifacts/contracts',
    sourceFile,
    `${contractName}.json`
  );
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function updateRegistry(network, rpcUrl, chainId, addresses) {
  const target = path.resolve('config/networks', `${network}.json`);
  const current = JSON.parse(await fs.readFile(target, 'utf8'));
  const next = {
    ...current,
    neo_x: {
      ...current.neo_x,
      rpc_url: rpcUrl,
      chain_id: chainId,
      contracts: {
        ...current.neo_x?.contracts,
        morpheus_oracle_x: addresses.oracle,
        oracle_callback_consumer_x: addresses.consumer,
        morpheus_datafeed_x: addresses.datafeed,
      },
    },
  };
  await fs.writeFile(target, `${JSON.stringify(next, null, 2)}\n`);
}

const network = trimString(process.env.MORPHEUS_NETWORK || 'testnet') || 'testnet';
const rpcUrl = trimString(process.env.NEOX_RPC_URL || process.env.NEO_X_RPC_URL || '');
const chainId = Number(process.env.NEOX_CHAIN_ID || process.env.NEO_X_CHAIN_ID || 12227332);
const deployerPrivateKey = trimString(
  process.env.NEOX_PRIVATE_KEY || process.env.PHALA_NEOX_PRIVATE_KEY || ''
);
const updaterPrivateKey = trimString(
  process.env.MORPHEUS_RELAYER_NEOX_PRIVATE_KEY ||
    process.env.PHALA_NEOX_PRIVATE_KEY ||
    process.env.NEOX_PRIVATE_KEY ||
    ''
);
const shouldCompile = trimString(process.env.NEOX_SKIP_COMPILE || '').toLowerCase() !== 'true';

if (!rpcUrl) throw new Error('NEOX_RPC_URL is required');
if (!deployerPrivateKey) throw new Error('NEOX_PRIVATE_KEY or PHALA_NEOX_PRIVATE_KEY is required');

if (shouldCompile) {
  console.log('Compiling Neo X contracts...');
  execSync('npm install', { cwd: 'contracts/neox', stdio: 'inherit' });
  execSync('npx hardhat compile', { cwd: 'contracts/neox', stdio: 'inherit' });
}

const provider = new JsonRpcProvider(rpcUrl);
const deployer = new Wallet(deployerPrivateKey, provider);
const updaterAddress = updaterPrivateKey ? new Wallet(updaterPrivateKey).address : deployer.address;

const [oracleArtifact, consumerArtifact, datafeedArtifact] = await Promise.all([
  loadArtifact('MorpheusOracleX.sol', 'MorpheusOracleX'),
  loadArtifact('OracleCallbackConsumerX.sol', 'OracleCallbackConsumerX'),
  loadArtifact('MorpheusDataFeedX.sol', 'MorpheusDataFeedX'),
]);

const oracleFactory = new ContractFactory(oracleArtifact.abi, oracleArtifact.bytecode, deployer);
const consumerFactory = new ContractFactory(
  consumerArtifact.abi,
  consumerArtifact.bytecode,
  deployer
);
const datafeedFactory = new ContractFactory(
  datafeedArtifact.abi,
  datafeedArtifact.bytecode,
  deployer
);

console.log('Deploying MorpheusOracleX...');
const oracle = await oracleFactory.deploy();
await oracle.waitForDeployment();

console.log('Deploying OracleCallbackConsumerX...');
const consumer = await consumerFactory.deploy();
await consumer.waitForDeployment();

console.log('Deploying MorpheusDataFeedX...');
const datafeed = await datafeedFactory.deploy();
await datafeed.waitForDeployment();

console.log('Configuring Neo X contracts...');
await (await oracle.addAllowedCallback(await consumer.getAddress())).wait();
await (await consumer.setOracle(await oracle.getAddress())).wait();
await (await oracle.setUpdater(updaterAddress)).wait();
await (await datafeed.setUpdater(updaterAddress)).wait();

const addresses = {
  oracle: await oracle.getAddress(),
  consumer: await consumer.getAddress(),
  datafeed: await datafeed.getAddress(),
};
await updateRegistry(network, rpcUrl, chainId, addresses);

console.log(
  JSON.stringify(
    {
      network,
      rpc_url: rpcUrl,
      chain_id: chainId,
      deployer: deployer.address,
      updater: updaterAddress,
      contracts: addresses,
    },
    null,
    2
  )
);
