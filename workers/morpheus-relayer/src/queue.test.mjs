import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { extractDurableRetryMeta, isDurableQueueReadyJob } from './queue.js';

// ===================================================================
// extractDurableRetryMeta
// ===================================================================

describe('extractDurableRetryMeta', () => {
  it('extracts finalize_only and terminal_error from well-formed job', () => {
    const job = {
      worker_response: {
        retry_meta: {
          finalize_only: true,
          terminal_error: 'updater not set',
          durable_claimed: true,
          prepared_fulfillment: {
            success: true,
            result: '{"ok":true}',
            error: '',
            result_bytes_base64: '',
            route: '/oracle/fetch',
            module_id: 'oracle.fetch',
            operation: 'privacy_oracle',
            worker_status: 200,
            verification_signature: 'sig',
          },
        },
      },
    };
    const meta = extractDurableRetryMeta(job);
    assert.equal(meta.finalize_only, true);
    assert.equal(meta.terminal_error, 'updater not set');
    assert.equal(meta.durable_claimed, true);
    assert.deepEqual(meta.prepared_fulfillment, {
      success: true,
      result: '{"ok":true}',
      error: '',
      result_bytes_base64: '',
      route: '/oracle/fetch',
      module_id: 'oracle.fetch',
      operation: 'privacy_oracle',
      worker_status: 200,
      verification_signature: 'sig',
    });
  });

  it('returns safe defaults for null/undefined job', () => {
    assert.deepEqual(extractDurableRetryMeta(null), {
      finalize_only: false,
      terminal_error: null,
      durable_claimed: false,
      prepared_fulfillment: null,
    });
    assert.deepEqual(extractDurableRetryMeta(undefined), {
      finalize_only: false,
      terminal_error: null,
      durable_claimed: false,
      prepared_fulfillment: null,
    });
  });

  it('returns safe defaults when worker_response is missing', () => {
    const meta = extractDurableRetryMeta({});
    assert.equal(meta.finalize_only, false);
    assert.equal(meta.terminal_error, null);
    assert.equal(meta.durable_claimed, false);
    assert.equal(meta.prepared_fulfillment, null);
  });

  it('returns safe defaults when retry_meta is missing', () => {
    const meta = extractDurableRetryMeta({ worker_response: {} });
    assert.equal(meta.finalize_only, false);
    assert.equal(meta.terminal_error, null);
    assert.equal(meta.prepared_fulfillment, null);
  });

  it('returns safe defaults when worker_response is not an object', () => {
    const meta = extractDurableRetryMeta({ worker_response: 'string' });
    assert.equal(meta.finalize_only, false);
    assert.equal(meta.terminal_error, null);
    assert.equal(meta.prepared_fulfillment, null);
  });

  it('trims terminal_error whitespace', () => {
    const job = {
      worker_response: {
        retry_meta: {
          terminal_error: '  some error  ',
        },
      },
    };
    const meta = extractDurableRetryMeta(job);
    assert.equal(meta.terminal_error, 'some error');
  });

  it('returns null for blank terminal_error', () => {
    const job = {
      worker_response: {
        retry_meta: {
          terminal_error: '   ',
        },
      },
    };
    const meta = extractDurableRetryMeta(job);
    assert.equal(meta.terminal_error, null);
  });

  it('coerces finalize_only to boolean', () => {
    const job = {
      worker_response: {
        retry_meta: {
          finalize_only: 1,
        },
      },
    };
    const meta = extractDurableRetryMeta(job);
    assert.equal(meta.finalize_only, true);
    assert.equal(typeof meta.finalize_only, 'boolean');
  });
});

// ===================================================================
// isDurableQueueReadyJob
// ===================================================================

