import { randomUUID, createHash } from "node:crypto";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function sha256Hex(value) {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

async function supabaseSelect(table, query = {}) {
  const response = await supabaseRequest(table, "GET", undefined, { query });
  if (!response) return [];
  const text = await response.text();
  if (!text) return [];
  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
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

export async function patchRelayerJob(eventKey, fields) {
  return supabaseRequest("morpheus_relayer_jobs", "PATCH", {
    ...fields,
    updated_at: new Date().toISOString(),
  }, {
    query: {
      event_key: `eq.${eventKey}`,
    },
  });
}

export async function fetchRelayerJobsByStatuses(statuses, chain = null, limit = 100) {
  if (!Array.isArray(statuses) || statuses.length === 0) return [];
  const query = {
    select: "id,event_key,chain,request_id,request_type,tx_hash,block_number,route,status,attempts,last_error,next_retry_at,worker_status,worker_response,fulfill_tx,event,updated_at,completed_at,created_at",
    status: `in.(${statuses.join(",")})`,
    order: "updated_at.asc",
    limit,
  };
  if (chain) query.chain = `eq.${chain}`;
  return supabaseSelect("morpheus_relayer_jobs", query);
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

function collectEncryptedFields(value, path = [], results = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectEncryptedFields(entry, [...path, String(index)], results));
    return results;
  }
  if (!isPlainObject(value)) return results;

  for (const [key, current] of Object.entries(value)) {
    const nextPath = [...path, key];
    if (key.startsWith("encrypted_") && typeof current === "string" && trimString(current)) {
      results.push({ field_path: nextPath.join("."), ciphertext: trimString(current) });
      continue;
    }
    if (key === "encrypted_inputs" && isPlainObject(current)) {
      for (const [nestedKey, nestedValue] of Object.entries(current)) {
        if (typeof nestedValue === "string" && trimString(nestedValue)) {
          results.push({ field_path: [...nextPath, nestedKey].join("."), ciphertext: trimString(nestedValue) });
        }
      }
      continue;
    }
    collectEncryptedFields(current, nextPath, results);
  }
  return results;
}

export async function upsertAutomationJob(record) {
  return supabaseRequest("morpheus_automation_jobs", "POST", record, { onConflict: "automation_id" });
}

export async function patchAutomationJob(automationId, fields) {
  return supabaseRequest("morpheus_automation_jobs", "PATCH", {
    ...fields,
    updated_at: new Date().toISOString(),
  }, {
    query: {
      automation_id: `eq.${automationId}`,
    },
  });
}

export async function fetchAutomationJobById(automationId) {
  const rows = await supabaseSelect("morpheus_automation_jobs", {
    select: "*",
    automation_id: `eq.${automationId}`,
    limit: 1,
  });
  return Array.isArray(rows) ? (rows[0] || null) : null;
}

export async function fetchActiveAutomationJobs(limit = 50) {
  return supabaseSelect("morpheus_automation_jobs", {
    select: "*",
    status: "eq.active",
    order: "updated_at.asc",
    limit,
  });
}

export async function insertAutomationRun(record) {
  return supabaseRequest("morpheus_automation_runs", "POST", record);
}

export async function persistAutomationEncryptedFields(job) {
  const payload = isPlainObject(job?.execution_payload) ? job.execution_payload : {};
  const encryptedFields = collectEncryptedFields(payload);
  if (encryptedFields.length === 0) return;
  const rows = encryptedFields.map((entry) => ({
    project_id: job.project_id || null,
    name: `automation:${job.automation_id}:${entry.field_path}:${randomUUID()}`,
    target_chain: job.chain,
    encryption_algorithm: "client-supplied-ciphertext",
    key_version: 1,
    ciphertext: entry.ciphertext,
    metadata: {
      automation_id: job.automation_id,
      registration_request_id: job.registration_request_id,
      field_path: entry.field_path,
      ciphertext_sha256: sha256Hex(entry.ciphertext),
    },
  }));
  await supabaseRequest("morpheus_encrypted_secrets", "POST", rows);
}
