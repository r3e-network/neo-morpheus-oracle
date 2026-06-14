import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

process.env.FEED_PUSHER_SKIP_MAIN = '1';
const { planFeedUpdate, parseGetLatestStack, parseGetAllFeedRecordsStack, trackMissingSymbols } =
  await import('./feed-pusher.mjs');

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
  // Price move (40%) is within the 50% deviation ceiling so it pushes; the
  // assertions below are about ts/round monotonicity, not the move magnitude.
  const plan = planFeedUpdate({ round: now + 100, price: 100, ts: now + 500 }, 140, now, OPTS);
  assert.equal(plan.push, true);
  assert.equal(plan.ts, now + 500);
  assert.equal(plan.round, now + 101);
  // normal case: fresh wall clock wins
  const fresh = planFeedUpdate({ round: now - 60, price: 100, ts: now - 60 }, 140, now, OPTS);
  assert.equal(fresh.ts, now);
  assert.equal(fresh.round, now);
});

test('planFeedUpdate rejects a non-positive or non-finite candidate price', () => {
  const now = 1_780_000_000;
  const cur = { round: now - 60, price: 100, ts: now - 60 };
  // Zero / negative source quote must never be pushed (would 0-price the feed).
  let plan = planFeedUpdate(cur, 0, now, OPTS);
  assert.equal(plan.push, false);
  assert.equal(plan.rejected, 'invalid_price');
  plan = planFeedUpdate(cur, -5, now, OPTS);
  assert.equal(plan.push, false);
  assert.equal(plan.rejected, 'invalid_price');
  // NaN / Infinity from a corrupt upstream parse are rejected too.
  for (const bad of [NaN, Infinity, -Infinity]) {
    const p = planFeedUpdate(cur, bad, now, OPTS);
    assert.equal(p.push, false);
    assert.equal(p.rejected, 'invalid_price');
  }
  // A rejected plan must never regress the stored round/timestamp.
  plan = planFeedUpdate(cur, 0, now, OPTS);
  assert.equal(plan.round, cur.round);
  assert.equal(plan.ts, cur.ts);
});

test('planFeedUpdate rejects a deviation spike against an existing on-chain price', () => {
  const now = 1_780_000_000;
  const cur = { round: now - 60, price: 100, ts: now - 60 };
  // Default 5000 bps (50%) ceiling: a 100 -> 1000 (900%) jump is a glitch.
  let plan = planFeedUpdate(cur, 1000, now, OPTS);
  assert.equal(plan.push, false);
  assert.equal(plan.rejected, 'deviation_spike');
  // A 100 -> 0.0001 collapse is symmetric and also rejected.
  plan = planFeedUpdate(cur, 0.0001, now, OPTS);
  assert.equal(plan.push, false);
  assert.equal(plan.rejected, 'deviation_spike');
  // A move within the deviation ceiling (40%) still pushes (past the bps threshold).
  plan = planFeedUpdate(cur, 140, now, OPTS);
  assert.equal(plan.push, true);
  assert.equal(plan.rejected, undefined);
});

test('planFeedUpdate honours the MAX_DEVIATION_BPS=0 admin override for genuine flash moves', () => {
  const now = 1_780_000_000;
  const cur = { round: now - 60, price: 100, ts: now - 60 };
  // maxDeviationBps=0 disables the spike guard so a real >50% candle lands.
  const plan = planFeedUpdate(cur, 1000, now, { ...OPTS, maxDeviationBps: 0 });
  assert.equal(plan.push, true);
  assert.equal(plan.rejected, undefined);
});

