import { randomUUID, createHash } from 'node:crypto';
import { resolveKernelIntent } from './router.js';
import { buildRiskEventRecord, buildWorkflowExecutionRecord } from './workflow-persistence.js';

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function sha256Hex(value) {
  return createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function resolveSupabaseNetwork() {
  return trimString(
    process.env.MORPHEUS_NETWORK || process.env.NEXT_PUBLIC_MORPHEUS_NETWORK || 'testnet'
  ) === 'mainnet'
    ? 'mainnet'
    : 'testnet';
}

export function sanitizeForPostgres(value) {
  if (typeof value === 'string') {
    return value.replace(/\u0000/g, '');
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeForPostgres(entry));
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, current]) => [key, sanitizeForPostgres(current)])
    );
  }
  return value;
}

function getSupabaseRestConfig() {
  const baseUrl = trimString(
    process.env.SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.morpheus_SUPABASE_URL ||
      ''
  );
  const apiKey = trimString(
    process.env.SUPABASE_SECRET_KEY ||
      process.env.morpheus_SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.morpheus_SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_KEY ||
      ''
  );
  if (!baseUrl || !apiKey) return null;
  return {
    restUrl: `${baseUrl.replace(/\/$/, '')}/rest/v1`,
    apiKey,
  };
}

export function hasSupabasePersistence() {
  return Boolean(getSupabaseRestConfig());
}

async function supabaseRequest(table, method, payload, options = {}) {
  const config = getSupabaseRestConfig();
  if (!config) return null;

  const url = new URL(`${config.restUrl}/${table}`);
  if (options.query && typeof options.query === 'object') {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers = {
    apikey: config.apiKey,
    authorization: `Bearer ${config.apiKey}`,
    accept: 'application/json',
  };

  let body;
  if (payload !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(sanitizeForPostgres(payload));
  }
  const prefer = [];
  if (options.onConflict) {
    const resolution = options.ignoreDuplicates ? 'ignore-duplicates' : 'merge-duplicates';
    prefer.push(`resolution=${resolution}`);
    url.searchParams.set('on_conflict', options.onConflict);
  }
  if (options.returnRepresentation) {
    prefer.push('return=representation');
  }
  if (prefer.length > 0) {
    headers.Prefer = prefer.join(',');
  }

  const response = await fetch(url.toString(), {
    method,
    headers,
    body,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`supabase ${table} ${method} failed: ${response.status} ${text}`.trim());
  }
  return response;
}

async function supabaseSelect(table, query = {}) {
  const response = await supabaseRequest(table, 'GET', undefined, { query });
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
    status: 'completed',
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
  return supabaseRequest('morpheus_relayer_runs', 'POST', payload);
}

export async function upsertRelayerJob(record) {
  return supabaseRequest('morpheus_relayer_jobs', 'POST', record, { onConflict: 'event_key' });
}

export async function insertRelayerJobIfAbsent(record) {
  return supabaseRequest('morpheus_relayer_jobs', 'POST', record, {
    onConflict: 'event_key',
    ignoreDuplicates: true,
  });
}

export async function patchRelayerJob(eventKey, fields) {
  return supabaseRequest(
    'morpheus_relayer_jobs',
    'PATCH',
    {
      ...fields,
      updated_at: new Date().toISOString(),
    },
    {
      query: {
        event_key: `eq.${eventKey}`,
      },
    }
  );
}

export async function claimRelayerJob(eventKey, fields, options = {}) {
  const network = resolveSupabaseNetwork();
  const readyStatuses = Array.isArray(options.readyStatuses)
    ? options.readyStatuses.filter(Boolean)
    : [];
  const staleStatuses = Array.isArray(options.staleStatuses)
    ? options.staleStatuses.filter(Boolean)
    : [];
  const staleBeforeIso = trimString(options.staleBeforeIso || '');
  const orParts = [];
  if (readyStatuses.length > 0) {
    orParts.push(`status.in.(${readyStatuses.join(',')})`);
  }
  if (staleStatuses.length > 0 && staleBeforeIso) {
    for (const status of staleStatuses) {
      orParts.push(`and(status.eq.${status},updated_at.lt.${staleBeforeIso})`);
    }
  }
  const response = await supabaseRequest(
    'morpheus_relayer_jobs',
    'PATCH',
    {
      ...fields,
      updated_at: new Date().toISOString(),
    },
    {
      returnRepresentation: true,
      query: {
        event_key: `eq.${eventKey}`,
        network: `eq.${network}`,
        ...(orParts.length > 0 ? { or: `(${orParts.join(',')})` } : {}),
      },
    }
  );
  if (!response) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    const rows = JSON.parse(text);
    return Array.isArray(rows) ? rows[0] || null : null;
  } catch {
    return null;
  }
}

