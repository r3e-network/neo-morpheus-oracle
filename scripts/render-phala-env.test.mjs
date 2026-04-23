import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

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

test('render-phala-env omits archived Neo X fields from generated output', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'render-phala-env-'));
  const outputPath = path.join(outputDir, 'morpheus.mainnet.env');
  const result = spawnSync(
    process.execPath,
    ['scripts/render-phala-env.mjs', '--network', 'mainnet', '--output', outputPath],
    {
      cwd: repoRoot,
      encoding: 'utf8',
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

  const runtimeConfig = JSON.parse(
    runtimeConfigLine.slice('MORPHEUS_RUNTIME_CONFIG_JSON='.length)
  );

  for (const key of archivedEnvKeys) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(runtimeConfig, key),
      false,
      `unexpected archived key in runtime config: ${key}`
    );
  }
});
