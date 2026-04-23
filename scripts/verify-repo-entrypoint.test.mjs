import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');

const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
const readJson = (relativePath) => JSON.parse(read(relativePath));

test('root package exposes the repo verification command', () => {
  const pkg = readJson('package.json');

  assert.equal(pkg.scripts?.['verify:repo'], 'bash scripts/verify_repo.sh');
});

test('repo verification script runs the canonical local validation stack', () => {
  const script = read(path.join('scripts', 'verify_repo.sh'));

  assert.match(script, /check:audit:root/);
  assert.match(script, /test:scripts/);
  assert.match(script, /test:control-plane/);
  assert.match(script, /test:worker/);
  assert.match(script, /test:relayer/);
  assert.match(script, /build:web/);
  assert.match(script, /lint -- --max-warnings=0/);
});

test('README documents the repo verification entrypoint', () => {
  const readme = read('README.md');

  assert.match(readme, /verify:repo/);
  assert.match(readme, /local verification entrypoint/i);
});
