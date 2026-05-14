import fs from 'node:fs';
import path from 'node:path';
import { resolveKernelIntent } from './router.js';

function defaultChainState() {
  return {
    last_block: null,
    last_request_id: null,
    processed_records: {},
    processed_order: [],
    retry_queue: [],
    dead_letters: [],
  };
}

function defaultMetrics() {
  return {
    ticks_total: 0,
    events_scanned_total: 0,
    events_processed_total: 0,
    events_failed_total: 0,
    duplicates_skipped_total: 0,
    retries_scheduled_total: 0,
    retries_exhausted_total: 0,
    worker_calls_total: 0,
    worker_failures_total: 0,
    fulfill_success_total: 0,
    fulfill_failure_total: 0,
    claim_conflicts_total: 0,
    stale_reclaims_total: 0,
    manual_actions_loaded_total: 0,
    feed_sync_runs_total: 0,
    feed_sync_success_total: 0,
    feed_sync_error_total: 0,
    feed_sync_skipped_total: 0,
    backpressure_deferred_total: 0,
    backpressure_retry_skipped_total: 0,
    last_feed_sync_started_at: null,
    last_feed_sync_completed_at: null,
    last_feed_sync_success_at: null,
    last_feed_sync_duration_ms: null,
    last_tick_started_at: null,
    last_tick_completed_at: null,
    last_tick_duration_ms: null,
    last_run_snapshot_persisted_at: null,
    last_run_snapshot_error_at: null,
  };
}

export function createEmptyRelayerState() {
  return {
    version: 2,
    updated_at: null,
    neo_n3: defaultChainState(),
    metrics: defaultMetrics(),
  };
}

function normalizeChainState(raw) {
  return {
    ...defaultChainState(),
    ...(raw && typeof raw === 'object' ? raw : {}),
    last_request_id: raw?.last_request_id ?? null,
    processed_records:
      raw?.processed_records && typeof raw.processed_records === 'object'
        ? raw.processed_records
        : {},
    processed_order: Array.isArray(raw?.processed_order) ? raw.processed_order : [],
    retry_queue: Array.isArray(raw?.retry_queue) ? raw.retry_queue : [],
    dead_letters: Array.isArray(raw?.dead_letters) ? raw.dead_letters : [],
  };
}

export function loadRelayerState(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      version: parsed?.version || 2,
      updated_at: parsed?.updated_at || null,
      neo_n3: normalizeChainState(parsed?.neo_n3),
      metrics: {
        ...defaultMetrics(),
        ...(parsed?.metrics && typeof parsed.metrics === 'object' ? parsed.metrics : {}),
      },
    };
  } catch {
    return createEmptyRelayerState();
  }
}