describe('isDurableQueueReadyJob', () => {
  const NOW = Date.now();
  const STALE_MS = 120_000; // 2 minutes

  // --- queued statuses are always ready ---
  it('returns true for "queued" status', () => {
    assert.equal(isDurableQueueReadyJob({ status: 'queued' }, NOW, STALE_MS), true);
  });

  it('returns true for "queued_backpressure" status', () => {
    assert.equal(isDurableQueueReadyJob({ status: 'queued_backpressure' }, NOW, STALE_MS), true);
  });

  // --- retry_scheduled: ready only when next_retry_at has passed ---
  it('returns true for retry_scheduled when next_retry_at is in the past', () => {
    const pastIso = new Date(NOW - 10_000).toISOString();
    assert.equal(
      isDurableQueueReadyJob({ status: 'retry_scheduled', next_retry_at: pastIso }, NOW, STALE_MS),
      true
    );
  });

  it('returns false for retry_scheduled when next_retry_at is in the future', () => {
    const futureIso = new Date(NOW + 60_000).toISOString();
    assert.equal(
      isDurableQueueReadyJob(
        { status: 'retry_scheduled', next_retry_at: futureIso },
        NOW,
        STALE_MS
      ),
      false
    );
  });

  it('returns true for retry_scheduled when next_retry_at is exactly now', () => {
    const nowIso = new Date(NOW).toISOString();
    assert.equal(
      isDurableQueueReadyJob({ status: 'retry_scheduled', next_retry_at: nowIso }, NOW, STALE_MS),
      true
    );
  });

  it('returns true for retry_scheduled with missing/zero next_retry_at', () => {
    assert.equal(
      isDurableQueueReadyJob({ status: 'retry_scheduled', next_retry_at: null }, NOW, STALE_MS),
      true
    );
    assert.equal(isDurableQueueReadyJob({ status: 'retry_scheduled' }, NOW, STALE_MS), true);
  });

  // --- failure_callback_retry_scheduled uses same logic ---
  it('returns true for failure_callback_retry_scheduled when due', () => {
    const pastIso = new Date(NOW - 5_000).toISOString();
    assert.equal(
      isDurableQueueReadyJob(
        { status: 'failure_callback_retry_scheduled', next_retry_at: pastIso },
        NOW,
        STALE_MS
      ),
      true
    );
  });

  it('returns true for callback_retry_scheduled when due', () => {
    const pastIso = new Date(NOW - 5_000).toISOString();
    assert.equal(
      isDurableQueueReadyJob(
        { status: 'callback_retry_scheduled', next_retry_at: pastIso },
        NOW,
        STALE_MS
      ),
      true
    );
  });

  it('returns true for stale callback_pending jobs', () => {
    const staleIso = new Date(NOW - STALE_MS - 1000).toISOString();
    assert.equal(
      isDurableQueueReadyJob({ status: 'callback_pending', updated_at: staleIso }, NOW, STALE_MS),
      true
    );
  });

  // --- processing/retrying: ready only when stale ---
  it('returns true for "processing" when updated_at is stale', () => {
    const staleIso = new Date(NOW - STALE_MS - 1000).toISOString();
    assert.equal(
      isDurableQueueReadyJob({ status: 'processing', updated_at: staleIso }, NOW, STALE_MS),
      true
    );
  });

  it('returns false for "processing" when updated_at is recent', () => {
    const recentIso = new Date(NOW - 1000).toISOString();
    assert.equal(
      isDurableQueueReadyJob({ status: 'processing', updated_at: recentIso }, NOW, STALE_MS),
      false
    );
  });

  it('returns true for "retrying" when updated_at is stale', () => {
    const staleIso = new Date(NOW - STALE_MS - 5000).toISOString();
    assert.equal(
      isDurableQueueReadyJob({ status: 'retrying', updated_at: staleIso }, NOW, STALE_MS),
      true
    );
  });

  it('returns false for "retrying" when updated_at is recent', () => {
    const recentIso = new Date(NOW - 10_000).toISOString();
    assert.equal(
      isDurableQueueReadyJob({ status: 'retrying', updated_at: recentIso }, NOW, STALE_MS),
      false
    );
  });

  it('returns false for "processing" with missing updated_at', () => {
    assert.equal(isDurableQueueReadyJob({ status: 'processing' }, NOW, STALE_MS), false);
  });

  // --- terminal statuses are never ready ---
  it('returns false for "fulfilled" status', () => {
    assert.equal(isDurableQueueReadyJob({ status: 'fulfilled' }, NOW, STALE_MS), false);
  });

  it('returns false for "failed" status', () => {
    assert.equal(isDurableQueueReadyJob({ status: 'failed' }, NOW, STALE_MS), false);
  });

  it('returns false for "settled" status', () => {
    assert.equal(isDurableQueueReadyJob({ status: 'settled' }, NOW, STALE_MS), false);
  });

  it('returns false for "failed_config" status', () => {
    assert.equal(isDurableQueueReadyJob({ status: 'failed_config' }, NOW, STALE_MS), false);
  });

  // --- edge cases ---
  it('returns false for null/undefined job', () => {
    assert.equal(isDurableQueueReadyJob(null, NOW, STALE_MS), false);
    assert.equal(isDurableQueueReadyJob(undefined, NOW, STALE_MS), false);
  });

  it('returns false for job with empty status', () => {
    assert.equal(isDurableQueueReadyJob({ status: '' }, NOW, STALE_MS), false);
    assert.equal(isDurableQueueReadyJob({}, NOW, STALE_MS), false);
  });
});
