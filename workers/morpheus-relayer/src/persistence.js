function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getSupabaseRestConfig() {
  const baseUrl = trimString(
    process.env.SUPABASE_URL
      || process.env.NEXT_PUBLIC_SUPABASE_URL
      || process.env.morpheus_SUPABASE_URL
      || "",
  );
  const apiKey = trimString(
    process.env.SUPABASE_SERVICE_ROLE_KEY
      || process.env.morpheus_SUPABASE_SERVICE_ROLE_KEY
      || process.env.SUPABASE_SERVICE_KEY
      || process.env.SUPABASE_SECRET_KEY
      || process.env.morpheus_SUPABASE_SECRET_KEY
      || "",
  );
  if (!baseUrl || !apiKey) return null;
  return {
    restUrl: `${baseUrl.replace(/\/$/, "")}/rest/v1`,
    apiKey,
  };
}

async function supabaseRequest(table, method, payload, options = {}) {
  const config = getSupabaseRestConfig();
  if (!config) return null;

  const url = new URL(`${config.restUrl}/${table}`);
  if (options.query && typeof options.query === "object") {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers = {
    apikey: config.apiKey,
    authorization: `Bearer ${config.apiKey}`,
    accept: "application/json",
  };

  let body;
  if (payload !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(payload);
  }
  if (options.onConflict) {
    headers.Prefer = `resolution=merge-duplicates,return=minimal`;
    url.searchParams.set("on_conflict", options.onConflict);
  }

  const response = await fetch(url.toString(), { method, headers, body });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`supabase ${table} ${method} failed: ${response.status} ${text}`.trim());
  }
  return response;
}

export async function persistRelayerRun(config, result) {
  const payload = {
    network: config.network,
    status: "completed",
    started_at: result.state.metrics.last_tick_started_at,
    completed_at: result.state.metrics.last_tick_completed_at,
    duration_ms: result.state.metrics.last_tick_duration_ms,
    metrics: result.metrics,
    checkpoints: result.metrics.checkpoints,
    runtime: {
      poll_interval_ms: config.pollIntervalMs,
      concurrency: config.concurrency,
      max_blocks_per_tick: config.maxBlocksPerTick,
      max_retries: config.maxRetries,
    },
  };
  return supabaseRequest("morpheus_relayer_runs", "POST", payload);
}

export async function upsertRelayerJob(record) {
  return supabaseRequest("morpheus_relayer_jobs", "POST", record, { onConflict: "event_key" });
}

export function buildRelayerJobRecord(event, details = {}) {
  return {
    event_key: details.event_key,
    chain: event.chain,
    request_id: String(event.requestId || "0"),
    request_type: String(event.requestType || ""),
    tx_hash: event.txHash || null,
    block_number: event.blockNumber ?? null,
    route: details.route || null,
    status: details.status || "queued",
    attempts: Number(details.attempts || 0),
    last_error: details.last_error || null,
    next_retry_at: details.next_retry_at || null,
    worker_status: details.worker_status ?? null,
    worker_response: details.worker_response ?? null,
    fulfill_tx: details.fulfill_tx ?? null,
    event,
    updated_at: new Date().toISOString(),
    completed_at: details.completed_at || null,
  };
}
