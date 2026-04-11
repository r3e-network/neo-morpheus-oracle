import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { readMergedDotEnvFiles } from './lib-env.mjs';

test('readMergedDotEnvFiles merges .env.local over .env and skips missing files', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'morpheus-env-merge-'));
  const rootEnvPath = path.join(tempDir, '.env');
  const localEnvPath = path.join(tempDir, '.env.local');

  fs.writeFileSync(rootEnvPath, ['A=1', 'B=from-root', 'EMPTY='].join('\n') + '\n', 'utf8');
  fs.writeFileSync(localEnvPath, ['B=from-local', 'C=3'].join('\n') + '\n', 'utf8');

  const merged = await readMergedDotEnvFiles([
    rootEnvPath,
    path.join(tempDir, '.missing.env'),
    localEnvPath,
  ]);

  assert.deepEqual(merged, {
    A: '1',
    B: 'from-local',
    EMPTY: '',
    C: '3',
  });
});