test('planFeedUpdate bootstrap (no on-chain price) bypasses the deviation guard but not the invalid-price guard', () => {
  const now = 1_780_000_000;
  // Bootstrap: cur.price<=0 has no usable reference, so any valid first price lands.
  assert.equal(
    planFeedUpdate({ round: 0, price: 0, ts: 0 }, 99999, now, OPTS).push,
    true
  );
  // ...but a zero/invalid first price is still rejected even at bootstrap.
  const bad = planFeedUpdate({ round: 0, price: 0, ts: 0 }, 0, now, OPTS);
  assert.equal(bad.push, false);
  assert.equal(bad.rejected, 'invalid_price');
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

test('parseGetAllFeedRecordsStack indexes the batched FeedRecords by pair', () => {
  const record = (pair, round, priceMicros, ts) => ({
    type: 'Struct',
    value: [
      { type: 'ByteString', value: Buffer.from(pair).toString('base64') },
      { type: 'Integer', value: String(round) },
      { type: 'Integer', value: String(priceMicros) },
      { type: 'Integer', value: String(ts) },
      { type: 'ByteString', value: '' },
      { type: 'Integer', value: '0' },
    ],
  });
  const halt = {
    state: 'HALT',
    stack: [
      {
        type: 'Array',
        value: [
          record('TWELVEDATA:NEO-USD', 42, 5250000, 1_780_000_000),
          record('TWELVEDATA:BTC-USD', 7, 65000000000, 1_780_000_100),
        ],
      },
    ],
  };
  const byPair = parseGetAllFeedRecordsStack(halt);
  // Equivalence with the per-pair getLatest decode for every indexed pair.
  assert.deepEqual(byPair.get('TWELVEDATA:NEO-USD'), {
    round: 42,
    price: 5.25,
    ts: 1_780_000_000,
  });
  assert.deepEqual(byPair.get('TWELVEDATA:BTC-USD'), {
    round: 7,
    price: 65000,
    ts: 1_780_000_100,
  });
  // Unregistered pairs are simply absent (callers default to the zeroed record).
  assert.equal(byPair.get('TWELVEDATA:FLM-USD'), undefined);
});

test('parseGetAllFeedRecordsStack returns null on FAULT so callers fall back to per-pair reads', () => {
  assert.equal(parseGetAllFeedRecordsStack({ state: 'FAULT', stack: [] }), null);
  assert.equal(parseGetAllFeedRecordsStack(null), null);
  // An empty registry still parses (no pairs registered yet).
  const empty = parseGetAllFeedRecordsStack({
    state: 'HALT',
    stack: [{ type: 'Array', value: [] }],
  });
  assert.equal(empty.size, 0);
});

test('trackMissingSymbols alerts only after N consecutive missing cycles and resets on recovery', () => {
  const requested = ['NEO-USD', 'GAS-USD', 'WTI-USD'];
  // Cycle 1: WTI missing -> counted, no alert yet.
  let state = trackMissingSymbols({}, requested, { 'NEO-USD': 5.2, 'GAS-USD': 2.1 }, 3);
  assert.deepEqual(state.counts, { 'WTI-USD': 1 });
  assert.deepEqual(state.alerts, []);
  // Cycle 2: still missing.
  state = trackMissingSymbols(state.counts, requested, { 'NEO-USD': 5.2, 'GAS-USD': 2.1 }, 3);
  assert.deepEqual(state.counts, { 'WTI-USD': 2 });
  assert.deepEqual(state.alerts, []);
  // Cycle 3: threshold reached -> alert, and keeps alerting while broken.
  state = trackMissingSymbols(state.counts, requested, { 'NEO-USD': 5.2, 'GAS-USD': 2.1 }, 3);
  assert.deepEqual(state.alerts, [{ symbol: 'WTI-USD', cycles: 3 }]);
  state = trackMissingSymbols(state.counts, requested, { 'NEO-USD': 5.2, 'GAS-USD': 2.1 }, 3);
  assert.deepEqual(state.alerts, [{ symbol: 'WTI-USD', cycles: 4 }]);
  // Recovery clears the counter entirely.
  state = trackMissingSymbols(state.counts, requested, {
    'NEO-USD': 5.2,
    'GAS-USD': 2.1,
    'WTI-USD': 70,
  });
  assert.deepEqual(state.counts, {});
  assert.deepEqual(state.alerts, []);
});

test('trackMissingSymbols leaves counters of symbols this run did not request untouched', () => {
  // Per-chain timer units fetch only their own symbol subset; the other
  // chain's counters must persist unmodified.
  const { counts } = trackMissingSymbols(
    { 'WTI-USD': 2, 'EUR-USD': 1 },
    ['NEO-USD'],
    { 'NEO-USD': 5.2 },
    3
  );
  assert.deepEqual(counts, { 'WTI-USD': 2, 'EUR-USD': 1 });
});
