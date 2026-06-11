import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  getSupabasePersistenceBackoff,
  quarantineRelayerJobsBelowRequestId,
  isSupabaseQuotaRestrictedError,
  markSupabasePersistenceUnavailable,
  resetSupabasePersistenceBackoffForTests,
  shouldSkipSupabasePersistence,
} from './persistence.js';

afterEach(() => {
  resetSupabasePersistenceBackoffForTests();
});

describe('Supabase persistence backoff', () => {
  it('detects Supabase quota restriction errors', () => {
    assert.equal(
      isSupabaseQuotaRestrictedError(
        new Error('supabase morpheus_relayer_jobs GET failed: 402 exceed_db_size_quota')
      ),
      true
    );
    assert.equal(isSupabaseQuotaRestrictedError(new Error('503 temporarily unavailable')), false);
  });

  it('temporarily skips Supabase persistence after quota restriction', () => {
    const nowMs = Date.parse('2026-05-06T08:00:00.000Z');
    assert.equal(shouldSkipSupabasePersistence(nowMs), false);

    const marked = markSupabasePersistenceUnavailable(
      new Error('supabase morpheus_relayer_runs POST failed: 402 Payment Required'),
      nowMs
    );

    assert.equal(marked, true);
    assert.equal(shouldSkipSupabasePersistence(nowMs + 1000), true);
    assert.equal(shouldSkipSupabasePersistence(nowMs + 301000), false);

    const backoff = getSupabasePersistenceBackoff(nowMs + 1000);
    assert.equal(backoff.active, true);
    assert.equal(backoff.reason, 'quota_restricted');
    assert.ok(backoff.remaining_ms > 0);
  });

  it('does not enter backoff for ordinary errors', () => {
    const marked = markSupabasePersistenceUnavailable(new Error('network unavailable'), Date.now());

    assert.equal(marked, false);
    assert.equal(shouldSkipSupabasePersistence(), false);
  });
});

describe('quarantineRelayerJobsBelowRequestId (PostgREST batching)', () => {
  function withSupabaseEnv() {
    const previous = {
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    };
    process.env.SUPABASE_URL = 'https://supabase.test';
    process.env.SUPABASE_SECRET_KEY = 'service-key';
    return () => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    };
  }

  function stubSupabaseFetch(rows, calls) {
    return async (url, init = {}) => {
      const parsed = new URL(url);
      calls.push({
        method: init.method || 'GET',
        pathname: parsed.pathname,
        query: Object.fromEntries(parsed.searchParams.entries()),
        body: init.body ? JSON.parse(init.body) : undefined,
      });
      return {
        ok: true,
        status: 200,
        text: async () => ((init.method || 'GET') === 'GET' ? JSON.stringify(rows) : ''),
      };
    };
  }

  it('filters by the numeric request-id floor and quarantines via bulk event_key=in.(...) PATCHes', async () => {
    const restoreEnv = withSupabaseEnv();
    const originalFetch = global.fetch;
    try {
      const rows = [
        // '9' < 10 numerically but NOT lexicographically — the floor compare
        // must stay numeric even though request_id is a text column.
        { event_key: 'neo_n3:9:0xa:0:1', request_id: '9', last_error: null },
        { event_key: 'neo_n3:8:0xb:0:1', request_id: '8', last_error: null },
        { event_key: 'neo_n3:7:0xc:0:1', request_id: '7', last_error: 'worker timeout' },
        { event_key: 'neo_n3:10:0xd:0:1', request_id: '10', last_error: null }, // at floor: kept
        { event_key: 'neo_n3:100:0xe:0:1', request_id: '100', last_error: null }, // above: kept
      ];
      const calls = [];
      global.fetch = stubSupabaseFetch(rows, calls);

      const patched = await quarantineRelayerJobsBelowRequestId({
        network: 'testnet',
        chain: 'neo_n3',
        ltRequestId: 10,
        statuses: ['queued', 'processing'],
        note: 'auto-quarantined below request cursor floor 10',
      });

      assert.equal(patched, 3);

      const select = calls.find((call) => call.method === 'GET');
      assert.ok(select, 'expected a PostgREST select');
      // Status/chain filtering is pushed into the PostgREST query with a narrow select.
      assert.equal(select.query.select, 'event_key,request_id,last_error');
      assert.equal(select.query.status, 'in.(queued,processing)');
      assert.equal(select.query.chain, 'eq.neo_n3');

      const patches = calls.filter((call) => call.method === 'PATCH');
      // Rows sharing the same resulting last_error collapse into ONE bulk PATCH:
      // two rows had no previous error (one group) + one row with its own error.
      assert.equal(patches.length, 2);

      const bulk = patches.find((call) => call.query.event_key.includes('neo_n3:9:0xa:0:1'));
      assert.ok(bulk, 'expected the bulk no-previous-error PATCH');
      assert.equal(bulk.query.event_key, 'in.("neo_n3:9:0xa:0:1","neo_n3:8:0xb:0:1")');
      assert.equal(bulk.query.network, 'eq.testnet');
      assert.equal(bulk.body.status, 'stale_quarantined');
      assert.match(bulk.body.last_error, /floor 10 :: legacy open relayer job$/);

      const single = patches.find((call) => call.query.event_key.includes('neo_n3:7:0xc:0:1'));
      assert.ok(single, 'expected the previous-error-preserving PATCH');
      assert.match(single.body.last_error, /floor 10 :: worker timeout$/);

      // The at/above-floor rows are never patched.
      for (const call of patches) {
        assert.ok(!call.query.event_key.includes('neo_n3:10:0xd:0:1'));
        assert.ok(!call.query.event_key.includes('neo_n3:100:0xe:0:1'));
      }
    } finally {
      global.fetch = originalFetch;
      restoreEnv();
    }
  });

  it('returns 0 without issuing PATCHes when no row is below the floor', async () => {
    const restoreEnv = withSupabaseEnv();
    const originalFetch = global.fetch;
    try {
      const calls = [];
      global.fetch = stubSupabaseFetch(
        [{ event_key: 'neo_n3:50:0xa:0:1', request_id: '50', last_error: null }],
        calls
      );
      const patched = await quarantineRelayerJobsBelowRequestId({
        network: 'testnet',
        chain: 'neo_n3',
        ltRequestId: 10,
        statuses: ['queued'],
      });
      assert.equal(patched, 0);
      assert.equal(calls.filter((call) => call.method === 'PATCH').length, 0);
    } finally {
      global.fetch = originalFetch;
      restoreEnv();
    }
  });
});
