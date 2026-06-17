import test from 'node:test';
import assert from 'node:assert/strict';

import { processAutomationJobs } from './automation.js';

// These tests assert the DURABLE execution-idempotency guarantee: dedup must not
// depend on the process-local in-memory cache. The fake store below faithfully
// mirrors the Supabase conditional-claim semantics used by the real
// claimAutomationJob — a single row, claimed by a conditional UPDATE that only
// matches when the row is still schedulable (status=active and due, OR a stale
// processing/paused-marker reclaim). Only the first matching claim returns the
// row; concurrent duplicate claims see the row already advanced and get null.

const AUTOMATION_PROCESSING_CLAIM_MARKER = '__morpheus_automation_processing_claim__';

const automationConfig = {
  automation: {
    enabled: true,
    batchSize: 10,
    maxQueuedPerTick: 10,
    defaultPriceCooldownMs: 60000,
    claimStaleMs: 120000,
  },
};

const silentLogger = { info() {}, warn() {} };

function parseIso(value) {
  if (!value) return null;
  const ms = Date.parse(String(value));
  return Number.isNaN(ms) ? null : ms;
}

// In-memory durable store with the same conditional-claim contract the relayer
// relies on. `claim` returns the row only when the WHERE predicate matches AND
// atomically applies the supplied fields (advancing execution_count /
// last_queued_request_id when the caller asks). A non-matching claim returns null.
function createDurableStore(initialJob) {
  const job = { ...initialJob };

  function isSchedulable({ dueAtIso, staleBeforeIso }) {
    const status = String(job.status || '').trim();
    const dueAtMs = parseIso(dueAtIso);
    const staleBeforeMs = parseIso(staleBeforeIso);
    const nextRunMs = parseIso(job.next_run_at);
    const updatedMs = parseIso(job.updated_at);

    if (status === 'active') {
      if (dueAtMs === null) return true;
      if (job.next_run_at === null || job.next_run_at === undefined) return true;
      return nextRunMs !== null && nextRunMs <= dueAtMs;
    }
    if (status === 'processing') {
      return staleBeforeMs !== null && updatedMs !== null && updatedMs < staleBeforeMs;
    }
    if (status === 'paused' && String(job.last_error || '') === AUTOMATION_PROCESSING_CLAIM_MARKER) {
      return staleBeforeMs !== null && updatedMs !== null && updatedMs < staleBeforeMs;
    }
    return false;
  }

  return {
    job,
    snapshot() {
      return { ...job };
    },
    fetch() {
      return [{ ...job }];
    },
    claim(automationId, fields, options = {}) {
      if (automationId !== job.automation_id) return null;
      if (!isSchedulable(options)) return null;
      Object.assign(job, fields, { updated_at: new Date().toISOString() });
      return { ...job };
    },
    patch(automationId, fields) {
      if (automationId !== job.automation_id) return;
      // Mirror a Supabase PATCH: caller-supplied updated_at wins (so a test can age a
      // row into the stale-reclaim window); otherwise stamp now.
      const stamped = 'updated_at' in fields ? {} : { updated_at: new Date().toISOString() };
      Object.assign(job, fields, stamped);
    },
  };
}

function baseJob(overrides = {}) {
  return {
    automation_id: 'automation:neo_n3:idem',
    status: 'active',
    chain: 'neo_n3',
    requester: '0x0c3146e78efc42bfb7d4cc2e06e3efd063c01c56',
    callback_contract: '0x8c506f224d82e67200f20d9d5361f767f0756e3b',
    callback_method: 'onOracleResult',
    execution_request_type: 'privacy_oracle',
    execution_payload: { provider: 'twelvedata' },
    trigger_type: 'interval',
    trigger_config: { interval_ms: 60000, start_at: new Date(0).toISOString() },
    next_run_at: new Date(0).toISOString(),
    last_run_at: null,
    execution_count: 0,
    max_executions: null,
    last_queued_request_id: null,
    last_error: null,
    updated_at: new Date(0).toISOString(),
    ...overrides,
  };
}

