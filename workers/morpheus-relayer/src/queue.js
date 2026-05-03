import {
  buildEventKey,
  clearRetryItem,
  enqueueRetryItem,
  hasProcessedEvent,
  isEventQueuedForRetry,
  incrementMetric,
  removeDeadLetter,
  removeProcessedEvent,
  saveRelayerState,
} from './state.js';
import {
  buildRelayerJobRecord,
  claimRelayerJob,
  fetchRelayerJobsByStatuses,
  hasSupabasePersistence,
  insertRelayerJobIfAbsent,
  patchRelayerJob,
  quarantineRelayerJobsBelowRequestId,
  upsertRelayerJob,
} from './persistence.js';
import { getRequestCursorFloor } from './chain-cursor.js';
import { parseTimestampMs } from '@neo-morpheus-oracle/shared/utils';

export function createPersistor(config, state) {
  return () => saveRelayerState(config.stateFile, state);
}

export async function maybeUpsertJob(logger, event, details) {
  try {
    await upsertRelayerJob(buildRelayerJobRecord(event, details));
  } catch (error) {
    logger.warn(
      { event_key: details.event_key, error },
      'Failed to persist relayer job state to Supabase'
    );
  }
}

export async function upsertJobOrThrow(event, details) {
  return upsertRelayerJob(buildRelayerJobRecord(event, details));
}

export async function deferEventsForBackpressure(
  config,
  state,
  logger,
  chain,
  events,
  persistState
) {
  const maxFreshEventsPerTick = Math.max(
    Number(config.backpressure?.maxFreshEventsPerTick || events.length),
    1
  );
  if (events.length <= maxFreshEventsPerTick) {
    return { processable: events, deferred: [] };
  }

  const processable = events.slice(0, maxFreshEventsPerTick);
  const deferred = events.slice(maxFreshEventsPerTick);
  const nextRetryAt = Date.now() + Math.max(Number(config.backpressure?.deferDelayMs || 5000), 250);
  const nextRetryIso = new Date(nextRetryAt).toISOString();

  for (const event of deferred) {
    enqueueRetryItem(state, chain, event, {
      attempts: 0,
      next_retry_at: nextRetryAt,
      last_error: 'backpressure_deferred',
    });
    await maybeUpsertJob(logger, event, {
      event_key: buildEventKey(event),
      status: 'queued_backpressure',
      attempts: 0,
      last_error: 'backpressure_deferred',
      next_retry_at: nextRetryIso,
    });
  }

  incrementMetric(state, 'backpressure_deferred_total', deferred.length);
  persistState();
  logger.warn(
    {
      chain,
      deferred_count: deferred.length,
      processable_count: processable.length,
      next_retry_at: nextRetryIso,
    },
    'Deferred fresh oracle requests into the retry queue due to backpressure'
  );
  return { processable, deferred };
}

export async function syncManualActions(config, state, logger, chain) {
  let jobs;
  try {
    jobs = await fetchRelayerJobsByStatuses(
      ['manual_retry_requested', 'manual_replay_requested'],
      chain,
      50
    );
  } catch (error) {
    logger.warn(
      { chain, error },
      'Supabase manual-action sync unavailable; continuing without control-plane sync'
    );
    return [];
  }
  if (!jobs.length) return [];

  const applied = [];
  for (const job of jobs) {
    const event = job?.event && typeof job.event === 'object' ? job.event : null;
    if (!event || !event.chain || !event.requestId) {
      await patchRelayerJob(job.event_key, {
        status: 'manual_action_failed',
        last_error: 'missing or invalid event payload for manual action',
        next_retry_at: null,
      });
      continue;
    }

    const eventKey = job.event_key || buildEventKey(event);
    if (job.status === 'manual_replay_requested') {
      removeProcessedEvent(state, chain, eventKey);
    }
    removeDeadLetter(state, chain, eventKey);
    clearRetryItem(state, chain, eventKey);
    enqueueRetryItem(state, chain, event, {
      attempts: 0,
      next_retry_at: Date.now(),
      last_error: null,
      manual_action: job.status,
    });
    incrementMetric(state, 'manual_actions_loaded_total');

    await patchRelayerJob(eventKey, {
      status: 'queued',
      attempts: 0,
      last_error: null,
      next_retry_at: new Date().toISOString(),
      completed_at: null,
    });
    applied.push({ event_key: eventKey, status: job.status });
  }

  if (applied.length) {
    saveRelayerState(config.stateFile, state);
    logger.info({ chain, actions: applied }, 'Loaded manual relayer actions from Supabase');
  }
  return applied;
}

