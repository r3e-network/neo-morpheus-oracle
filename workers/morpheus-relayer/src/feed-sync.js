import { callPhala } from './phala.js';
import { incrementMetric, saveRelayerState } from './state.js';

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

export async function processFeedSync(config, state, logger) {
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

export function normalizeErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