function makeDeps(store, { queueImpl } = {}) {
  const broadcasts = [];
  const runs = [];
  const queueNeoN3AutomationRequest = async (
    _config,
    _requester,
    _requestType,
    _payloadText,
    _callbackContract,
    _callbackMethod,
    requestId
  ) => {
    broadcasts.push(requestId);
    if (queueImpl) return queueImpl(requestId);
    return {
      request_id: requestId,
      tx_hash: `0xtx-${requestId}`,
      target_chain: 'neo_n3',
    };
  };
  return {
    broadcasts,
    runs,
    deps: {
      fetchActiveAutomationJobs: async () => store.fetch(),
      claimAutomationJob: async (automationId, fields, options) =>
        store.claim(automationId, fields, options),
      patchAutomationJob: async (automationId, fields) => store.patch(automationId, fields),
      insertAutomationRun: async (record) => {
        runs.push(record);
      },
      queueNeoN3AutomationRequest,
    },
  };
}

test('two concurrent claims of the same due execution queue exactly one request', async () => {
  const store = createDurableStore(baseJob());
  const { broadcasts, runs, deps } = makeDeps(store);

  // Both ticks observe the SAME due row (concurrent fetch), then race to claim.
  // The store's conditional claim is the durable arbiter: the first claim advances
  // execution_count + pins last_queued_request_id and wins; the second sees the row
  // already at status=processing (not stale) and gets null → no-op.
  const [a, b] = await Promise.all([
    processAutomationJobs(automationConfig, silentLogger, deps),
    processAutomationJobs(automationConfig, silentLogger, deps),
  ]);

  const totalQueued = a.queued + b.queued;
  assert.equal(totalQueued, 1, 'exactly one tick queues the execution');
  assert.equal(broadcasts.length, 1, 'exactly one on-chain queue broadcast');
  assert.equal(broadcasts[0], 'automation:neo_n3:automation:neo_n3:idem:1');

  const queuedRuns = runs.filter((r) => r.status === 'queued');
  assert.equal(queuedRuns.length, 1, 'exactly one queued run recorded');

  const finalJob = store.snapshot();
  assert.equal(finalJob.execution_count, 1, 'execution_count advanced exactly once');
  assert.equal(finalJob.last_queued_request_id, 'automation:neo_n3:automation:neo_n3:idem:1');
});

test('reclaim after a crashed broadcast does not double-queue the same execution', async () => {
  // Simulate a crash AFTER the on-chain broadcast but BEFORE the finalize patch.
  // The durable claim already advanced execution_count=1 and pinned the request_id,
  // so the row is left at status=processing with the OLD updated_at. The fresh,
  // post-restart process has an EMPTY in-memory cache — durability must carry dedup.
  const crashTimeIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const store = createDurableStore(
    baseJob({
      status: 'processing',
      execution_count: 1,
      last_queued_request_id: 'automation:neo_n3:automation:neo_n3:idem:1',
      last_error: null,
      updated_at: crashTimeIso, // stale → eligible for reclaim
    })
  );
  const { broadcasts, runs, deps } = makeDeps(store);

  const result = await processAutomationJobs(automationConfig, silentLogger, deps);

  // The reclaim re-broadcasts the SAME count-based request_id (the kernel dedups it
  // on-chain), and must NOT mint a new id or advance the count a second time.
  assert.equal(broadcasts.length, 1, 'reclaim broadcasts at most the same logical request');
  assert.equal(
    broadcasts[0],
    'automation:neo_n3:automation:neo_n3:idem:1',
    'reclaim reuses the pinned count-based request_id'
  );

  const finalJob = store.snapshot();
  assert.equal(finalJob.execution_count, 1, 'execution_count NOT advanced a second time');
  assert.equal(finalJob.last_queued_request_id, 'automation:neo_n3:automation:neo_n3:idem:1');
  // No "queued" run for a NEW execution id: the only id ever queued is :1.
  const distinctQueuedIds = new Set(
    runs.filter((r) => r.queued_request_id).map((r) => r.queued_request_id)
  );
  assert.deepEqual([...distinctQueuedIds], ['automation:neo_n3:automation:neo_n3:idem:1']);
  assert.equal(result.failed, 0);
});

test('reclaim treats an on-chain duplicate broadcast as a no-op (no extra execution)', async () => {
  // Same crash setup, but the kernel reports the request_id already used (the
  // pre-crash broadcast landed). The reclaim must finalize WITHOUT advancing the
  // count, leaving exactly one logical execution.
  const crashTimeIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const store = createDurableStore(
    baseJob({
      status: 'processing',
      execution_count: 1,
      last_queued_request_id: 'automation:neo_n3:automation:neo_n3:idem:1',
      updated_at: crashTimeIso,
    })
  );
  const { broadcasts, runs, deps } = makeDeps(store, {
    queueImpl: (requestId) => ({ duplicate: true, request_id: requestId, target_chain: 'neo_n3' }),
  });

  const result = await processAutomationJobs(automationConfig, silentLogger, deps);

  assert.equal(broadcasts.length, 1);
  assert.equal(broadcasts[0], 'automation:neo_n3:automation:neo_n3:idem:1');
  const finalJob = store.snapshot();
  assert.equal(finalJob.execution_count, 1, 'duplicate broadcast does not advance the count');
  assert.equal(result.skipped, 1, 'duplicate is accounted as skipped, not queued');
  assert.equal(result.queued, 0);
  const skippedRuns = runs.filter((r) => r.status === 'skipped');
  assert.equal(skippedRuns.length, 1);
});