export async function quarantineRelayerJobsBelowRequestId({
  network = resolveSupabaseNetwork(),
  chain = 'neo_n3',
  ltRequestId,
  statuses = [],
  note = '',
}) {
  if (!Number.isFinite(Number(ltRequestId))) return 0;
  const rows = await fetchRelayerJobsByStatuses(statuses, chain, 5000);
  const threshold = Number(ltRequestId);
  const targetRows = rows.filter((row) => Number(row.request_id || 0) < threshold);
  if (targetRows.length === 0) return 0;
  const nowIso = new Date().toISOString();
  let patched = 0;
  for (const row of targetRows) {
    const response = await supabaseRequest(
      'morpheus_relayer_jobs',
      'PATCH',
      {
        status: 'stale_quarantined',
        next_retry_at: null,
        completed_at: nowIso,
        updated_at: nowIso,
        last_error: `${note || `quarantined below request cursor floor ${threshold}`} :: ${trimString(row.last_error || 'legacy open relayer job')}`,
      },
      {
        query: {
          event_key: `eq.${row.event_key}`,
          network: `eq.${network}`,
        },
      }
    );
    if (response?.ok !== false) patched += 1;
  }
  return patched;
}

export async function fetchRelayerJobsByStatuses(statuses, chain = null, limit = 100) {
  if (!Array.isArray(statuses) || statuses.length === 0) return [];
  const network = resolveSupabaseNetwork();
  const query = {
    select:
      'id,event_key,chain,request_id,request_type,tx_hash,block_number,route,status,attempts,last_error,next_retry_at,worker_status,worker_response,fulfill_tx,event,updated_at,completed_at,created_at',
    network: `eq.${network}`,
    status: `in.(${statuses.join(',')})`,
    order: 'updated_at.asc',
    limit,
  };
  if (chain) query.chain = `eq.${chain}`;
  return supabaseSelect('morpheus_relayer_jobs', query);
}

export function buildRelayerJobRecord(event, details = {}) {
  const kernelIntent = resolveKernelIntent(event.requestType);
  return {
    network: details.network || event.network || resolveSupabaseNetwork(),
    event_key: details.event_key,
    chain: event.chain,
    request_id: String(event.requestId || '0'),
    request_type: String(event.requestType || ''),
    tx_hash: event.txHash || null,
    block_number: event.blockNumber ?? null,
    route: details.route || null,
    status: details.status || 'queued',
    attempts: Number(details.attempts || 0),
    last_error: details.last_error || null,
    next_retry_at: details.next_retry_at || null,
    worker_status: details.worker_status ?? null,
    worker_response:
      details.worker_response && typeof details.worker_response === 'object'
        ? {
            ...details.worker_response,
            kernel_intent: {
              module_id: kernelIntent.moduleId,
              operation: kernelIntent.operation,
              legacy_request_type: kernelIntent.legacyRequestType,
            },
          }
        : details.worker_response ?? null,
    fulfill_tx: details.fulfill_tx ?? null,
    event,
    updated_at: new Date().toISOString(),
    completed_at: details.completed_at || null,
  };
}

function collectEncryptedFields(value, path = [], results = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      collectEncryptedFields(entry, [...path, String(index)], results)
    );
    return results;
  }
  if (!isPlainObject(value)) return results;

  for (const [key, current] of Object.entries(value)) {
    const nextPath = [...path, key];
    if (key.startsWith('encrypted_') && typeof current === 'string' && trimString(current)) {
      results.push({ field_path: nextPath.join('.'), ciphertext: trimString(current) });
      continue;
    }
    if (key === 'encrypted_inputs' && isPlainObject(current)) {
      for (const [nestedKey, nestedValue] of Object.entries(current)) {
        if (typeof nestedValue === 'string' && trimString(nestedValue)) {
          results.push({
            field_path: [...nextPath, nestedKey].join('.'),
            ciphertext: trimString(nestedValue),
          });
        }
      }
      continue;
    }
    collectEncryptedFields(current, nextPath, results);
  }
  return results;
}

