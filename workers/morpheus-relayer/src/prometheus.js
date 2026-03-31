function metricLine(name, value, labels = null) {
  if (!Number.isFinite(value)) return null;
  const suffix = labels
    ? `{${Object.entries(labels)
        .map(([key, current]) => `${key}="${String(current).replace(/"/g, '\\"')}"`)
        .join(',')}}`
    : '';
  return `${name}${suffix} ${value}`;
}

function parseIsoToUnixSeconds(value) {
  const timestamp = Date.parse(String(value || ''));
  if (!Number.isFinite(timestamp)) return null;
  return Math.floor(timestamp / 1000);
}

export function renderPrometheusMetrics(metrics = {}) {
  const lines = [
    '# HELP morpheus_relayer_ticks_total Total relayer ticks processed.',
    '# TYPE morpheus_relayer_ticks_total counter',
  ];

  const topLevelCounters = [
    'ticks_total',
    'events_scanned_total',
    'events_processed_total',
    'events_failed_total',
    'duplicates_skipped_total',
    'retries_scheduled_total',
    'retries_exhausted_total',
    'worker_calls_total',
    'worker_failures_total',
    'fulfill_success_total',
    'fulfill_failure_total',
    'claim_conflicts_total',
    'stale_reclaims_total',
    'manual_actions_loaded_total',
    'feed_sync_runs_total',
    'feed_sync_success_total',
    'feed_sync_error_total',
    'feed_sync_skipped_total',
    'backpressure_deferred_total',
    'backpressure_retry_skipped_total',
  ];

  for (const name of topLevelCounters) {
    const line = metricLine(`morpheus_relayer_${name}`, Number(metrics[name] || 0));
    if (line) lines.push(line);
  }

  const gauges = ['last_feed_sync_duration_ms', 'last_tick_duration_ms'];
  for (const name of gauges) {
    const line = metricLine(`morpheus_relayer_${name}`, Number(metrics[name] || 0));
    if (line) lines.push(line);
  }

  const timestampGauges = {
    last_feed_sync_started_at: 'morpheus_relayer_last_feed_sync_started_at_seconds',
    last_feed_sync_completed_at: 'morpheus_relayer_last_feed_sync_completed_at_seconds',
    last_feed_sync_success_at: 'morpheus_relayer_last_feed_sync_success_at_seconds',
    last_tick_started_at: 'morpheus_relayer_last_tick_started_at_seconds',
    last_tick_completed_at: 'morpheus_relayer_last_tick_completed_at_seconds',
  };

  for (const [field, metricName] of Object.entries(timestampGauges)) {
    const seconds = parseIsoToUnixSeconds(metrics[field]);
    const line = seconds === null ? null : metricLine(metricName, seconds);
    if (line) lines.push(line);
  }

  for (const [chain, value] of Object.entries(metrics.retry_queue_sizes || {})) {
    const line = metricLine('morpheus_relayer_retry_queue_size', Number(value || 0), { chain });
    if (line) lines.push(line);
  }

  for (const [chain, value] of Object.entries(metrics.dead_letter_sizes || {})) {
    const line = metricLine('morpheus_relayer_dead_letter_size', Number(value || 0), { chain });
    if (line) lines.push(line);
  }

  for (const [chain, value] of Object.entries(metrics.checkpoints || {})) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) continue;
    const line = metricLine('morpheus_relayer_chain_checkpoint', numeric, { chain });
    if (line) lines.push(line);
  }

  for (const [chain, value] of Object.entries(metrics.request_checkpoints || {})) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) continue;
    const line = metricLine('morpheus_relayer_request_checkpoint', numeric, { chain });
    if (line) lines.push(line);
  }

  return `${lines.filter(Boolean).join('\n')}\n`;
}
