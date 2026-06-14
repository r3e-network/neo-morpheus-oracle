import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createEmptyRelayerState,
  loadRelayerState,
  saveRelayerState,
  scheduleRetry,
} from './state.js';

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

test('scheduleRetry applies bounded jitter to next_retry_at (no synchronized storms)', () => {
  const config = { maxRetries: 5, retryBaseDelayMs: 1000, retryMaxDelayMs: 30000 };
  const event = { chain: 'neo_n3', requestId: '1', requestType: 'privacy_oracle' };

  // First attempt: deterministic ceiling 1000ms. rng=()=>1 -> factor 1.0 (full),
  // rng=()=>0 -> factor 0.5 (half). next_retry_at = now + delay.
  const before = Date.now();
  const full = scheduleRetry(createEmptyRelayerState(), 'neo_n3', event, 'boom', config, () => 1);
  const half = scheduleRetry(createEmptyRelayerState(), 'neo_n3', event, 'boom', config, () => 0);
  const after = Date.now();

  const fullDelay = full.item.next_retry_at - before;
  const halfDelay = half.item.next_retry_at - after;
  // Full-jitter draw schedules ~1000ms out; half-jitter draw ~500ms out.
  assert.ok(fullDelay >= 1000 - 50 && fullDelay <= 1000 + 50, `full ~1000ms, got ${fullDelay}`);
  assert.ok(halfDelay >= 500 - 50 && halfDelay <= 500 + 50, `half ~500ms, got ${halfDelay}`);
});

test('scheduleRetry desynchronizes two equal-attempt retries', () => {
  const config = { maxRetries: 5, retryBaseDelayMs: 1000, retryMaxDelayMs: 30000 };
  const event = { chain: 'neo_n3', requestId: '1', requestType: 'privacy_oracle' };

  // Same attempt count, different rng draws -> different next_retry_at, so a
  // batch of retries does not bucket into the same tick after an outage.
  const a = scheduleRetry(createEmptyRelayerState(), 'neo_n3', event, 'boom', config, () => 0.2);
  const b = scheduleRetry(createEmptyRelayerState(), 'neo_n3', event, 'boom', config, () => 0.8);
  assert.notEqual(a.item.next_retry_at, b.item.next_retry_at);
});
