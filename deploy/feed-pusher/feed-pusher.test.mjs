import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

process.env.FEED_PUSHER_SKIP_MAIN = '1';
const { planFeedUpdate, parseGetLatestStack } = await import('./feed-pusher.mjs');

const PUSHER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'feed-pusher.mjs');
const OPTS = { thresholdBps: 10, maxStaleSec: 1800 };

test('planFeedUpdate skips a recent round with an unchanged price', () => {
  const now = 1_780_000_000;
  const plan = planFeedUpdate({ round: now - 60, price: 100, ts: now - 60 }, 100.05, now, OPTS);
  assert.equal(plan.push, false);
});

test('planFeedUpdate pushes when the price moves past the threshold', () => {
  const now = 1_780_000_000;
  const plan = planFeedUpdate({ round: now - 60, price: 100, ts: now - 60 }, 100.2, now, OPTS);
  assert.equal(plan.push, true);
  // well under 10 bps stays skipped (the exact boundary is fp-noisy by design:
  // a move of exactly THRESHOLD_BPS may land a hair under 10 in float math)
  const skip = planFeedUpdate({ round: now - 60, price: 100, ts: now - 60 }, 100.05, now, OPTS);
  assert.equal(skip.push, false);
});

test('planFeedUpdate force-refreshes a stale round even when the price is flat', () => {
  const now = 1_780_000_000;
  const plan = planFeedUpdate({ round: now - 1801, price: 100, ts: now - 1801 }, 100, now, OPTS);
  assert.equal(plan.push, true);
});

test('planFeedUpdate pushes when there is no current record or a zero price', () => {
  const now = 1_780_000_000;
  assert.equal(planFeedUpdate({ round: 0, price: 0, ts: 0 }, 100, now, OPTS).push, true);
  assert.equal(
    planFeedUpdate({ round: now - 60, price: 0, ts: now - 60 }, 100, now, OPTS).push,
    true
  );
});

test('planFeedUpdate never regresses the on-chain timestamp or round', () => {
  const now = 1_780_000_000;
  // on-chain record carries a future timestamp (clock skew / prior writer):
  // the signed batch must keep it monotonic, not rewind to `now` — this is the
  // pusher-side guard for MorpheusPriceFeed.sol, which only checks roundId.
  const plan = planFeedUpdate({ round: now + 100, price: 100, ts: now + 500 }, 200, now, OPTS);
  assert.equal(plan.push, true);
  assert.equal(plan.ts, now + 500);
  assert.equal(plan.round, now + 101);
  // normal case: fresh wall clock wins
  const fresh = planFeedUpdate({ round: now - 60, price: 100, ts: now - 60 }, 200, now, OPTS);
  assert.equal(fresh.ts, now);
  assert.equal(fresh.round, now);
});

test('parseGetLatestStack decodes the FeedRecord struct and tolerates faults', () => {
  const halt = {
    state: 'HALT',
    stack: [
      {
        type: 'Struct',
        value: [
          { type: 'ByteString', value: Buffer.from('TWELVEDATA:NEO-USD').toString('base64') },
          { type: 'Integer', value: '42' },
          { type: 'Integer', value: '5250000' },
          { type: 'Integer', value: '1780000000' },
          { type: 'ByteString', value: '' },
          { type: 'Integer', value: '0' },
        ],
      },
    ],
  };
  assert.deepEqual(parseGetLatestStack(halt), { round: 42, price: 5.25, ts: 1_780_000_000 });
  assert.deepEqual(parseGetLatestStack({ state: 'FAULT', stack: [] }), {
    round: 0,
    price: 0,
    ts: 0,
  });
  assert.deepEqual(parseGetLatestStack({ state: 'HALT', stack: [] }), {
    round: 0,
    price: 0,
    ts: 0,
  });
  assert.deepEqual(parseGetLatestStack(null), { round: 0, price: 0, ts: 0 });
});

test('feed-pusher still runs its main cycle when executed as the systemd entrypoint', () => {
  // FEED_CHAINS=none filters every chain out, so the cycle exits before any
  // network call — proving the entry path runs without touching live RPCs.
  const env = {
    ...process.env,
    FEED_CHAINS: 'none',
    PUSH_LOG: path.join(os.tmpdir(), 'feed-pusher-test.log'),
  };
  delete env.FEED_PUSHER_SKIP_MAIN;
  const result = spawnSync(process.execPath, [PUSHER], { env, encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /no enabled chains\/symbols/);
});

test('FEED_PUSHER_SKIP_MAIN=1 suppresses the main cycle for test imports', () => {
  const env = {
    ...process.env,
    FEED_CHAINS: 'none',
    FEED_PUSHER_SKIP_MAIN: '1',
    PUSH_LOG: path.join(os.tmpdir(), 'feed-pusher-test.log'),
  };
  const result = spawnSync(process.execPath, [PUSHER], { env, encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0);
  assert.doesNotMatch(result.stdout, /no enabled chains\/symbols/);
});
