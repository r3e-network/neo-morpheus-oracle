import { createRelayerConfig } from './config.js';
import { createLogger } from './logger.js';
import {
  guardQueuedAutomationExecution,
  handleAutomationControlRequest,
  isAutomationControlRequestType,
  processAutomationJobs,
} from './automation.js';
import { callPhala } from './phala.js';
import {
  buildFulfillmentDigestBytes,
  buildWorkerPayload,
  decodePayloadText,
  encodeFulfillmentResult,
  isOperatorOnlyRequestType,
  resolveWorkerRoute,
} from './router.js';
import {
  buildRelayerJobRecord,
  claimRelayerJob,
  fetchRelayerJobsByStatuses,
  hasSupabasePersistence,
  insertRelayerJobIfAbsent,
  patchRelayerJob,
  persistRelayerRun,
  quarantineRelayerJobsBelowRequestId,
  upsertRelayerJob,
} from './persistence.js';
import {
  buildEventKey,
  clearRetryItem,
  enqueueRetryItem,
  getDueRetryItems,
  hasProcessedEvent,
  incrementMetric,
  isEventQueuedForRetry,
  loadRelayerState,
  recordProcessedEvent,
  removeDeadLetter,
  removeProcessedEvent,
  saveRelayerState,
  scheduleRetry,
  snapshotMetrics,
} from './state.js';
import {
  fulfillNeoN3Request,
  getNeoN3IndexedBlock,
  getNeoN3LatestBlock,
  getNeoN3LatestRequestId,
  hasNeoN3RelayerConfig,
  scanNeoN3OracleRequests,
  scanNeoN3OracleRequestsById,
  scanNeoN3OracleRequestsViaN3Index,
} from './neo-n3.js';
import {
  fulfillNeoXRequest,
  getNeoXLatestBlock,
  hasNeoXRelayerConfig,
  scanNeoXOracleRequests,
} from './neo-x.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getFeedSyncDelayMs(config, state, nowMs = Date.now()) {
  if (!config.feedSync?.enabled) return Number.POSITIVE_INFINITY;
  const intervalMs = Math.max(Number(config.feedSync.intervalMs) || 0, 0);
  if (intervalMs <= 0) return 0;

  const lastSuccessAt = state.metrics.last_feed_sync_success_at
    ? new Date(state.metrics.last_feed_sync_success_at).getTime()
    : 0;
  if (!lastSuccessAt) return 0;

  return Math.max(lastSuccessAt + intervalMs - nowMs, 0);
}

function normalizeErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function trimOnchainErrorMessage(value, maxLength = 240) {
  const text = normalizeErrorMessage(value).trim();
  if (!text) return 'request execution failed';
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function isAlreadyFulfilledError(message) {
  const normalized = normalizeErrorMessage(message).toLowerCase();
  return (
    normalized.includes('already fulfilled') ||
    normalized.includes('request already fulfilled') ||
    normalized.includes('reason: request already fulfilled')
  );
}

function isTerminalConfigurationError(message) {
  const normalized = normalizeErrorMessage(message).toLowerCase();
  return (
    normalized.includes('reason: unauthorized') ||
    normalized.includes('invalid signature') ||
    normalized.includes('verifier rejected signature') ||
    normalized.includes('oracle verifier') ||
    normalized.includes('updater not set') ||
    normalized.includes('callback not allowed') ||
    (normalized.includes('called contract') && normalized.includes('not found'))
  );
}

function computeRetryDelayMs(config, attempts) {
  return Math.min(config.retryBaseDelayMs * 2 ** Math.max(attempts - 1, 0), config.retryMaxDelayMs);
}

async function deferEventsForBackpressure(config, state, logger, chain, events, persistState) {
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

async function maybeUpsertJob(logger, event, details) {
  try {
    await upsertRelayerJob(buildRelayerJobRecord(event, details));
  } catch (error) {
    logger.warn(
      { event_key: details.event_key, error },
      'Failed to persist relayer job state to Supabase'
    );
  }
}

async function maybePersistRun(logger, config, result) {
  try {
    await persistRelayerRun(config, result);
  } catch (error) {
    logger.warn({ error }, 'Failed to persist relayer run snapshot to Supabase');
  }
}

async function syncManualActions(config, state, logger, chain) {
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

async function processOracleRequest(config, event) {
  const payload = decodePayloadText(event.payloadText);
  if (isAutomationControlRequestType(event.requestType)) {
    const automationResponse = await handleAutomationControlRequest(event, payload);
    const fulfillment = encodeFulfillmentResult(event.requestType, automationResponse);
    const verification = await signFulfillmentPayload(config, event.chain, {
      requestId: event.requestId,
      requestType: event.requestType,
      success: fulfillment.success,
      result: fulfillment.result || '',
      result_bytes_base64: fulfillment.result_bytes_base64 || '',
      error: fulfillment.error || '',
    });

    const fulfillTx =
      event.chain === 'neo_n3'
        ? await fulfillNeoN3Request(
            config,
            event.requestId,
            fulfillment.success,
            fulfillment.result,
            fulfillment.error,
            verification.signature,
            fulfillment.result_bytes_base64
          )
        : await fulfillNeoXRequest(
            config,
            event.requestId,
            fulfillment.success,
            fulfillment.result,
            fulfillment.error,
            verification.signature,
            fulfillment.result_bytes_base64
          );

    return {
      ...fulfillment,
      route: automationResponse.route,
      worker_response: automationResponse.body,
      worker_status: automationResponse.status,
      fulfill_tx: fulfillTx,
      verification_signature: verification.signature,
    };
  }
  const automationGuard = await guardQueuedAutomationExecution(event);
  if (automationGuard.blocked) {
    const guardResponse = {
      ok: false,
      status: 409,
      body: {
        mode: 'automation',
        action: 'execute',
        automation_id: automationGuard.automation_id,
        status: automationGuard.job?.status || 'cancelled',
        chain: event.chain,
        error: automationGuard.error,
      },
    };
    const fulfillment = encodeFulfillmentResult(event.requestType, guardResponse);
    const verification = await signFulfillmentPayload(config, event.chain, {
      requestId: event.requestId,
      requestType: event.requestType,
      success: fulfillment.success,
      result: fulfillment.result || '',
      result_bytes_base64: fulfillment.result_bytes_base64 || '',
      error: fulfillment.error || '',
    });

    const fulfillTx =
      event.chain === 'neo_n3'
        ? await fulfillNeoN3Request(
            config,
            event.requestId,
            fulfillment.success,
            fulfillment.result,
            fulfillment.error,
            verification.signature,
            fulfillment.result_bytes_base64
          )
        : await fulfillNeoXRequest(
            config,
            event.requestId,
            fulfillment.success,
            fulfillment.result,
            fulfillment.error,
            verification.signature,
            fulfillment.result_bytes_base64
          );

    return {
      ...fulfillment,
      route: automationGuard.route,
      worker_response: guardResponse.body,
      worker_status: guardResponse.status,
      fulfill_tx: fulfillTx,
      verification_signature: verification.signature,
    };
  }
  if (isOperatorOnlyRequestType(event.requestType)) {
    const verification = await signFulfillmentPayload(config, event.chain, {
      requestId: event.requestId,
      requestType: event.requestType,
      success: false,
      result: '',
      result_bytes_base64: '',
      error:
        'datafeed requests are operator-only; users should read synchronized on-chain feed data',
    });
    return {
      success: false,
      result: '',
      error:
        'datafeed requests are operator-only; users should read synchronized on-chain feed data',
      route: 'operator-only:rejected',
      worker_response: null,
      worker_status: null,
      fulfill_tx:
        event.chain === 'neo_n3'
          ? await fulfillNeoN3Request(
              config,
              event.requestId,
              false,
              '',
              'datafeed requests are operator-only; users should read synchronized on-chain feed data',
              verification.signature,
              ''
            )
          : await fulfillNeoXRequest(
              config,
              event.requestId,
              false,
              '',
              'datafeed requests are operator-only; users should read synchronized on-chain feed data',
              verification.signature,
              ''
            ),
      verification_signature: verification.signature,
    };
  }
  const route = resolveWorkerRoute(event.requestType, payload);
  const workerPayload = buildWorkerPayload(
    event.chain,
    event.requestType,
    payload,
    event.requestId,
    {
      requester: event.requester,
      callbackContract: event.callbackContract,
      callbackMethod: event.callbackMethod,
    }
  );
  const workerResponse = await callPhala(config, route, workerPayload);
  const fulfillment = encodeFulfillmentResult(event.requestType, workerResponse);
  const verification = await signFulfillmentPayload(config, event.chain, {
    requestId: event.requestId,
    requestType: event.requestType,
    success: fulfillment.success,
    result: fulfillment.result || '',
    result_bytes_base64: fulfillment.result_bytes_base64 || '',
    error: fulfillment.error || '',
  });

  if (event.chain === 'neo_n3') {
    const tx = await fulfillNeoN3Request(
      config,
      event.requestId,
      fulfillment.success,
      fulfillment.result,
      fulfillment.error,
      verification.signature,
      fulfillment.result_bytes_base64
    );
    return {
      ...fulfillment,
      route,
      worker_response: workerResponse.body,
      worker_status: workerResponse.status,
      fulfill_tx: tx,
      verification_signature: verification.signature,
    };
  }

  const tx = await fulfillNeoXRequest(
    config,
    event.requestId,
    fulfillment.success,
    fulfillment.result,
    fulfillment.error,
    verification.signature,
    fulfillment.result_bytes_base64
  );
  return {
    ...fulfillment,
    route,
    worker_response: workerResponse.body,
    worker_status: workerResponse.status,
    fulfill_tx: tx,
    verification_signature: verification.signature,
  };
}

async function finalizeFailedRequest(config, event, errorMessage) {
  const safeError = trimOnchainErrorMessage(errorMessage);
  const verification = await signFulfillmentPayload(config, event.chain, {
    requestId: event.requestId,
    requestType: event.requestType,
    success: false,
    result: '',
    result_bytes_base64: '',
    error: safeError,
  });
  const fulfillTx =
    event.chain === 'neo_n3'
      ? await fulfillNeoN3Request(
          config,
          event.requestId,
          false,
          '',
          safeError,
          verification.signature,
          ''
        )
      : await fulfillNeoXRequest(
          config,
          event.requestId,
          false,
          '',
          safeError,
          verification.signature,
          ''
        );
  return {
    success: false,
    result: '',
    error: safeError,
    route: 'failure-finalize',
    worker_response: null,
    worker_status: null,
    fulfill_tx: fulfillTx,
    verification_signature: verification.signature,
  };
}

async function signFulfillmentPayload(config, chain, fulfillment) {
  const digestBytes = buildFulfillmentDigestBytes(
    fulfillment.requestId,
    fulfillment.requestType,
    fulfillment.success,
    fulfillment.result,
    fulfillment.error,
    fulfillment.result_bytes_base64 || ''
  );
  const response = await callPhala(config, '/sign/payload', {
    target_chain: chain,
    key_role: 'oracle_verifier',
    data_hex: digestBytes.toString('hex'),
  });
  if (!response.ok || typeof response.body?.signature !== 'string' || !response.body.signature) {
    throw new Error(
      typeof response.body?.error === 'string'
        ? response.body.error
        : `worker signing failed with status ${response.status}`
    );
  }
  return response.body;
}

function createPersistor(config, state) {
  return () => saveRelayerState(config.stateFile, state);
}

function shouldRunFeedSync(config) {
  return config.mode !== 'requests_only';
}

function shouldRunRequestProcessing(config) {
  return config.mode !== 'feed_only';
}

function getRequestCursorFloor(config, chain) {
  const raw = Number(config.startRequestIds?.[chain]);
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

function pruneRetryQueueBelowRequestFloor(state, chain, minRequestId) {
  if (minRequestId === null) return 0;
  const before = state[chain].retry_queue.length;
  state[chain].retry_queue = state[chain].retry_queue.filter((item) => {
    const requestId = Number(item?.event?.requestId || 0);
    return !Number.isFinite(requestId) || requestId >= minRequestId;
  });
  return before - state[chain].retry_queue.length;
}

function parseTimestampMs(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function extractDurableRetryMeta(job) {
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
  };
}

function isDurableQueueReadyJob(job, nowMs, staleProcessingMs) {
  const status = String(job?.status || '');
  if (status === 'queued' || status === 'queued_backpressure') return true;
  if (status === 'retry_scheduled' || status === 'failure_callback_retry_scheduled') {
    const nextRetryAtMs = parseTimestampMs(job?.next_retry_at);
    return nextRetryAtMs === 0 || nextRetryAtMs <= nowMs;
  }
  if (status === 'processing' || status === 'retrying') {
    const updatedAtMs = parseTimestampMs(job?.updated_at);
    return updatedAtMs > 0 && nowMs - updatedAtMs >= staleProcessingMs;
  }
  return false;
}

function ensureDurableQueueAvailable(config, logger, context = 'relayer') {
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

async function persistFreshEventsToDurableQueue(config, logger, chain, events) {
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

async function claimDurableJobForProcessing(config, logger, event, retryItem = null) {
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
        ? ['retry_scheduled', 'failure_callback_retry_scheduled', 'queued', 'queued_backpressure']
        : ['queued', 'queued_backpressure'],
      staleStatuses: ['processing', 'retrying'],
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

async function hydrateDurableQueue(config, state, logger, chain, persistState) {
  if (!shouldRunRequestProcessing(config)) return [];
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
    enqueueRetryItem(state, chain, event, {
      attempts: Number(job.attempts || 0),
      next_retry_at: parseTimestampMs(job.next_retry_at) || nowMs,
      first_failed_at: job.created_at || new Date(nowMs).toISOString(),
      last_error: job.last_error || null,
      finalize_only: retryMeta.finalize_only,
      terminal_error: retryMeta.terminal_error,
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

async function quarantineDurableBacklogBelowRequestFloor(config, logger, chain) {
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

export {
  shouldRunFeedSync,
  shouldRunRequestProcessing,
  getRequestCursorFloor,
  pruneRetryQueueBelowRequestFloor,
  quarantineDurableBacklogBelowRequestFloor,
  persistFreshEventsToDurableQueue,
  hydrateDurableQueue,
};

export function resolveChainFromBlock(config, state, chain, confirmedTip, logger = null) {
  const configuredStart = config.startBlocks[chain];
  const defaultStart = Math.max(configuredStart ?? 0, 0);
  const lastBlockRaw = state[chain].last_block;

  if (lastBlockRaw === null || lastBlockRaw === undefined) {
    return defaultStart;
  }

  const lastBlock = Number(lastBlockRaw);
  if (!Number.isFinite(lastBlock) || lastBlock < -1) {
    state[chain].last_block = null;
    logger?.warn?.(
      {
        chain,
        invalid_checkpoint: lastBlockRaw,
        reset_to_start_block: defaultStart,
      },
      'Resetting invalid relayer checkpoint'
    );
    return defaultStart;
  }

  if (lastBlock > confirmedTip) {
    state[chain].last_block = null;
    logger?.warn?.(
      {
        chain,
        checkpoint: lastBlock,
        confirmed_tip: confirmedTip,
        reset_to_start_block: defaultStart,
      },
      'Resetting relayer checkpoint ahead of current confirmed tip'
    );
    return defaultStart;
  }

  return lastBlock + 1;
}

export function buildFeedSyncPayload(config, targetChain) {
  const payload = {
    target_chain: targetChain,
    symbols: config.feedSync.symbols,
    project_slug: config.feedSync.projectSlug || undefined,
    feed_change_threshold_bps: config.feedSync.changeThresholdBps,
    feed_min_update_interval_ms: config.feedSync.minUpdateIntervalMs,
    wait: false,
  };

  if (config.feedSync.provider) {
    payload.provider = config.feedSync.provider;
  } else if (Array.isArray(config.feedSync.providers) && config.feedSync.providers.length > 0) {
    payload.providers = config.feedSync.providers;
  }

  if (targetChain === 'neo_n3') {
    if (config.neo_n3?.updaterPrivateKey) payload.private_key = config.neo_n3.updaterPrivateKey;
    else if (config.neo_n3?.updaterWif) payload.wif = config.neo_n3.updaterWif;
  } else if (targetChain === 'neo_x' && config.neo_x?.updaterPrivateKey) {
    payload.private_key = config.neo_x.updaterPrivateKey;
  }

  return payload;
}

async function processFeedSync(config, state, logger) {
  if (!config.feedSync?.enabled) {
    return { enabled: false, chains: [] };
  }

  const now = Date.now();
  const feedSyncDelayMs = getFeedSyncDelayMs(config, state, now);
  if (feedSyncDelayMs > 0) {
    incrementMetric(state, 'feed_sync_skipped_total');
    return { enabled: true, skipped: true, chains: [] };
  }

  state.metrics.last_feed_sync_started_at = new Date(now).toISOString();
  incrementMetric(state, 'feed_sync_runs_total');
  saveRelayerState(config.stateFile, state);

  const targetChains =
    Array.isArray(config.activeChains) && config.activeChains.length > 0
      ? config.activeChains
      : ['neo_n3'];
  const chains = [];
  for (const targetChain of targetChains) {
    try {
      const payload = buildFeedSyncPayload(config, targetChain);

      const timeoutAwareResponse = await callPhala(config, '/oracle/feed', payload, {
        timeoutMs: config.feedSync.timeoutMs,
      });
      chains.push({
        target_chain: targetChain,
        ok: timeoutAwareResponse.ok,
        status: timeoutAwareResponse.status,
        body: timeoutAwareResponse.body,
      });
      incrementMetric(
        state,
        timeoutAwareResponse.ok ? 'feed_sync_success_total' : 'feed_sync_error_total'
      );
    } catch (error) {
      chains.push({
        target_chain: targetChain,
        ok: false,
        status: 500,
        body: { error: normalizeErrorMessage(error) },
      });
      incrementMetric(state, 'feed_sync_error_total');
      logger.warn({ target_chain: targetChain, error }, 'Feed sync tick failed');
    }
  }

  state.metrics.last_feed_sync_completed_at = new Date().toISOString();
  state.metrics.last_feed_sync_duration_ms = Date.now() - now;
  if (chains.some((entry) => entry.ok)) {
    state.metrics.last_feed_sync_success_at = state.metrics.last_feed_sync_completed_at;
  }
  saveRelayerState(config.stateFile, state);
  return { enabled: true, skipped: false, chains };
}

async function processEvent(config, state, persistState, logger, event, retryItem = null) {
  const eventKey = buildEventKey(event);
  const attempts = retryItem?.attempts || 0;
  const isFinalizeOnly = Boolean(retryItem?.finalize_only);
  const terminalError = trimOnchainErrorMessage(
    retryItem?.terminal_error || retryItem?.last_error || 'request execution failed'
  );

  logger.info(
    {
      chain: event.chain,
      request_id: event.requestId,
      request_type: event.requestType,
      event_key: eventKey,
      attempts,
      tx_hash: event.txHash,
    },
    'Processing Morpheus oracle request'
  );

  const claimed = await claimDurableJobForProcessing(config, logger, event, retryItem);
  if (!claimed) {
    clearRetryItem(state, event.chain, eventKey);
    persistState();
    return {
      event,
      skipped: true,
      event_key: eventKey,
      attempts,
      retry_status: 'claimed_elsewhere',
    };
  }

  await maybeUpsertJob(logger, event, {
    event_key: eventKey,
    status: retryItem ? 'retrying' : 'processing',
    attempts,
    next_retry_at: null,
  });

  try {
    let result;
    if (isFinalizeOnly) {
      result = await finalizeFailedRequest(config, event, terminalError);
      incrementMetric(state, 'fulfill_failure_total');
    } else {
      incrementMetric(state, 'worker_calls_total');
      result = await processOracleRequest(config, event);
      if (!result.success) incrementMetric(state, 'worker_failures_total');
      incrementMetric(state, result.success ? 'fulfill_success_total' : 'fulfill_failure_total');
    }
    incrementMetric(state, 'events_processed_total');

    recordProcessedEvent(
      state,
      event.chain,
      event,
      result.success ? 'fulfilled' : 'failed',
      {
        attempts,
        route: result.route,
        fulfill_tx: result.fulfill_tx,
        worker_status: result.worker_status,
        last_error: result.error || null,
      },
      config
    );
    clearRetryItem(state, event.chain, eventKey);
    persistState();

    await maybeUpsertJob(logger, event, {
      event_key: eventKey,
      status: result.success ? 'fulfilled' : 'failed',
      attempts,
      route: result.route,
      worker_status: result.worker_status,
      worker_response: result.worker_response,
      fulfill_tx: result.fulfill_tx,
      completed_at: new Date().toISOString(),
      next_retry_at: null,
    });

    logger.info(
      {
        chain: event.chain,
        request_id: event.requestId,
        request_type: event.requestType,
        event_key: eventKey,
        success: result.success,
        route: result.route,
        worker_status: result.worker_status,
      },
      'Fulfilled Morpheus oracle request'
    );
    return { event, result, event_key: eventKey, attempts };
  } catch (error) {
    const message = normalizeErrorMessage(error);
    if (isAlreadyFulfilledError(message)) {
      recordProcessedEvent(
        state,
        event.chain,
        event,
        'settled',
        {
          attempts,
          route: isFinalizeOnly ? 'failure-finalize:already-fulfilled' : 'already-fulfilled',
          last_error: trimOnchainErrorMessage(message),
        },
        config
      );
      clearRetryItem(state, event.chain, eventKey);
      persistState();

      await maybeUpsertJob(logger, event, {
        event_key: eventKey,
        status: 'settled',
        attempts,
        last_error: trimOnchainErrorMessage(message),
        completed_at: new Date().toISOString(),
        next_retry_at: null,
      });

      logger.info(
        {
          chain: event.chain,
          request_id: event.requestId,
          request_type: event.requestType,
          event_key: eventKey,
          attempts,
        },
        'Oracle request was already settled on-chain'
      );
      return { event, result: null, event_key: eventKey, attempts, retry_status: 'settled' };
    }

    if (isTerminalConfigurationError(message)) {
      const terminalError = trimOnchainErrorMessage(message);
      incrementMetric(state, 'retries_exhausted_total');
      recordProcessedEvent(
        state,
        event.chain,
        event,
        'exhausted',
        {
          attempts,
          route: isFinalizeOnly ? 'failure-finalize:config-error' : 'config-error',
          last_error: terminalError,
        },
        config
      );
      clearRetryItem(state, event.chain, eventKey);
      persistState();

      await maybeUpsertJob(logger, event, {
        event_key: eventKey,
        status: 'failed_config',
        attempts,
        last_error: terminalError,
        completed_at: new Date().toISOString(),
        next_retry_at: null,
      });

      logger.error(
        {
          chain: event.chain,
          request_id: event.requestId,
          request_type: event.requestType,
          event_key: eventKey,
          attempts,
          error: terminalError,
        },
        'Relayer stopped retrying due to a terminal configuration or authorization error'
      );
      return {
        event,
        error: terminalError,
        retry_status: 'terminal',
        event_key: eventKey,
        attempts,
      };
    }

    if (isFinalizeOnly) {
      const nextAttempts = attempts + 1;
      const retryItemNext = enqueueRetryItem(state, event.chain, event, {
        attempts: nextAttempts,
        next_retry_at: Date.now() + computeRetryDelayMs(config, nextAttempts),
        first_failed_at: retryItem?.first_failed_at || new Date().toISOString(),
        last_error: trimOnchainErrorMessage(message),
        finalize_only: true,
        terminal_error: terminalError,
      });
      incrementMetric(state, 'retries_scheduled_total');
      persistState();

      await maybeUpsertJob(logger, event, {
        event_key: eventKey,
        status: 'failure_callback_retry_scheduled',
        attempts: retryItemNext.attempts,
        last_error: retryItemNext.last_error,
        next_retry_at: new Date(retryItemNext.next_retry_at).toISOString(),
        worker_response: {
          retry_meta: {
            finalize_only: true,
            terminal_error: terminalError,
          },
        },
      });

      logger.warn(
        {
          chain: event.chain,
          request_id: event.requestId,
          request_type: event.requestType,
          event_key: eventKey,
          attempts: retryItemNext.attempts,
          retry_at: retryItemNext.next_retry_at,
          error: retryItemNext.last_error,
        },
        'Retrying terminal failure callback delivery'
      );
      return {
        event,
        error: retryItemNext.last_error,
        retry_status: 'scheduled',
        event_key: eventKey,
        attempts: retryItemNext.attempts,
      };
    }

    const retry = scheduleRetry(state, event.chain, event, message, config);

    if (retry.status === 'exhausted') {
      incrementMetric(state, 'retries_exhausted_total');
      try {
        const result = await finalizeFailedRequest(config, event, message);
        incrementMetric(state, 'events_processed_total');
        incrementMetric(state, 'events_failed_total');
        incrementMetric(state, 'fulfill_failure_total');
        recordProcessedEvent(
          state,
          event.chain,
          event,
          'failed',
          {
            attempts: retry.attempts,
            route: result.route,
            fulfill_tx: result.fulfill_tx,
            worker_status: null,
            last_error: result.error,
          },
          config
        );
        clearRetryItem(state, event.chain, eventKey);
        persistState();

        await maybeUpsertJob(logger, event, {
          event_key: eventKey,
          status: 'failed',
          attempts: retry.attempts,
          last_error: result.error,
          fulfill_tx: result.fulfill_tx,
          completed_at: new Date().toISOString(),
          next_retry_at: null,
        });

        logger.warn(
          {
            chain: event.chain,
            request_id: event.requestId,
            request_type: event.requestType,
            event_key: eventKey,
            attempts: retry.attempts,
            error: result.error,
          },
          'Finalized oracle request with an on-chain failure callback'
        );
        return { event, result, event_key: eventKey, attempts: retry.attempts };
      } catch (finalizeError) {
        const nextAttempts = retry.attempts + 1;
        const retryItemNext = enqueueRetryItem(state, event.chain, event, {
          attempts: nextAttempts,
          next_retry_at: Date.now() + computeRetryDelayMs(config, nextAttempts),
          first_failed_at: new Date().toISOString(),
          last_error: trimOnchainErrorMessage(finalizeError),
          finalize_only: true,
          terminal_error: trimOnchainErrorMessage(message),
        });
        incrementMetric(state, 'retries_scheduled_total');
        persistState();

        await maybeUpsertJob(logger, event, {
          event_key: eventKey,
          status: 'failure_callback_retry_scheduled',
          attempts: retryItemNext.attempts,
          last_error: retryItemNext.last_error,
          next_retry_at: new Date(retryItemNext.next_retry_at).toISOString(),
          worker_response: {
            retry_meta: {
              finalize_only: true,
              terminal_error: trimOnchainErrorMessage(message),
            },
          },
        });

        logger.error(
          {
            chain: event.chain,
            request_id: event.requestId,
            request_type: event.requestType,
            event_key: eventKey,
            attempts: retryItemNext.attempts,
            error: retryItemNext.last_error,
          },
          'Primary execution exhausted; retrying terminal failure callback'
        );
        return {
          event,
          error: retryItemNext.last_error,
          retry_status: 'scheduled',
          event_key: eventKey,
          attempts: retryItemNext.attempts,
        };
      }
    }

    incrementMetric(state, 'retries_scheduled_total');
    persistState();

    await maybeUpsertJob(logger, event, {
      event_key: eventKey,
      status: 'retry_scheduled',
      attempts: retry.item.attempts,
      last_error: message,
      next_retry_at: new Date(retry.item.next_retry_at).toISOString(),
    });

    logger.warn(
      {
        chain: event.chain,
        request_id: event.requestId,
        request_type: event.requestType,
        event_key: eventKey,
        attempts: retry.item.attempts,
        retry_at: retry.item.next_retry_at,
        error: message,
      },
      'Scheduled Morpheus oracle request retry'
    );
    return {
      event,
      error: message,
      retry_status: 'scheduled',
      event_key: eventKey,
      attempts: retry.item.attempts,
    };
  }
}

function filterNewEvents(state, chain, events) {
  const unique = [];
  const seenKeys = new Set();
  let duplicates = 0;

  for (const event of events) {
    const eventKey = buildEventKey(event);
    if (
      seenKeys.has(eventKey) ||
      hasProcessedEvent(state, chain, eventKey) ||
      isEventQueuedForRetry(state, chain, eventKey)
    ) {
      duplicates += 1;
      continue;
    }
    seenKeys.add(eventKey);
    unique.push(event);
  }

  return { events: unique, duplicates };
}

async function reconcilePendingRequests(
  config,
  state,
  logger,
  chain,
  options,
  excludedRequestIds = new Set()
) {
  if (!options.getLatestRequestId || !options.scanByRequestId) {
    return { scanned_requests: null, events: [] };
  }

  const latestRequestId = await options.getLatestRequestId(config);
  const fromRequestId = resolveRequestCursor(config, state, chain, latestRequestId, logger);
  if (fromRequestId > latestRequestId) {
    return { scanned_requests: null, events: [] };
  }

  const toRequestId = Math.min(latestRequestId, fromRequestId + config.maxBlocksPerTick - 1);
  const scannedEvents = await options.scanByRequestId(config, fromRequestId, toRequestId);
  const pendingOnly = scannedEvents.filter(
    (event) => !excludedRequestIds.has(String(event.requestId || ''))
  );
  incrementMetric(state, 'events_scanned_total', pendingOnly.length);
  const filtered = filterNewEvents(state, chain, pendingOnly);
  incrementMetric(state, 'duplicates_skipped_total', filtered.duplicates);

  const persistState = createPersistor(config, state);
  await persistFreshEventsToDurableQueue(config, logger, chain, filtered.events);
  const eventResults = filtered.events.length
    ? await mapWithConcurrency(filtered.events, config.concurrency, (event) =>
        processEvent(config, state, persistState, logger, event)
      )
    : [];

  state[chain].last_request_id = toRequestId;
  persistState();
  return {
    scanned_requests: { from: fromRequestId, to: toRequestId, latest_request_id: latestRequestId },
    events: eventResults,
  };
}

async function processChain(config, state, logger, chain, options) {
  if (!options.hasConfig(config)) {
    logger.debug({ chain }, 'Skipping chain with incomplete relayer config');
    return {
      scanned_blocks: null,
      retries: [],
      events: [],
      manual_actions: [],
      request_reconciliation: { scanned_requests: null, events: [] },
    };
  }

  await syncManualActions(config, state, logger, chain);
  const persistState = createPersistor(config, state);
  await quarantineDurableBacklogBelowRequestFloor(config, logger, chain);
  await hydrateDurableQueue(config, state, logger, chain, persistState);
  const pruned = pruneRetryQueueBelowRequestFloor(
    state,
    chain,
    getRequestCursorFloor(config, chain)
  );
  if (pruned > 0) {
    persistState();
    logger.info(
      { chain, pruned_count: pruned },
      'Pruned legacy retry queue entries below request cursor floor'
    );
  }

  const latestBlock = await options.getLatestBlock(config);
  const confirmedTip = latestBlock - Math.max(config.confirmations[chain], 0);

  let scannedBlocks = null;
  let eventResults = [];
  const observedRequestIds = new Set();

  if (confirmedTip >= 0) {
    const fromBlock = resolveChainFromBlock(config, state, chain, confirmedTip, logger);
    if (fromBlock <= confirmedTip) {
      const toBlock = Math.min(confirmedTip, fromBlock + config.maxBlocksPerTick - 1);
      const scannedEvents = await options.scan(config, fromBlock, toBlock);
      incrementMetric(state, 'events_scanned_total', scannedEvents.length);
      const filtered = filterNewEvents(state, chain, scannedEvents);
      incrementMetric(state, 'duplicates_skipped_total', filtered.duplicates);
      await persistFreshEventsToDurableQueue(config, logger, chain, filtered.events);
      const deferred = await deferEventsForBackpressure(
        config,
        state,
        logger,
        chain,
        filtered.events,
        persistState
      );
      eventResults = deferred.processable.length
        ? await mapWithConcurrency(deferred.processable, config.concurrency, (event) =>
            processEvent(config, state, persistState, logger, event)
          )
        : [];
      for (const event of deferred.processable) {
        observedRequestIds.add(String(event.requestId || ''));
      }
      state[chain].last_block = toBlock;
      persistState();
      scannedBlocks = {
        from: fromBlock,
        to: toBlock,
        latest: latestBlock,
        confirmed_tip: confirmedTip,
      };
    }
  }

  const dueRetries = getDueRetryItems(state, chain);
  const retryBatch = dueRetries.slice(
    0,
    Math.max(Number(config.backpressure?.maxRetryEventsPerTick || dueRetries.length), 1)
  );
  if (dueRetries.length > retryBatch.length) {
    incrementMetric(
      state,
      'backpressure_retry_skipped_total',
      dueRetries.length - retryBatch.length
    );
  }
  const retryResults = retryBatch.length
    ? await mapWithConcurrency(retryBatch, config.concurrency, (item) =>
        processEvent(config, state, persistState, logger, item.event, item)
      )
    : [];

  const requestReconciliation = await reconcilePendingRequests(
    config,
    state,
    logger,
    chain,
    options,
    observedRequestIds
  );
  return {
    scanned_blocks: scannedBlocks,
    retries: retryResults,
    events: eventResults,
    manual_actions: [],
    request_reconciliation: requestReconciliation,
  };
}

function resolveRequestCursor(config, state, chain, latestRequestId, logger = null) {
  const configuredStart = optionsSafeNumber(config.startRequestIds?.[chain]);
  const defaultStart = Math.max(configuredStart ?? 1, 1);
  const lastRequestIdRaw = state[chain].last_request_id;

  if (lastRequestIdRaw === null || lastRequestIdRaw === undefined) {
    return defaultStart;
  }

  const lastRequestId = Number(lastRequestIdRaw);
  if (!Number.isFinite(lastRequestId) || lastRequestId < 0) {
    state[chain].last_request_id = null;
    logger?.warn?.(
      {
        chain,
        invalid_request_checkpoint: lastRequestIdRaw,
        reset_to_start_request_id: defaultStart,
      },
      'Resetting invalid relayer request checkpoint'
    );
    return defaultStart;
  }

  if (lastRequestId > latestRequestId) {
    state[chain].last_request_id = null;
    logger?.warn?.(
      {
        chain,
        request_checkpoint: lastRequestId,
        latest_request_id: latestRequestId,
        reset_to_start_request_id: defaultStart,
      },
      'Resetting relayer request checkpoint ahead of latest request id'
    );
    return defaultStart;
  }

  return lastRequestId + 1;
}

function optionsSafeNumber(value) {
  return value === null || value === undefined || value === '' ? null : Number(value);
}

async function processChainByRequestCursor(config, state, logger, chain, options) {
  if (!options.hasConfig(config)) {
    logger.debug({ chain }, 'Skipping chain with incomplete relayer config');
    return { scanned_requests: null, retries: [], events: [], manual_actions: [] };
  }

  await syncManualActions(config, state, logger, chain);
  const persistState = createPersistor(config, state);
  await quarantineDurableBacklogBelowRequestFloor(config, logger, chain);
  await hydrateDurableQueue(config, state, logger, chain, persistState);
  const pruned = pruneRetryQueueBelowRequestFloor(
    state,
    chain,
    getRequestCursorFloor(config, chain)
  );
  if (pruned > 0) {
    persistState();
    logger.info(
      { chain, pruned_count: pruned },
      'Pruned legacy retry queue entries below request cursor floor'
    );
  }

  const latestRequestId = await options.getLatestRequestId(config);
  const fromRequestId = resolveRequestCursor(config, state, chain, latestRequestId, logger);
  if (fromRequestId > latestRequestId) {
    const dueRetries = getDueRetryItems(state, chain);
    const retryResults = dueRetries.length
      ? await mapWithConcurrency(dueRetries, config.concurrency, (item) =>
          processEvent(config, state, persistState, logger, item.event, item)
        )
      : [];
    return { scanned_requests: null, retries: retryResults, events: [], manual_actions: [] };
  }

  const toRequestId = Math.min(latestRequestId, fromRequestId + config.maxBlocksPerTick - 1);
  const scannedEvents = await options.scan(config, fromRequestId, toRequestId);
  incrementMetric(state, 'events_scanned_total', scannedEvents.length);
  const filtered = filterNewEvents(state, chain, scannedEvents);
  incrementMetric(state, 'duplicates_skipped_total', filtered.duplicates);
  await persistFreshEventsToDurableQueue(config, logger, chain, filtered.events);
  const deferred = await deferEventsForBackpressure(
    config,
    state,
    logger,
    chain,
    filtered.events,
    persistState
  );
  const eventResults = deferred.processable.length
    ? await mapWithConcurrency(deferred.processable, config.concurrency, (event) =>
        processEvent(config, state, persistState, logger, event)
      )
    : [];

  const dueRetries = getDueRetryItems(state, chain);
  const retryBatch = dueRetries.slice(
    0,
    Math.max(Number(config.backpressure?.maxRetryEventsPerTick || dueRetries.length), 1)
  );
  if (dueRetries.length > retryBatch.length) {
    incrementMetric(
      state,
      'backpressure_retry_skipped_total',
      dueRetries.length - retryBatch.length
    );
  }
  const retryResults = retryBatch.length
    ? await mapWithConcurrency(retryBatch, config.concurrency, (item) =>
        processEvent(config, state, persistState, logger, item.event, item)
      )
    : [];

  state[chain].last_request_id = toRequestId;
  persistState();
  return {
    scanned_requests: { from: fromRequestId, to: toRequestId, latest_request_id: latestRequestId },
    retries: retryResults,
    events: eventResults,
    manual_actions: [],
  };
}

export async function runRelayerOnce(options = {}) {
  const config = options.config || createRelayerConfig();
  const logger = options.logger || createLogger(config);
  const state = loadRelayerState(config.stateFile);
  const startedAt = Date.now();
  state.metrics.last_tick_started_at = new Date(startedAt).toISOString();
  incrementMetric(state, 'ticks_total', 1);
  saveRelayerState(config.stateFile, state);

  const feedSync = shouldRunFeedSync(config)
    ? await processFeedSync(config, state, logger)
    : { enabled: false, skipped: true, mode: config.mode };

  const neoN3 =
    shouldRunRequestProcessing(config) && config.activeChains.includes('neo_n3')
      ? config.neo_n3.scanMode === 'request_cursor'
        ? await processChainByRequestCursor(config, state, logger, 'neo_n3', {
            hasConfig: hasNeoN3RelayerConfig,
            getLatestRequestId: getNeoN3LatestRequestId,
            scan: scanNeoN3OracleRequestsById,
          })
        : await processChain(config, state, logger, 'neo_n3', {
            hasConfig: hasNeoN3RelayerConfig,
            getLatestBlock:
              config.neo_n3.scanMode === 'n3index_notifications'
                ? getNeoN3IndexedBlock
                : getNeoN3LatestBlock,
            getLatestRequestId: getNeoN3LatestRequestId,
            scan:
              config.neo_n3.scanMode === 'n3index_notifications'
                ? scanNeoN3OracleRequestsViaN3Index
                : scanNeoN3OracleRequests,
            scanByRequestId: scanNeoN3OracleRequestsById,
          })
      : { skipped: true, chain: 'neo_n3' };
  const neoX =
    shouldRunRequestProcessing(config) && config.activeChains.includes('neo_x')
      ? await processChain(config, state, logger, 'neo_x', {
          hasConfig: hasNeoXRelayerConfig,
          getLatestBlock: getNeoXLatestBlock,
          scan: scanNeoXOracleRequests,
        })
      : { skipped: true, chain: 'neo_x' };
  const automation = shouldRunRequestProcessing(config)
    ? await processAutomationJobs(config, logger)
    : { skipped: true, mode: config.mode };

  state.metrics.last_tick_completed_at = new Date().toISOString();
  state.metrics.last_tick_duration_ms = Date.now() - startedAt;
  saveRelayerState(config.stateFile, state);

  const result = {
    instance_id: config.instanceId,
    mode: config.mode,
    neo_n3: neoN3,
    neo_x: neoX,
    feed_sync: feedSync,
    automation,
    state,
    metrics: snapshotMetrics(state),
  };
  await maybePersistRun(logger, config, result);
  return result;
}

export async function runRelayerLoop(options = {}) {
  const config = options.config || createRelayerConfig();
  const logger = options.logger || createLogger(config);
  logger.info(
    {
      network: config.network,
      mode: config.mode,
      instance_id: config.instanceId,
      state_file: config.stateFile,
      poll_interval_ms: config.pollIntervalMs,
      concurrency: config.concurrency,
    },
    'Starting Morpheus relayer loop'
  );
  while (true) {
    try {
      const result = await runRelayerOnce({ config, logger });
      logger.info({ metrics: result.metrics }, 'Relayer loop tick complete');
      const feedSyncDelayMs = getFeedSyncDelayMs(config, result.state, Date.now());
      const sleepMs =
        config.mode === 'feed_only'
          ? Math.max(
              0,
              Math.min(
                Math.max(config.pollIntervalMs, 0),
                Number.isFinite(feedSyncDelayMs) ? feedSyncDelayMs : Number.POSITIVE_INFINITY
              )
            )
          : Math.max(config.pollIntervalMs, 0);
      await sleep(sleepMs);
    } catch (error) {
      logger.error({ error }, 'Relayer loop tick failed');
      await sleep(config.pollIntervalMs);
    }
  }
}
