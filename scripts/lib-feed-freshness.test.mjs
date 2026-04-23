import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyFeedFreshness,
  normalizeFeedStoragePair,
  parseConfiguredFeedPairs,
} from './lib-feed-freshness.mjs';

test('normalizeFeedStoragePair prefixes bare symbols with TWELVEDATA', () => {
  assert.equal(normalizeFeedStoragePair('NEO-USD'), 'TWELVEDATA:NEO-USD');
  assert.equal(normalizeFeedStoragePair('TWELVEDATA:BTC-USD'), 'TWELVEDATA:BTC-USD');
});

test('parseConfiguredFeedPairs normalizes configured feed symbols', () => {
  assert.deepEqual(
    parseConfiguredFeedPairs({ MORPHEUS_FEED_SYMBOLS: 'NEO-USD,TWELVEDATA:GAS-USD' }),
    ['TWELVEDATA:NEO-USD', 'TWELVEDATA:GAS-USD']
  );
});

test('classifyFeedFreshness marks old observations stale', () => {
  const nowMs = Date.parse('2026-04-13T05:00:00.000Z');
  assert.deepEqual(classifyFeedFreshness('1776045014', nowMs, 180, 'TWELVEDATA:NEO-USD'), {
    iso: '2026-04-13T01:50:14.000Z',
    age_min: 190,
    cadence: 'continuous',
    threshold_min: 180,
    stale: true,
  });
  assert.deepEqual(classifyFeedFreshness('1776052214', nowMs, 180, 'TWELVEDATA:NEO-USD'), {
    iso: '2026-04-13T03:50:14.000Z',
    age_min: 70,
    cadence: 'continuous',
    threshold_min: 180,
    stale: false,
  });
});

test('classifyFeedFreshness treats sub-12h observations as fresh under the default operator threshold', () => {
  const nowMs = Date.parse('2026-04-13T12:00:00.000Z');
  assert.deepEqual(classifyFeedFreshness('1776053621', nowMs, 720, 'TWELVEDATA:CNY-USD'), {
    iso: '2026-04-13T04:13:41.000Z',
    age_min: 466,
    cadence: 'market_hours',
    threshold_min: 1440,
    stale: false,
  });
});
