import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createEmptyRelayerState, loadRelayerState, saveRelayerState } from './state.js';

function tempStateFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'morpheus-relayer-state-'));
  return path.join(dir, '.morpheus-relayer-state.json');
}

test('saveRelayerState replaces the state file atomically and leaves no temp file', () => {
  const file = tempStateFile();
  const state = createEmptyRelayerState();
  state.metrics.ticks_total = 3;
  saveRelayerState(file, state);
  assert.equal(fs.existsSync(`${file}.tmp`), false);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).metrics.ticks_total, 3);
});

test('a crash mid-write cannot truncate the live state file', () => {
  const file = tempStateFile();
  const state = createEmptyRelayerState();
  state.metrics.ticks_total = 7;
  saveRelayerState(file, state);

  // Simulate a crash that interrupted the NEXT snapshot: a partial temp file is
  // left behind, but the live file must still hold the last complete snapshot.
  fs.writeFileSync(`${file}.tmp`, '{"version":2,"upd', 'utf8');
  assert.equal(loadRelayerState(file).metrics.ticks_total, 7);

  // The next save overwrites the stale temp file and completes the rename.
  state.metrics.ticks_total = 8;
  saveRelayerState(file, state);
  assert.equal(fs.existsSync(`${file}.tmp`), false);
  assert.equal(loadRelayerState(file).metrics.ticks_total, 8);
});

test('loadRelayerState warns and falls back to empty state on corrupt JSON', () => {
  const file = tempStateFile();
  fs.writeFileSync(file, '{"version":2,"metrics":{"ticks_total"', 'utf8');
  const warnings = [];
  const loaded = loadRelayerState(file, {
    warn: (fields, message) => warnings.push({ fields, message }),
  });
  assert.equal(loaded.metrics.ticks_total, 0);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0].message, /corrupt/);
  assert.equal(warnings[0].fields.state_file, file);
  assert.ok(warnings[0].fields.error);
});

test('loadRelayerState does not warn on a missing state file (normal cold start)', () => {
  const file = tempStateFile();
  const warnings = [];
  const loaded = loadRelayerState(file, { warn: (...args) => warnings.push(args) });
  assert.equal(loaded.version, 2);
  assert.equal(warnings.length, 0);
});

test('loadRelayerState keeps accepting the current persisted state shape', () => {
  // Backward-compat guard for the live relayer: a state file carrying cursors,
  // retry-queue items, and dead letters round-trips through save + load.
  const file = tempStateFile();
  const state = createEmptyRelayerState();
  state.neo_n3.last_request_id = 4321;
  state.neo_n3.last_block = 99;
  state.neo_n3.retry_queue.push({
    key: 'neo_n3:1:0xaaa::',
    event: { chain: 'neo_n3', requestId: '1', requestType: 'privacy_oracle' },
    attempts: 2,
    next_retry_at: 1,
  });
  state.neox.dead_letters.push({ key: 'neox:9:::', request_id: '9' });
  saveRelayerState(file, state);

  const loaded = loadRelayerState(file);
  assert.equal(loaded.neo_n3.last_request_id, 4321);
  assert.equal(loaded.neo_n3.last_block, 99);
  assert.equal(loaded.neo_n3.retry_queue.length, 1);
  assert.equal(loaded.neo_n3.retry_queue[0].attempts, 2);
  assert.equal(loaded.neox.dead_letters.length, 1);
});
