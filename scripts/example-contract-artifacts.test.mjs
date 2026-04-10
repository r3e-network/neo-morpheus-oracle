import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '..');
const gitignorePath = path.join(repoRoot, '.gitignore');

test('example N3 contract build outputs stay ignored and untracked', () => {
  const gitignore = fs.readFileSync(gitignorePath, 'utf8');
  assert.match(gitignore, /^examples\/contracts\/n3\/bin\/$/m);
  assert.match(gitignore, /^examples\/contracts\/n3\/obj\/$/m);

  const tracked = spawnSync('git', ['ls-files', 'examples/contracts/n3/bin', 'examples/contracts/n3/obj'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  assert.equal(tracked.status, 0, tracked.stderr || tracked.stdout);
  assert.equal(tracked.stdout.trim(), '');
});
