import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '..');

test('public runtime catalog export exposes public workflow metadata only', () => {
  const result = spawnSync(process.execPath, ['scripts/export-public-runtime-catalog.mjs'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const catalog = JSON.parse(result.stdout);
  assert.equal(catalog.envelope.version, '2026-04-tee-v1');
  assert.equal(catalog.networks.mainnet.network, 'mainnet');
  assert.ok(catalog.workflows.find((item) => item.id === 'automation.upkeep'));
  assert.ok(catalog.workflows.find((item) => item.id === 'paymaster.authorize'));
  assert.equal('secretEnv' in catalog, false);
  assert.equal('confidentialSteps' in catalog.workflows[0], false);
});
