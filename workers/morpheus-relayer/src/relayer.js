import { createRelayerConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { callPhala } from "./phala.js";
import { buildWorkerPayload, decodePayloadText, encodeFulfillmentResult, isOperatorOnlyRequestType, resolveWorkerRoute } from "./router.js";
import {
  buildRelayerJobRecord,
  fetchRelayerJobsByStatuses,
  patchRelayerJob,
  persistRelayerRun,
  upsertRelayerJob,
} from "./persistence.js";
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
} from "./state.js";
import { fulfillNeoN3Request, getNeoN3LatestBlock, hasNeoN3RelayerConfig, scanNeoN3OracleRequests } from "./neo-n3.js";
import { fulfillNeoXRequest, getNeoXLatestBlock, hasNeoXRelayerConfig, scanNeoXOracleRequests } from "./neo-x.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
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
    logger.warn({ event_key: details.event_key, error }, "Failed to persist relayer job state to Supabase");
  }
}

async function maybePersistRun(logger, config, result) {
  try {
    await persistRelayerRun(config, result);
  } catch (error) {
    logger.warn({ error }, "Failed to persist relayer run snapshot to Supabase");
  }
}

async function syncManualActions(config, state, logger, chain) {
  let jobs;
  try {
    jobs = await fetchRelayerJobsByStatuses(["manual_retry_requested", "manual_replay_requested"], chain, 50);
  } catch (error) {
    logger.warn({ chain, error }, "Supabase manual-action sync unavailable; continuing without control-plane sync");
    return [];
  }
  if (!jobs.length) return [];

  const applied = [];
  for (const job of jobs) {
    const event = job?.event && typeof job.event === "object" ? job.event : null;
    if (!event || !event.chain || !event.requestId) {
      await patchRelayerJob(job.event_key, {
        status: "manual_action_failed",
        last_error: "missing or invalid event payload for manual action",
        next_retry_at: null,
      });
      continue;
    }

    const eventKey = job.event_key || buildEventKey(event);
    if (job.status === "manual_replay_requested") {
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
    incrementMetric(state, "manual_actions_loaded_total");

    await patchRelayerJob(eventKey, {
      status: "queued",
      attempts: 0,
      last_error: null,
      next_retry_at: new Date().toISOString(),
      completed_at: null,
    });
    applied.push({ event_key: eventKey, status: job.status });
  }

  if (applied.length) {
    saveRelayerState(config.stateFile, state);
    logger.info({ chain, actions: applied }, "Loaded manual relayer actions from Supabase");
  }
  return applied;
}

async function processOracleRequest(config, event) {
  const payload = decodePayloadText(event.payloadText);
  if (isOperatorOnlyRequestType(event.requestType)) {
    const verification = await signFulfillmentPayload(config, event.chain, "");
    return {
      success: false,
      result: "",
      error: "datafeed requests are operator-only; users should read synchronized on-chain feed data",
      route: "operator-only:rejected",
      worker_response: null,
      worker_status: null,
      fulfill_tx: event.chain === "neo_n3"
        ? await fulfillNeoN3Request(config, event.requestId, false, "", "datafeed requests are operator-only; users should read synchronized on-chain feed data", verification.signature)
        : await fulfillNeoXRequest(config, event.requestId, false, "", "datafeed requests are operator-only; users should read synchronized on-chain feed data", verification.signature),
      verification_signature: verification.signature,
    };
  }
  const route = resolveWorkerRoute(event.requestType, payload);
  const workerPayload = buildWorkerPayload(event.chain, event.requestType, payload, event.requestId);
  const workerResponse = await callPhala(config, route, workerPayload);
  const fulfillment = encodeFulfillmentResult(event.requestType, workerResponse);
  const verification = await signFulfillmentPayload(config, event.chain, fulfillment.result || "");

  if (event.chain === "neo_n3") {
    const tx = await fulfillNeoN3Request(
      config,
      event.requestId,
      fulfillment.success,
      fulfillment.result,
      fulfillment.error,
      verification.signature,
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

async function signFulfillmentPayload(config, chain, result) {
  const response = await callPhala(config, "/sign/payload", {
    target_chain: chain,
    message: result || "",
  });
  if (!response.ok || typeof response.body?.signature !== "string" || !response.body.signature) {
    throw new Error(
      typeof response.body?.error === "string"
        ? response.body.error
        : `worker signing failed with status ${response.status}`,
    );
  }
  return response.body;
}

function createPersistor(config, state) {
  return () => saveRelayerState(config.stateFile, state);
}

async function processEvent(config, state, persistState, logger, event, retryItem = null) {
  const eventKey = buildEventKey(event);
  const attempts = retryItem?.attempts || 0;

  logger.info({
    chain: event.chain,
    request_id: event.requestId,
    request_type: event.requestType,
    event_key: eventKey,
    attempts,
    tx_hash: event.txHash,
  }, "Processing Morpheus oracle request");

  await maybeUpsertJob(logger, event, {
    event_key: eventKey,
    status: retryItem ? "retrying" : "processing",
    attempts,
    next_retry_at: null,
  });

  try {
    incrementMetric(state, "worker_calls_total");
    const result = await processOracleRequest(config, event);
    if (!result.success) incrementMetric(state, "worker_failures_total");
    incrementMetric(state, "events_processed_total");
    incrementMetric(state, result.success ? "fulfill_success_total" : "fulfill_failure_total");

    recordProcessedEvent(state, event.chain, event, result.success ? "fulfilled" : "failed", {
      attempts,
      route: result.route,
      fulfill_tx: result.fulfill_tx,
      worker_status: result.worker_status,
    }, config);
    clearRetryItem(state, event.chain, eventKey);
    persistState();

    await maybeUpsertJob(logger, event, {
      event_key: eventKey,
      status: result.success ? "fulfilled" : "failed",
      attempts,
      route: result.route,
      worker_status: result.worker_status,
      worker_response: result.worker_response,
      fulfill_tx: result.fulfill_tx,
      completed_at: new Date().toISOString(),
      next_retry_at: null,
    });

    logger.info({
      chain: event.chain,
      request_id: event.requestId,
      request_type: event.requestType,
      event_key: eventKey,
      success: result.success,
      route: result.route,
      worker_status: result.worker_status,
    }, "Fulfilled Morpheus oracle request");
    return { event, result, event_key: eventKey, attempts };
  } catch (error) {
    const message = normalizeErrorMessage(error);
    const retry = scheduleRetry(state, event.chain, event, message, config);

    if (retry.status === "exhausted") {
      incrementMetric(state, "events_failed_total");
      incrementMetric(state, "retries_exhausted_total");
      recordProcessedEvent(state, event.chain, event, "exhausted", {
        attempts: retry.attempts,
        last_error: message,
      }, config);
      persistState();

      await maybeUpsertJob(logger, event, {
        event_key: eventKey,
        status: "exhausted",
        attempts: retry.attempts,
        last_error: message,
        completed_at: new Date().toISOString(),
        next_retry_at: null,
      });

      logger.error({
        chain: event.chain,
        request_id: event.requestId,
        request_type: event.requestType,
        event_key: eventKey,
        attempts: retry.attempts,
        error: message,
      }, "Exhausted retries for Morpheus oracle request");
      return { event, error: message, retry_status: "exhausted", event_key: eventKey, attempts: retry.attempts };
    }

    incrementMetric(state, "retries_scheduled_total");
    persistState();

    await maybeUpsertJob(logger, event, {
      event_key: eventKey,
      status: "retry_scheduled",
      attempts: retry.item.attempts,
      last_error: message,
      next_retry_at: new Date(retry.item.next_retry_at).toISOString(),
    });

    logger.warn({
      chain: event.chain,
      request_id: event.requestId,
      request_type: event.requestType,
      event_key: eventKey,
      attempts: retry.item.attempts,
      retry_at: retry.item.next_retry_at,
      error: message,
    }, "Scheduled Morpheus oracle request retry");
    return { event, error: message, retry_status: "scheduled", event_key: eventKey, attempts: retry.item.attempts };
  }
}

function filterNewEvents(state, chain, events) {
  const unique = [];
  const seenKeys = new Set();
  let duplicates = 0;

  for (const event of events) {
    const eventKey = buildEventKey(event);
    if (seenKeys.has(eventKey) || hasProcessedEvent(state, chain, eventKey) || isEventQueuedForRetry(state, chain, eventKey)) {
      duplicates += 1;
      continue;
    }
    seenKeys.add(eventKey);
    unique.push(event);
  }

  return { events: unique, duplicates };
}

async function processChain(config, state, logger, chain, options) {
  if (!options.hasConfig(config)) {
    logger.debug({ chain }, "Skipping chain with incomplete relayer config");
    return { scanned_blocks: null, retries: [], events: [], manual_actions: [] };
  }

  await syncManualActions(config, state, logger, chain);

  const latestBlock = await options.getLatestBlock(config);
  const confirmedTip = latestBlock - Math.max(config.confirmations[chain], 0);
  if (confirmedTip < 0) {
    return { scanned_blocks: null, retries: [], events: [], manual_actions: [] };
  }

  const fromBlock = state[chain].last_block === null
    ? Math.max(config.startBlocks[chain] ?? confirmedTip, 0)
    : Number(state[chain].last_block) + 1;
  if (fromBlock > confirmedTip) {
    const dueRetries = getDueRetryItems(state, chain);
    const persistState = createPersistor(config, state);
    const retryResults = dueRetries.length
      ? await mapWithConcurrency(dueRetries, config.concurrency, (item) => processEvent(config, state, persistState, logger, item.event, item))
      : [];
    return { scanned_blocks: null, retries: retryResults, events: [], manual_actions: [] };
  }

  const toBlock = Math.min(confirmedTip, fromBlock + config.maxBlocksPerTick - 1);
  const scannedEvents = await options.scan(config, fromBlock, toBlock);
  incrementMetric(state, "events_scanned_total", scannedEvents.length);
  const filtered = filterNewEvents(state, chain, scannedEvents);
  incrementMetric(state, "duplicates_skipped_total", filtered.duplicates);

  const dueRetries = getDueRetryItems(state, chain);
  const persistState = createPersistor(config, state);
  const retryResults = dueRetries.length
    ? await mapWithConcurrency(dueRetries, config.concurrency, (item) => processEvent(config, state, persistState, logger, item.event, item))
    : [];
  const eventResults = filtered.events.length
    ? await mapWithConcurrency(filtered.events, config.concurrency, (event) => processEvent(config, state, persistState, logger, event))
    : [];

  state[chain].last_block = toBlock;
  persistState();
  return {
    scanned_blocks: { from: fromBlock, to: toBlock, latest: latestBlock, confirmed_tip: confirmedTip },
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
  incrementMetric(state, "ticks_total", 1);
  saveRelayerState(config.stateFile, state);

  const neoN3 = await processChain(config, state, logger, "neo_n3", {
    hasConfig: hasNeoN3RelayerConfig,
    getLatestBlock: getNeoN3LatestBlock,
    scan: scanNeoN3OracleRequests,
  });
  const neoX = await processChain(config, state, logger, "neo_x", {
    hasConfig: hasNeoXRelayerConfig,
    getLatestBlock: getNeoXLatestBlock,
    scan: scanNeoXOracleRequests,
  });

  state.metrics.last_tick_completed_at = new Date().toISOString();
  state.metrics.last_tick_duration_ms = Date.now() - startedAt;
  saveRelayerState(config.stateFile, state);

  const result = {
    neo_n3: neoN3,
    neo_x: neoX,
    state,
    metrics: snapshotMetrics(state),
  };
  await maybePersistRun(logger, config, result);
  return result;
}

export async function runRelayerLoop(options = {}) {
  const config = options.config || createRelayerConfig();
  const logger = options.logger || createLogger(config);
  logger.info({ network: config.network, state_file: config.stateFile, poll_interval_ms: config.pollIntervalMs, concurrency: config.concurrency }, "Starting Morpheus relayer loop");
  while (true) {
    try {
      const result = await runRelayerOnce({ config, logger });
      logger.info({ metrics: result.metrics }, "Relayer loop tick complete");
    } catch (error) {
      logger.error({ error }, "Relayer loop tick failed");
    }
    await sleep(config.pollIntervalMs);
  }
}
