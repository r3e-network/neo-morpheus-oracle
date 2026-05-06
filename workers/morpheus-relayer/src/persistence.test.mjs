import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  getSupabasePersistenceBackoff,
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
