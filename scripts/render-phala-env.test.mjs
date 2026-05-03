import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { wallet } from '@cityofzion/neon-js';

const repoRoot = path.resolve(import.meta.dirname, '..');
const archivedEnvKeys = [
  'NEOX_RPC_URL',
  'NEOX_CHAIN_ID',
  'CONTRACT_MORPHEUS_ORACLE_X_ADDRESS',
  'CONTRACT_ORACLE_CALLBACK_CONSUMER_X_ADDRESS',
  'CONTRACT_MORPHEUS_DATAFEED_X_ADDRESS',
  'PHALA_NEOX_PRIVATE_KEY',
  'MORPHEUS_RELAYER_NEOX_PRIVATE_KEY',
  'MORPHEUS_RELAYER_NEO_X_START_BLOCK',
  'PHALA_DSTACK_NEOX_KEY_PATH',
  'PHALA_DSTACK_RELAYER_NEOX_KEY_PATH',
];

function buildTestSignerEnv() {
  const account = new wallet.Account(wallet.generatePrivateKey());
  const wifKeys = [
    'NEO_TESTNET_WIF',
    'NEO_N3_WIF',
    'PHALA_NEO_N3_WIF',
    'PHALA_NEO_N3_WIF_MAINNET',
    'MORPHEUS_RELAYER_NEO_N3_WIF',
    'MORPHEUS_RELAYER_NEO_N3_WIF_MAINNET',
    'MORPHEUS_UPDATER_NEO_N3_WIF',
    'MORPHEUS_UPDATER_NEO_N3_WIF_MAINNET',
    'MORPHEUS_ORACLE_VERIFIER_WIF',
    'MORPHEUS_ORACLE_VERIFIER_WIF_MAINNET',
    'PHALA_ORACLE_VERIFIER_WIF',
    'PHALA_ORACLE_VERIFIER_WIF_MAINNET',
  ];
  const privateKeyKeys = [
    'PHALA_NEO_N3_PRIVATE_KEY',
    'PHALA_NEO_N3_PRIVATE_KEY_MAINNET',
    'MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY',
    'MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY_MAINNET',
    'MORPHEUS_UPDATER_NEO_N3_PRIVATE_KEY',
    'MORPHEUS_UPDATER_NEO_N3_PRIVATE_KEY_MAINNET',
    'MORPHEUS_ORACLE_VERIFIER_PRIVATE_KEY',
    'MORPHEUS_ORACLE_VERIFIER_PRIVATE_KEY_MAINNET',
    'PHALA_ORACLE_VERIFIER_PRIVATE_KEY',
    'PHALA_ORACLE_VERIFIER_PRIVATE_KEY_MAINNET',
  ];

  return Object.fromEntries([
    ['MORPHEUS_ALLOW_UNPINNED_SIGNERS', 'true'],
    ...wifKeys.map((key) => [key, account.WIF]),
    ...privateKeyKeys.map((key) => [key, account.privateKey]),
  ]);
}

test('render-phala-env omits archived Neo X fields from generated output', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'render-phala-env-'));
  const outputPath = path.join(outputDir, 'morpheus.mainnet.env');
  const result = spawnSync(
    process.execPath,
    ['scripts/render-phala-env.mjs', '--network', 'mainnet', '--output', outputPath],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, ...buildTestSignerEnv() },
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const rendered = fs.readFileSync(outputPath, 'utf8');
  const renderedKeys = new Set(
    rendered
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => line.slice(0, line.indexOf('=')))
  );

  for (const key of archivedEnvKeys) {
    assert.equal(renderedKeys.has(key), false, `unexpected archived key in rendered env: ${key}`);
  }

  const runtimeConfigLine = rendered
    .split(/\r?\n/)
    .find((line) => line.startsWith('MORPHEUS_RUNTIME_CONFIG_JSON='));
  assert.ok(runtimeConfigLine, 'missing MORPHEUS_RUNTIME_CONFIG_JSON line');

  const runtimeConfig = JSON.parse(runtimeConfigLine.slice('MORPHEUS_RUNTIME_CONFIG_JSON='.length));

  for (const key of archivedEnvKeys) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(runtimeConfig, key),
      false,
      `unexpected archived key in runtime config: ${key}`
    );
  }

  assert.ok(
    Object.prototype.hasOwnProperty.call(runtimeConfig, 'MORPHEUS_UPDATER_NEO_N3_WIF'),
    'runtime config must expose the updater WIF to the relayer'
  );
  assert.ok(
    Object.prototype.hasOwnProperty.call(runtimeConfig, 'MORPHEUS_UPDATER_NEO_N3_PRIVATE_KEY'),
    'runtime config must expose the updater private key to the relayer'
  );
  assert.ok(
    Object.prototype.hasOwnProperty.call(runtimeConfig, 'MORPHEUS_UPDATER_NEO_N3_WIF_MAINNET'),
    'runtime config must expose the network-scoped updater WIF to the relayer primary signer path'
  );
  assert.ok(
    Object.prototype.hasOwnProperty.call(
      runtimeConfig,
      'MORPHEUS_UPDATER_NEO_N3_PRIVATE_KEY_MAINNET'
    ),
    'runtime config must expose the network-scoped updater private key to the relayer primary signer path'
  );
});
