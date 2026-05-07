import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPublicNetworkRegistry } from './lib-public-network-registry.mjs';

test('public network registry export exposes canonical Morpheus runtime metadata', () => {
  const registry = loadPublicNetworkRegistry();
  assert.equal(registry.mainnet.network, 'mainnet');
  assert.equal(registry.mainnet.rpcUrl, 'https://api.n3index.dev/mainnet');
  assert.equal(registry.testnet.rpcUrl, 'https://api.n3index.dev/testnet');
  assert.equal(registry.mainnet.morpheus.publicApiUrl, 'https://oracle.meshmini.app/mainnet');
  assert.equal(registry.mainnet.morpheus.controlPlaneUrl, 'https://control.meshmini.app/mainnet');
  assert.deepEqual(registry.mainnet.morpheus.runtimeUrls, [
    'https://oracle.meshmini.app/mainnet',
    'https://edge.meshmini.app/mainnet',
  ]);
  assert.equal(registry.mainnet.morpheus.datafeedCvmId, 'ac5b6886a2832df36e479294206611652400178f');
  assert.equal(
    registry.testnet.morpheus.datafeedAttestationExplorerUrl,
    'https://cloud.phala.com/explorer/app_ac5b6886a2832df36e479294206611652400178f'
  );
  assert.equal(registry.mainnet.contracts.aaCore, '0x0268a387913b250166ddec032b03332690a1ef78');
  assert.equal(registry.mainnet.contracts.aaWeb3AuthVerifier, '0x8e3a6388e02c0335912a77b7ff06d29a721c9112');
  assert.equal(registry.mainnet.contracts.aaSessionKeyVerifier, '0x74ca950d403143b2d40c15ce6d780225a728f5ec');
  assert.equal(registry.mainnet.contracts.aaAddressMarket, '0x011006627a683df8af98ee12e13161317d57df5e');
  assert.equal(registry.mainnet.contracts.aaPaymaster, '0xa0defa2bc6d7a71ba1e237149287c8ca4ff46caf');
  assert.equal(registry.mainnet.domains.aaPaymaster, 'paymaster.smartwallet.neo');
  assert.equal(
    registry.mainnet.contracts.oracleCallbackConsumer,
    '0xe1226268f2fe08bea67fb29e1c8fda0d7c8e9844'
  );
  assert.equal(
    registry.testnet.contracts.morpheusOracle,
    '0x4b882e94ed766807c4fd728768f972e13008ad52'
  );
  assert.equal(
    registry.testnet.contracts.oracleCallbackConsumer,
    '0x8c506f224d82e67200f20d9d5361f767f0756e3b'
  );
});