test('the durable claim advances the count atomically (claim carries the pinned id)', async () => {
  // Direct assertion that the FRESH claim itself advances execution_count and pins
  // the request_id (so a duplicate claim attempt finds the row already advanced),
  // rather than deferring the advance to a post-broadcast patch.
  const store = createDurableStore(baseJob());
  const claimCalls = [];
  const { deps } = makeDeps(store);
  const wrappedDeps = {
    ...deps,
    claimAutomationJob: async (automationId, fields, options) => {
      claimCalls.push({ automationId, fields: { ...fields } });
      return store.claim(automationId, fields, options);
    },
  };

  await processAutomationJobs(automationConfig, silentLogger, wrappedDeps);

  assert.equal(claimCalls.length, 1);
  assert.equal(claimCalls[0].fields.status, 'processing');
  assert.equal(
    claimCalls[0].fields.execution_count,
    1,
    'claim PATCH advances execution_count atomically'
  );
  assert.equal(
    claimCalls[0].fields.last_queued_request_id,
    'automation:neo_n3:automation:neo_n3:idem:1',
    'claim PATCH pins the count-based request_id atomically'
  );
});

test('a transient broadcast failure then reclaim retries the SAME execution (no double-queue)', async () => {
  // First tick: claim advances count=1 + pins id(1), then the broadcast throws a
  // non-terminal (false-negative) error. The row must stay in the stale-reclaim lane
  // so the retry re-uses id(1) instead of minting a new logical execution.
  const store = createDurableStore(baseJob());
  let throwOnce = true;
  const first = makeDeps(store, {
    queueImpl: (requestId) => {
      if (throwOnce) {
        throwOnce = false;
        throw new Error('rpc timeout');
      }
      return { request_id: requestId, tx_hash: `0xtx-${requestId}`, target_chain: 'neo_n3' };
    },
  });

  const firstResult = await processAutomationJobs(automationConfig, silentLogger, first.deps);
  assert.equal(firstResult.failed, 1);
  assert.deepEqual(first.broadcasts, ['automation:neo_n3:automation:neo_n3:idem:1']);
  const afterFailure = store.snapshot();
  assert.equal(afterFailure.status, 'processing', 'failed in-flight execution stays reclaimable');
  assert.equal(afterFailure.execution_count, 1, 'count advanced exactly once at claim');
  assert.equal(afterFailure.last_queued_request_id, 'automation:neo_n3:automation:neo_n3:idem:1');

  // Age the row past claimStaleMs so the next tick reclaims it.
  store.patch(afterFailure.automation_id, { updated_at: new Date(0).toISOString() });

  const second = makeDeps(store);
  await processAutomationJobs(automationConfig, silentLogger, second.deps);

  // The reclaim retries the SAME pinned id — not :2.
  assert.deepEqual(second.broadcasts, ['automation:neo_n3:automation:neo_n3:idem:1']);
  assert.equal(store.snapshot().execution_count, 1, 'reclaim does not advance the count again');
});

test('a second sequential tick advances to the NEXT execution (count increments per real execution)', async () => {
  // After a clean execution finalizes (status back to active, count=1), the next
  // due tick must mint execution :2 — confirming the dedup does not freeze progress.
  const store = createDurableStore(baseJob());
  const first = makeDeps(store);
  await processAutomationJobs(automationConfig, silentLogger, first.deps);

  // Make the interval job due again.
  store.patch(store.snapshot().automation_id, { next_run_at: new Date(0).toISOString() });

  const second = makeDeps(store);
  await processAutomationJobs(automationConfig, silentLogger, second.deps);

  assert.deepEqual(first.broadcasts, ['automation:neo_n3:automation:neo_n3:idem:1']);
  assert.deepEqual(second.broadcasts, ['automation:neo_n3:automation:neo_n3:idem:2']);
  assert.equal(store.snapshot().execution_count, 2);
});