export function saveRelayerState(filePath, state) {
  state.updated_at = new Date().toISOString();
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export function buildEventKey(event) {
  return [
    event?.chain || 'unknown',
    event?.requestId || '0',
    event?.txHash || '',
    event?.logIndex ?? '',
    event?.blockNumber ?? '',
  ].join(':');
}

function pruneProcessedRecords(chainState, limit) {
  while (chainState.processed_order.length > limit) {
    const oldestKey = chainState.processed_order.shift();
    if (!oldestKey) continue;
    delete chainState.processed_records[oldestKey];
  }
}

function pruneDeadLetters(chainState, limit) {
  if (chainState.dead_letters.length > limit) {
    chainState.dead_letters = chainState.dead_letters.slice(-limit);
  }
}

export function incrementMetric(state, metricName, delta = 1) {
  if (typeof state.metrics[metricName] !== 'number') {
    state.metrics[metricName] = 0;
  }
  state.metrics[metricName] += delta;
}

export function snapshotMetrics(state) {
  return {
    ...state.metrics,
    retry_queue_sizes: {
      neo_n3: state.neo_n3.retry_queue.length,
    },
    dead_letter_sizes: {
      neo_n3: state.neo_n3.dead_letters.length,
    },
    checkpoints: {
      neo_n3: state.neo_n3.last_block,
    },
    request_checkpoints: {
      neo_n3: state.neo_n3.last_request_id,
    },
  };
}

export function hasProcessedEvent(state, chain, eventOrKey) {
  const key = typeof eventOrKey === 'string' ? eventOrKey : buildEventKey(eventOrKey);
  return Boolean(state?.[chain]?.processed_records?.[key]);
}

export function getProcessedEventRecord(state, chain, eventOrKey) {
  const key = typeof eventOrKey === 'string' ? eventOrKey : buildEventKey(eventOrKey);
  return state?.[chain]?.processed_records?.[key] || null;
}

export function isEventQueuedForRetry(state, chain, eventOrKey) {
  const key = typeof eventOrKey === 'string' ? eventOrKey : buildEventKey(eventOrKey);
  return state?.[chain]?.retry_queue?.some((item) => item.key === key) || false;
}

export function removeProcessedEvent(state, chain, eventOrKey) {
  const key = typeof eventOrKey === 'string' ? eventOrKey : buildEventKey(eventOrKey);
  delete state[chain].processed_records[key];
  state[chain].processed_order = state[chain].processed_order.filter((entry) => entry !== key);
}

export function removeDeadLetter(state, chain, eventOrKey) {
  const key = typeof eventOrKey === 'string' ? eventOrKey : buildEventKey(eventOrKey);
  state[chain].dead_letters = state[chain].dead_letters.filter((entry) => entry.key !== key);
}

export function enqueueRetryItem(state, chain, event, options = {}) {
  const chainState = state[chain];
  const key = buildEventKey(event);
  const item = {
    key,
    event,
    attempts: Number(options.attempts || 0),
    next_retry_at: Number(options.next_retry_at || Date.now()),
    first_failed_at: options.first_failed_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_error: options.last_error || null,
    manual_action: options.manual_action || null,
    finalize_only: Boolean(options.finalize_only),
    terminal_error: options.terminal_error || null,
    prepared_fulfillment:
      options.prepared_fulfillment && typeof options.prepared_fulfillment === 'object'
        ? options.prepared_fulfillment
        : null,
    durable_claimed: Boolean(options.durable_claimed),
  };
  const index = chainState.retry_queue.findIndex((entry) => entry.key === key);
  if (index >= 0) {
    chainState.retry_queue[index] = item;
  } else {
    chainState.retry_queue.push(item);
  }
  return item;
}

export function recordProcessedEvent(state, chain, event, status, meta = {}, limits = {}) {
  const chainState = state[chain];
  const key = buildEventKey(event);
  const kernelIntent = resolveKernelIntent(event.requestType);
  if (!chainState.processed_records[key]) {
    chainState.processed_order.push(key);
  }
  chainState.processed_records[key] = {
    key,
    status,
    request_id: String(event.requestId || '0'),
    request_type: String(event.requestType || ''),
    module_id: kernelIntent.moduleId,
    operation: kernelIntent.operation,
    tx_hash: String(event.txHash || ''),
    block_number: Number(event.blockNumber ?? 0),
    completed_at: new Date().toISOString(),
    ...meta,
  };
  chainState.retry_queue = chainState.retry_queue.filter((item) => item.key !== key);
  if (status === 'exhausted') {
    chainState.dead_letters.push({
      key,
      request_id: String(event.requestId || '0'),
      request_type: String(event.requestType || ''),
      module_id: kernelIntent.moduleId,
      operation: kernelIntent.operation,
      chain,
      event,
      exhausted_at: new Date().toISOString(),
      ...meta,
    });
    pruneDeadLetters(chainState, limits.deadLetterLimit || 200);
  }
  pruneProcessedRecords(chainState, limits.processedCacheSize || 5000);
  return chainState.processed_records[key];
}

export function scheduleRetry(state, chain, event, errorMessage, config) {
  const chainState = state[chain];
  const key = buildEventKey(event);
  const existing = chainState.retry_queue.find((item) => item.key === key);
  const attempts = (existing?.attempts || 0) + 1;

  if (attempts > config.maxRetries) {
    chainState.retry_queue = chainState.retry_queue.filter((item) => item.key !== key);
    return {
      status: 'exhausted',
      key,
      attempts,
      error: errorMessage,
    };
  }

  const delayMs = Math.min(
    config.retryBaseDelayMs * 2 ** Math.max(attempts - 1, 0),
    config.retryMaxDelayMs
  );
  const item = {
    key,
    event,
    attempts,
    next_retry_at: Date.now() + delayMs,
    first_failed_at: existing?.first_failed_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_error: errorMessage,
  };

  if (existing) {
    const index = chainState.retry_queue.findIndex((entry) => entry.key === key);
    chainState.retry_queue[index] = item;
  } else {
    chainState.retry_queue.push(item);
  }

  return { status: 'scheduled', key, item };
}

export function getDueRetryItems(state, chain, now = Date.now()) {
  const chainState = state[chain];
  return chainState.retry_queue
    .filter((item) => Number(item.next_retry_at || 0) <= now)
    .sort((left, right) => Number(left.next_retry_at || 0) - Number(right.next_retry_at || 0));
}

export function clearRetryItem(state, chain, eventOrKey) {
  const key = typeof eventOrKey === 'string' ? eventOrKey : buildEventKey(eventOrKey);
  state[chain].retry_queue = state[chain].retry_queue.filter((item) => item.key !== key);
}
