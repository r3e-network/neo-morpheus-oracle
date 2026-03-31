import { createRelayerConfig } from './config.js';
import { sendHeartbeat } from './heartbeat.js';
import { createLogger } from './logger.js';
import { processAutomationJobs } from './automation.js';
import { persistRelayerRun } from './persistence.js';
import { loadRelayerState, saveRelayerState, snapshotMetrics, incrementMetric } from './state.js';
import {
  hasNeoN3RelayerConfig,
  getNeoN3IndexedBlock,
  getNeoN3LatestBlock,
  getNeoN3LatestRequestId,
  scanNeoN3OracleRequests,
  scanNeoN3OracleRequestsById,
  scanNeoN3OracleRequestsViaN3Index,
} from './neo-n3.js';
import { hasNeoXRelayerConfig, getNeoXLatestBlock, scanNeoXOracleRequests } from './neo-x.js';
import { getFeedSyncDelayMs, processFeedSync } from './feed-sync.js';
export { buildFeedSyncPayload } from './feed-sync.js';
export { getFeedSyncDelayMs } from './feed-sync.js';
export {
  getRequestCursorFloor,
  pruneRetryQueueBelowRequestFloor,
  resolveChainFromBlock,
} from './chain-cursor.js';

// Inline helpers from chain-cursor.js - these are simple checks that don't justify a separate module
export function shouldRunFeedSync(config) {
  return config.mode !== 'requests_only';
}

export function shouldRunRequestProcessing(config) {
  return config.mode !== 'feed_only';
}
export {
  hydrateDurableQueue,
  persistFreshEventsToDurableQueue,
  quarantineDurableBacklogBelowRequestFloor,
} from './queue.js';
import { processChain, processChainByRequestCursor } from './request-processor.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function maybePersistRun(logger, config, result) {
  try {
    await persistRelayerRun(config, result);
  } catch (error) {
    logger.warn({ error }, 'Failed to persist relayer run snapshot to Supabase');
  }
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
  if (config.mode === 'feed_only') {
    void sendHeartbeat(process.env.MORPHEUS_BETTERSTACK_RELAYER_FEED_HEARTBEAT_URL || '', {
      mode: config.mode,
      network: config.network,
      tick_duration_ms: result.metrics.last_tick_duration_ms,
    });
  } else {
    void sendHeartbeat(process.env.MORPHEUS_BETTERSTACK_RELAYER_HEARTBEAT_URL || '', {
      mode: config.mode,
      network: config.network,
      tick_duration_ms: result.metrics.last_tick_duration_ms,
    });
  }
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
      void sendHeartbeat(process.env.MORPHEUS_BETTERSTACK_RELAYER_FAILURE_URL || '', {
        mode: config.mode,
        network: config.network,
        error: error instanceof Error ? error.message : String(error),
      });
      await sleep(config.pollIntervalMs);
    }
  }
}