export function extractDurableRetryMeta(job) {
  const retryMeta =
    job?.worker_response &&
    typeof job.worker_response === 'object' &&
    job.worker_response.retry_meta &&
    typeof job.worker_response.retry_meta === 'object'
      ? job.worker_response.retry_meta
      : {};
  return {
    finalize_only: Boolean(retryMeta.finalize_only),
    terminal_error:
      typeof retryMeta.terminal_error === 'string' && retryMeta.terminal_error.trim()
        ? retryMeta.terminal_error.trim()
        : null,
    durable_claimed: Boolean(retryMeta.durable_claimed),
    prepared_fulfillment:
      retryMeta.prepared_fulfillment && typeof retryMeta.prepared_fulfillment === 'object'
        ? retryMeta.prepared_fulfillment
        : null,
  };
}

export function isDurableQueueReadyJob(job, nowMs, staleProcessingMs) {
  const status = String(job?.status || '');
  if (status === 'queued' || status === 'queued_backpressure') return true;
  if (
    status === 'retry_scheduled' ||
    status === 'failure_callback_retry_scheduled' ||
    status === 'callback_retry_scheduled'
  ) {
    const nextRetryAtMs = parseTimestampMs(job?.next_retry_at);
    return nextRetryAtMs === 0 || nextRetryAtMs <= nowMs;
  }
  if (status === 'processing' || status === 'retrying' || status === 'callback_pending') {
    const updatedAtMs = parseTimestampMs(job?.updated_at);
    return updatedAtMs > 0 && nowMs - updatedAtMs >= staleProcessingMs;
  }
  return false;
}

export function ensureDurableQueueAvailable(config, logger, context = 'relayer') {
  if (!config.durableQueue?.enabled) return false;
  const available = hasSupabasePersistence();
  if (available) return true;
  const message = `durable queue enabled but Supabase persistence unavailable during ${context}`;
  if (config.durableQueue?.failClosed) {
    throw new Error(message);
  }
  logger.warn({ context }, message);
  return false;
}

export async function persistFreshEventsToDurableQueue(config, logger, chain, events) {
  if (!events.length) return;
  if (!ensureDurableQueueAvailable(config, logger, `${chain}:fresh-event-persist`)) return;

  const nextRetryAtIso = new Date().toISOString();
  await mapWithConcurrency(events, Math.min(config.concurrency, events.length), async (event) => {
    await insertRelayerJobIfAbsent(
      buildRelayerJobRecord(event, {
        event_key: buildEventKey(event),
        status: 'queued',
        attempts: 0,
        next_retry_at: nextRetryAtIso,
      })
    );
  });
}

export async function claimDurableJobForProcessing(config, logger, event, retryItem = null) {
  if (!config.durableQueue?.enabled) return true;
  if (retryItem?.durable_claimed) return true;
  if (!ensureDurableQueueAvailable(config, logger, `${event.chain}:durable-claim`)) return false;

  const eventKey = buildEventKey(event);
  const staleBeforeIso = new Date(
    Date.now() - Math.max(Number(config.durableQueue?.staleProcessingMs || 120000), 1000)
  ).toISOString();
  const status = retryItem ? 'retrying' : 'processing';
  const attempts = Number(retryItem?.attempts || 0);
  const claim = await claimRelayerJob(
    eventKey,
    {
      status,
      attempts,
      next_retry_at: null,
      worker_response: {
        retry_meta: {
          durable_claimed: true,
          claimed_by: config.instanceId,
          claimed_at: new Date().toISOString(),
          finalize_only: Boolean(retryItem?.finalize_only),
          terminal_error: retryItem?.terminal_error || null,
        },
      },
    },
    {
      readyStatuses: retryItem
        ? [
            'retry_scheduled',
            'failure_callback_retry_scheduled',
            'callback_retry_scheduled',
            'callback_pending',
            'queued',
            'queued_backpressure',
          ]
        : ['queued', 'queued_backpressure'],
      staleStatuses: ['processing', 'retrying', 'callback_pending'],
      staleBeforeIso,
    }
  );
  if (claim) return true;
  logger.info(
    {
      chain: event.chain,
      request_id: event.requestId,
      event_key: eventKey,
      status,
    },
    'Skipped Morpheus oracle request because another relayer instance already claimed it'
  );
  return false;
}

