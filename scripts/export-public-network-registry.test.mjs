import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '..');

test('public network registry export exposes canonical Morpheus runtime metadata', () => {
  const result = spawnSync(process.execPath, ['scripts/export-public-network-registry.mjs'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const registry = JSON.parse(result.stdout);
  assert.equal(registry.mainnet.network, 'mainnet');
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
  assert.equal(registry.mainnet.contracts.aaCore, '0x9742b4ed62a84a886f404d36149da6147528ee33');
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
