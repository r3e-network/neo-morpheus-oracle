import {
  buildEventKey,
  getDueRetryItems,
  hasProcessedEvent,
  incrementMetric,
  isEventQueuedForRetry,
} from './state.js';
import {
  createPersistor,
  deferEventsForBackpressure,
  hydrateDurableQueue,
  persistFreshEventsToDurableQueue,
  quarantineDurableBacklogBelowRequestFloor,
  syncManualActions,
} from './queue.js';
import { processEvent } from './fulfillment.js';
import {
  getRequestCursorFloor,
  resolveChainFromBlock,
  pruneRetryQueueBelowRequestFloor,
} from './chain-cursor.js';

export function filterNewEvents(state, chain, events) {
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

export async function reconcilePendingRequests(
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

export async function processChain(config, state, logger, chain, options) {
  if (!options.hasConfig(config)) {
    logger.debug({ chain }, 'Skipping chain with incomplete relayer config');
    return {
      scanned_blocks: null,
      retries: [],
      events: [],
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
    request_reconciliation: requestReconciliation,
  };
}

export async function processChainByRequestCursor(config, state, logger, chain, options) {
  if (!options.hasConfig(config)) {
    logger.debug({ chain }, 'Skipping chain with incomplete relayer config');
    return { scanned_requests: null, retries: [], events: [] };
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
    return { scanned_requests: null, retries: retryResults, events: [] };
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
  };
}

export function resolveRequestCursor(config, state, chain, latestRequestId, logger = null) {
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