export async function hydrateDurableQueue(config, state, logger, chain, persistState) {
  if (config.mode === 'feed_only') return [];
  if (!ensureDurableQueueAvailable(config, logger, `${chain}:durable-queue-hydration`)) return [];

  const minRequestId =
    Number.isFinite(Number(config.startRequestIds?.[chain])) &&
    Number(config.startRequestIds?.[chain]) > 0
      ? Number(config.startRequestIds?.[chain])
      : null;
  const jobs = await fetchRelayerJobsByStatuses(
    [
      'queued',
      'queued_backpressure',
      'retry_scheduled',
      'failure_callback_retry_scheduled',
      'callback_retry_scheduled',
      'callback_pending',
      'processing',
      'retrying',
    ],
    chain,
    Math.max(Number(config.durableQueue?.syncLimit || 200), 1)
  );
  if (!jobs.length) return [];

  const nowMs = Date.now();
  const hydrated = [];
  for (const job of jobs) {
    const jobRequestId = Number(job?.request_id || job?.requestId || 0);
    if (minRequestId !== null && Number.isFinite(jobRequestId) && jobRequestId < minRequestId) {
      continue;
    }
    if (
      !isDurableQueueReadyJob(job, nowMs, Number(config.durableQueue?.staleProcessingMs || 120000))
    ) {
      continue;
    }
    const event = job?.event && typeof job.event === 'object' ? job.event : null;
    if (!event || !event.chain || !event.requestId) continue;
    const eventKey = job.event_key || buildEventKey(event);
    if (
      hasProcessedEvent(state, chain, eventKey) ||
      isEventQueuedForRetry(state, chain, eventKey)
    ) {
      continue;
    }
    const retryMeta = extractDurableRetryMeta(job);
    if (job.status === 'processing' || job.status === 'retrying') {
      incrementMetric(state, 'stale_reclaims_total');
    }
    enqueueRetryItem(state, chain, event, {
      attempts: Number(job.attempts || 0),
      next_retry_at: parseTimestampMs(job.next_retry_at) || nowMs,
      first_failed_at: job.created_at || new Date(nowMs).toISOString(),
      last_error: job.last_error || null,
      finalize_only: retryMeta.finalize_only,
      terminal_error: retryMeta.terminal_error,
      prepared_fulfillment: retryMeta.prepared_fulfillment,
      durable_claimed: true,
    });
    hydrated.push(eventKey);
  }

  if (hydrated.length > 0) {
    persistState();
    logger.info(
      { chain, hydrated_count: hydrated.length },
      'Hydrated relayer retry queue from durable Supabase jobs'
    );
  }
  return hydrated;
}

export async function quarantineDurableBacklogBelowRequestFloor(config, logger, chain) {
  const minRequestId = getRequestCursorFloor(config, chain);
  if (minRequestId === null) return 0;
  if (!ensureDurableQueueAvailable(config, logger, `${chain}:durable-floor-quarantine`)) return 0;
  const patched = await quarantineRelayerJobsBelowRequestId({
    network: config.network,
    chain,
    ltRequestId: minRequestId,
    statuses: [
      'queued',
      'queued_backpressure',
      'retry_scheduled',
      'failure_callback_retry_scheduled',
      'callback_retry_scheduled',
      'callback_pending',
      'processing',
      'retrying',
    ],
    note: `auto-quarantined below request cursor floor ${minRequestId}`,
  });
  if (patched > 0) {
    logger.info(
      { chain, request_cursor_floor: minRequestId, quarantined_count: patched },
      'Quarantined stale durable relayer jobs below request cursor floor'
    );
  }
  return patched;
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function runWorker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  const width = Math.max(Math.min(limit, items.length), 1);
  await Promise.all(Array.from({ length: width }, () => runWorker()));
  return results;
}