export async function upsertAutomationJob(record) {
  return supabaseRequest(
    'morpheus_automation_jobs',
    'POST',
    {
      network: record.network || resolveSupabaseNetwork(),
      ...record,
    },
    { onConflict: 'automation_id' }
  );
}

export async function patchAutomationJob(automationId, fields) {
  return supabaseRequest(
    'morpheus_automation_jobs',
    'PATCH',
    {
      ...fields,
      updated_at: new Date().toISOString(),
    },
    {
      query: {
        automation_id: `eq.${automationId}`,
      },
    }
  );
}

export async function fetchAutomationJobById(automationId) {
  const rows = await supabaseSelect('morpheus_automation_jobs', {
    select: '*',
    network: `eq.${resolveSupabaseNetwork()}`,
    automation_id: `eq.${automationId}`,
    limit: 1,
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function fetchActiveAutomationJobs(limit = 50, dueAtIso = null) {
  const query = {
    select: '*',
    network: `eq.${resolveSupabaseNetwork()}`,
    status: 'eq.active',
    order: 'next_run_at.asc.nullslast,updated_at.asc',
    limit,
  };
  if (trimString(dueAtIso)) {
    query.or = `(next_run_at.is.null,next_run_at.lte.${trimString(dueAtIso)})`;
  }
  return supabaseSelect('morpheus_automation_jobs', query);
}

export async function fetchAutomationRunByQueueTxHash(txHash) {
  const normalizedTxHash = trimString(txHash);
  if (!normalizedTxHash) return null;
  const rows = await supabaseSelect('morpheus_automation_runs', {
    select: '*',
    network: `eq.${resolveSupabaseNetwork()}`,
    'queue_tx->>tx_hash': `eq.${normalizedTxHash}`,
    order: 'created_at.desc',
    limit: 1,
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function insertAutomationRun(record) {
  return supabaseRequest('morpheus_automation_runs', 'POST', {
    network: record.network || resolveSupabaseNetwork(),
    ...record,
  });
}

export async function patchAutomationRunByQueueTxHash(txHash, fields) {
  const normalizedTxHash = trimString(txHash);
  if (!normalizedTxHash) return null;
  return supabaseRequest(
    'morpheus_automation_runs',
    'PATCH',
    {
      ...fields,
    },
    {
      query: {
        network: `eq.${resolveSupabaseNetwork()}`,
        'queue_tx->>tx_hash': `eq.${normalizedTxHash}`,
      },
    }
  );
}

export async function persistAutomationEncryptedFields(job) {
  const payload = isPlainObject(job?.execution_payload) ? job.execution_payload : {};
  const encryptedFields = collectEncryptedFields(payload);
  if (encryptedFields.length === 0) return;
  const rows = encryptedFields.map((entry) => ({
    project_id: job.project_id || null,
    network: job.network || resolveSupabaseNetwork(),
    name: `automation:${job.automation_id}:${entry.field_path}:${randomUUID()}`,
    target_chain: job.chain,
    encryption_algorithm: 'client-supplied-ciphertext',
    key_version: 1,
    ciphertext: entry.ciphertext,
    metadata: {
      automation_id: job.automation_id,
      network: job.network || resolveSupabaseNetwork(),
      registration_request_id: job.registration_request_id,
      field_path: entry.field_path,
      ciphertext_sha256: sha256Hex(entry.ciphertext),
    },
  }));
  await supabaseRequest('morpheus_encrypted_secrets', 'POST', rows);
}

export async function insertWorkflowExecution(record) {
  return supabaseRequest('morpheus_workflow_executions', 'POST', buildWorkflowExecutionRecord(record));
}

export async function insertPolicyDecision(record) {
  return supabaseRequest('morpheus_policy_decisions', 'POST', {
    network: record.network || resolveSupabaseNetwork(),
    workflow_id: record.workflow_id || record.workflowId || null,
    execution_id: record.execution_id || record.executionId || null,
    scope: trimString(record.scope || ''),
    decision: trimString(record.decision || 'review'),
    reason: trimString(record.reason || '') || null,
    metadata: isPlainObject(record.metadata) ? record.metadata : {},
  });
}

export async function insertRiskEvent(record) {
  return supabaseRequest('morpheus_risk_events', 'POST', buildRiskEventRecord(record));
}
