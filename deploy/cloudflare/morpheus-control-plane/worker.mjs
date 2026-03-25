import { WorkflowEntrypoint } from './workflow-runtime.mjs';

const JOB_ROUTE_CONFIG = {
  '/oracle/query': {
    delivery: 'queue',
    queue: 'oracle_request',
    binding: 'MORPHEUS_ORACLE_REQUEST_QUEUE',
  },
  '/oracle/smart-fetch': {
    delivery: 'queue',
    queue: 'oracle_request',
    binding: 'MORPHEUS_ORACLE_REQUEST_QUEUE',
  },
  '/compute/execute': {
    delivery: 'queue',
    queue: 'oracle_request',
    binding: 'MORPHEUS_ORACLE_REQUEST_QUEUE',
  },
  '/neodid/bind': {
    delivery: 'queue',
    queue: 'oracle_request',
    binding: 'MORPHEUS_ORACLE_REQUEST_QUEUE',
  },
  '/neodid/action-ticket': {
    delivery: 'queue',
    queue: 'oracle_request',
    binding: 'MORPHEUS_ORACLE_REQUEST_QUEUE',
  },
  '/neodid/recovery-ticket': {
    delivery: 'queue',
    queue: 'oracle_request',
    binding: 'MORPHEUS_ORACLE_REQUEST_QUEUE',
  },
  '/feeds/tick': {
    delivery: 'queue',
    queue: 'feed_tick',
    binding: 'MORPHEUS_FEED_TICK_QUEUE',
  },
  '/callbacks/broadcast': {
    delivery: 'workflow',
    queue: 'callback_broadcast',
    workflowBinding: 'CALLBACK_BROADCAST_WORKFLOW',
    workflowName: 'callback_broadcast',
  },
  '/automation/execute': {
    delivery: 'workflow',
    queue: 'automation_execute',
    workflowBinding: 'AUTOMATION_EXECUTE_WORKFLOW',
    workflowName: 'automation_execute',
  },
};

const RATE_LIMITS = {
  oracle_request: { limit: 30, windowMs: 60_000 },
  feed_tick: { limit: 60, windowMs: 60_000 },
  callback_broadcast: { limit: 60, windowMs: 60_000 },
  automation_execute: { limit: 30, windowMs: 60_000 },
};

const EXECUTION_PLANE_ROUTES = new Set([
  '/oracle/query',
  '/oracle/smart-fetch',
  '/compute/execute',
  '/neodid/bind',
  '/neodid/action-ticket',
  '/neodid/recovery-ticket',
]);

const TERMINAL_JOB_STATUSES = new Set(['succeeded', 'failed', 'dead_lettered', 'cancelled']);
const DEFAULT_REQUEUE_LIMIT = 50;
const REQUEUE_GRACE_MS = 60_000;
const DEFAULT_STALE_PROCESSING_MS = 10 * 60_000;
const ACTIVE_WORKFLOW_STATUSES = new Set([
  'queued',
  'running',
  'paused',
  'waiting',
  'waitingforpause',
]);
const SUCCESSFUL_WORKFLOW_STATUSES = new Set(['complete']);

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
  });
}

function trimString(value) {
  return String(value || '').trim();
}

function parseTimestampMs(value) {
  const raw = trimString(value);
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeJobStatus(value) {
  return trimString(value).toLowerCase();
}

function resolveRequeueLimit(env) {
  const configured = Number(env.MORPHEUS_CONTROL_PLANE_REQUEUE_LIMIT || DEFAULT_REQUEUE_LIMIT);
  if (!Number.isFinite(configured)) return DEFAULT_REQUEUE_LIMIT;
  return Math.min(Math.max(Math.floor(configured), 1), 200);
}

function resolveStaleProcessingMs(env) {
  const configured = Number(env.MORPHEUS_CONTROL_PLANE_STALE_PROCESSING_MS || DEFAULT_STALE_PROCESSING_MS);
  if (!Number.isFinite(configured)) return DEFAULT_STALE_PROCESSING_MS;
  return Math.max(Math.floor(configured), 30_000);
}

function isStaleProcessing(job, nowMs, staleProcessingMs) {
  const startedMs = parseTimestampMs(job?.started_at);
  if (!startedMs) return false;
  return nowMs - startedMs >= staleProcessingMs;
}

function computeRetryDelaySeconds(attempt, env) {
  const baseSeconds = Math.max(Number(env.MORPHEUS_CONTROL_PLANE_RETRY_BASE_SECONDS || 5), 1);
  const maxSeconds = Math.max(Number(env.MORPHEUS_CONTROL_PLANE_RETRY_MAX_SECONDS || 300), baseSeconds);
  const exp = Math.min(Math.max(Number(attempt || 1) - 1, 0), 10);
  const delay = Math.min(maxSeconds, baseSeconds * 2 ** exp);
  const jittered = delay * (0.8 + Math.random() * 0.4);
  return Math.max(1, Math.round(jittered));
}

function getClientIp(request) {
  return (
    trimString(request.headers.get('cf-connecting-ip')) ||
    trimString(request.headers.get('x-real-ip')) ||
    trimString(request.headers.get('x-forwarded-for')).split(',')[0] ||
    'unknown'
  );
}

function resolveNetworkRoute(url) {
  const path = trimString(url.pathname || '/');
  const rawSegments = path.replace(/^\/+/, '').split('/');
  const segments =
    trimString(rawSegments[0]).toLowerCase() === 'control' ? rawSegments.slice(1) : rawSegments;
  const maybeNetwork = trimString(segments[0]).toLowerCase();
  const network = maybeNetwork === 'mainnet' ? 'mainnet' : 'testnet';
  const routePath =
    maybeNetwork === 'mainnet' || maybeNetwork === 'testnet'
      ? `/${segments.slice(1).join('/')}`.replace(/\/+$/, '') || '/'
      : path.replace(/\/+$/, '') || '/';
  return {
    network,
    routePath,
  };
}

function getSupabaseConfig(env) {
  const baseUrl = trimString(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '');
  const apiKey = trimString(
    env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || ''
  );
  if (!baseUrl || !apiKey) throw new Error('SUPABASE_URL and service-role key are required');
  return {
    restUrl: `${baseUrl.replace(/\/$/, '')}/rest/v1`,
    apiKey,
  };
}

async function supabaseFetch(env, path, init = {}) {
  const config = getSupabaseConfig(env);
  const headers = new Headers(init.headers || {});
  headers.set('apikey', config.apiKey);
  headers.set('authorization', `Bearer ${config.apiKey}`);
  headers.set('accept', 'application/json');
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  return fetch(`${config.restUrl}${path}`, {
    ...init,
    headers,
  });
}

function resolveJobMetadata(routePath, payload) {
  const body = payload && typeof payload === 'object' ? payload : {};
  return {
    target_chain: trimString(body.target_chain || '') || null,
    project_slug: trimString(body.project_slug || '') || null,
    request_id: trimString(body.request_id || body.oracle_request_id || '') || null,
    dedupe_key:
      trimString(body.dedupe_key || body.idempotency_key || body.request_id || '') || null,
  };
}

function isWorkflowBindingAvailable(env, bindingName) {
  const binding = env?.[bindingName];
  return Boolean(binding && typeof binding.create === 'function' && typeof binding.get === 'function');
}

function isWorkflowRouteConfig(config) {
  return config?.delivery === 'workflow';
}

function normalizeWorkflowStatus(details) {
  const raw =
    typeof details === 'string'
      ? details
      : typeof details?.status === 'string'
        ? details.status
        : '';
  return raw.toLowerCase().replace(/[^a-z]/g, '');
}

async function loadWorkflowInstanceDetails(env, jobConfig, instanceId) {
  if (!isWorkflowRouteConfig(jobConfig)) return null;
  if (!isWorkflowBindingAvailable(env, jobConfig.workflowBinding)) return null;
  const binding = env[jobConfig.workflowBinding];
  const instance = await binding.get(instanceId);
  return {
    id: instance.id,
    details: typeof instance.status === 'function' ? await instance.status() : null,
  };
}

function buildWorkflowInstanceId(job, jobConfig) {
  const dispatchCount = Math.max(
    Number(job?.metadata?.workflow_dispatch_count || 0) + 1,
    1
  );
  return `${jobConfig.workflowName}:${job.network}:${job.id}:${dispatchCount}`;
}

async function dispatchWorkflowInstance(env, job, jobConfig) {
  if (!jobConfig?.workflowBinding || !jobConfig?.workflowName) {
    throw new Error(`route ${job.route} is not configured for workflows`);
  }
  const binding = env[jobConfig.workflowBinding];
  if (!binding || typeof binding.create !== 'function') {
    throw new Error(`workflow binding ${jobConfig.workflowBinding} is not configured`);
  }
  const instanceId = buildWorkflowInstanceId(job, jobConfig);
  const instance = await binding.create({
    id: instanceId,
    params: {
      job_id: job.id,
      network: job.network,
      payload: job.payload || {},
    },
  });
  return {
    id: instance.id,
    details: typeof instance.status === 'function' ? await instance.status() : null,
    workflow_binding: jobConfig.workflowBinding,
    workflow_name: jobConfig.workflowName,
    workflow_dispatch_count: Math.max(Number(job?.metadata?.workflow_dispatch_count || 0) + 1, 1),
  };
}

function validateAuth(request, env) {
  const configured = trimString(
    env.MORPHEUS_CONTROL_PLANE_API_KEY || env.MORPHEUS_OPERATOR_API_KEY
  );
  if (!configured) return null;
  const bearer = trimString(request.headers.get('authorization'));
  const admin = trimString(request.headers.get('x-admin-api-key'));
  if (bearer === `Bearer ${configured}` || admin === configured) return null;
  return json(401, { error: 'unauthorized' });
}

async function applyRateLimit(request, env, queueName) {
  const config = RATE_LIMITS[queueName];
  if (!config) return null;
  const redisUrl = trimString(env.UPSTASH_REDIS_REST_URL || '');
  const redisToken = trimString(env.UPSTASH_REDIS_REST_TOKEN || '');
  if (!redisUrl || !redisToken) return null;

  const key = `morpheus:control-plane:${queueName}:${getClientIp(request)}`;
  const response = await fetch(`${redisUrl.replace(/\/$/, '')}/pipeline`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${redisToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify([
      ['INCR', key],
      ['PTTL', key],
    ]),
  });
  if (!response.ok) {
    return json(503, { error: 'rate_limit_backend_unavailable' });
  }
  const result = await response.json();
  const count = Number(result?.[0]?.result || 0);
  let ttl = Number(result?.[1]?.result || -1);
  if (count <= 1 || ttl < 0) {
    await fetch(`${redisUrl.replace(/\/$/, '')}/pipeline`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${redisToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify([['PEXPIRE', key, String(config.windowMs)]]),
    });
    ttl = config.windowMs;
  }
  if (count <= config.limit) return null;
  return json(
    429,
    { error: 'rate_limit_exceeded', queue: queueName },
    { 'retry-after': String(Math.max(Math.ceil(ttl / 1000), 1)) }
  );
}

async function insertJob(env, record) {
  const response = await supabaseFetch(env, '/morpheus_control_plane_jobs', {
    method: 'POST',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify(record),
  });
  if (!response.ok) {
    throw new Error(`job insert failed: ${response.status} ${await response.text()}`);
  }
  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] : rows;
}

async function patchJob(env, jobId, network, fields) {
  const response = await supabaseFetch(
    env,
    `/morpheus_control_plane_jobs?id=eq.${jobId}&network=eq.${network}`,
    {
      method: 'PATCH',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify({
        ...fields,
        updated_at: new Date().toISOString(),
      }),
    }
  );
  if (!response.ok) {
    throw new Error(`job patch failed: ${response.status} ${await response.text()}`);
  }
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function loadJob(env, jobId, network) {
  const response = await supabaseFetch(
    env,
    `/morpheus_control_plane_jobs?id=eq.${jobId}&network=eq.${network}&select=*`
  );
  if (!response.ok) {
    throw new Error(`job fetch failed: ${response.status} ${await response.text()}`);
  }
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function listRecoverableJobs(env, network, limit, staleProcessingMs) {
  const response = await supabaseFetch(
    env,
    `/morpheus_control_plane_jobs?network=eq.${network}&select=*&status=in.(queued,processing,failed,dispatched)&order=created_at.asc&limit=${limit}`
  );
  if (!response.ok) {
    throw new Error(`recoverable job list failed: ${response.status} ${await response.text()}`);
  }
  const rows = await response.json().catch(() => []);
  const nowMs = Date.now();
  return (Array.isArray(rows) ? rows : []).filter((job) => {
    const status = normalizeJobStatus(job.status);
    const jobConfig = JOB_ROUTE_CONFIG[job.route];
    const workflowManaged = isWorkflowRouteConfig(jobConfig);
    if (status === 'queued') {
      const runAfterMs = parseTimestampMs(job.run_after);
      const updatedMs = parseTimestampMs(job.updated_at);
      if (runAfterMs && runAfterMs > nowMs) return false;
      if (updatedMs && nowMs - updatedMs < REQUEUE_GRACE_MS) return false;
      return true;
    }
    if (status === 'processing') {
      return isStaleProcessing(job, nowMs, staleProcessingMs);
    }
    if (status === 'failed' && workflowManaged) {
      const updatedMs = parseTimestampMs(job.updated_at);
      if (updatedMs && nowMs - updatedMs < REQUEUE_GRACE_MS) return false;
      return true;
    }
    if (status === 'dispatched' && workflowManaged) {
      const updatedMs = parseTimestampMs(job.updated_at);
      if (!updatedMs) return false;
      return nowMs - updatedMs >= staleProcessingMs;
    }
    return false;
  });
}

async function enqueueJob(env, bindingName, message) {
  const binding = env[bindingName];
  if (!binding || typeof binding.send !== 'function') {
    throw new Error(`queue binding ${bindingName} is not configured`);
  }
  await binding.send(message);
}

async function requeueJob(env, job) {
  const jobConfig = JOB_ROUTE_CONFIG[job.route];
  if (!jobConfig) {
    throw new Error(`route ${job.route} is not configured`);
  }
  const nowIso = new Date().toISOString();
  if (isWorkflowRouteConfig(jobConfig)) {
    const existingWorkflowInstanceId = trimString(job?.metadata?.workflow_instance_id || '');
    if (existingWorkflowInstanceId) {
      try {
        const existingWorkflow = await loadWorkflowInstanceDetails(
          env,
          jobConfig,
          existingWorkflowInstanceId
        );
        const workflowStatus = normalizeWorkflowStatus(existingWorkflow?.details);
        if (ACTIVE_WORKFLOW_STATUSES.has(workflowStatus)) {
          const patchedStatus = workflowStatus === 'queued' ? 'dispatched' : 'processing';
          await patchJob(env, job.id, job.network, {
            status: patchedStatus,
            error: null,
            metadata: {
              ...(job.metadata || {}),
              workflow_name: jobConfig.workflowName,
              workflow_binding: jobConfig.workflowBinding,
              workflow_instance_id: existingWorkflow.id,
              workflow_status: existingWorkflow.details || null,
              workflow_last_checked_at: nowIso,
            },
          });
          return {
            action: 'workflow_active',
            workflow_instance_id: existingWorkflow.id,
            workflow_status: existingWorkflow.details || null,
          };
        }
        if (SUCCESSFUL_WORKFLOW_STATUSES.has(workflowStatus)) {
          await patchJob(env, job.id, job.network, {
            status: 'succeeded',
            result:
              existingWorkflow?.details &&
              typeof existingWorkflow.details === 'object' &&
              'output' in existingWorkflow.details
                ? existingWorkflow.details.output
                : job.result || null,
            error: null,
            completed_at: nowIso,
            metadata: {
              ...(job.metadata || {}),
              workflow_name: jobConfig.workflowName,
              workflow_binding: jobConfig.workflowBinding,
              workflow_instance_id: existingWorkflow.id,
              workflow_status: existingWorkflow.details || null,
              workflow_last_checked_at: nowIso,
            },
          });
          return {
            action: 'workflow_complete',
            workflow_instance_id: existingWorkflow.id,
            workflow_status: existingWorkflow.details || null,
          };
        }
      } catch (error) {
        job = {
          ...job,
          metadata: {
            ...(job.metadata || {}),
            workflow_status_check_error: error instanceof Error ? error.message : String(error),
          },
        };
      }
    }

    const workflow = await dispatchWorkflowInstance(env, job, jobConfig);
    await patchJob(env, job.id, job.network, {
      status: 'dispatched',
      error: null,
      run_after: null,
      started_at: null,
      completed_at: null,
      metadata: {
        ...(job.metadata || {}),
        last_requeued_at: nowIso,
        requeue_source: 'control-plane-recover',
        workflow_name: workflow.workflow_name,
        workflow_binding: workflow.workflow_binding,
        workflow_instance_id: workflow.id,
        workflow_status: workflow.details || null,
        workflow_dispatch_count: workflow.workflow_dispatch_count,
      },
    });
    return {
      action: 'workflow_redispatched',
      workflow_instance_id: workflow.id,
      workflow_status: workflow.details || null,
    };
  }

  await patchJob(env, job.id, job.network, {
    status: 'dispatched',
    error: null,
    run_after: null,
    started_at: null,
    completed_at: null,
    metadata: {
      ...(job.metadata || {}),
      last_requeued_at: nowIso,
      requeue_source: 'control-plane-recover',
    },
  });
  await enqueueJob(env, jobConfig.binding, {
    job_id: job.id,
    network: job.network,
    queue: job.queue,
    route: job.route,
    payload: job.payload || {},
    target_chain: job.target_chain,
    project_slug: job.project_slug,
    request_id: job.request_id,
    dedupe_key: job.dedupe_key,
    created_at: job.created_at,
    requeued_at: nowIso,
  });
  return {
    action: 'queue_requeued',
  };
}

function getExecutionPlaneConfig(env, network) {
  const normalized = network === 'mainnet' ? 'MAINNET' : 'TESTNET';
  const baseUrl = trimString(
    env[`MORPHEUS_${normalized}_EXECUTION_BASE_URL`] || env.MORPHEUS_EXECUTION_BASE_URL || ''
  );
  const token = trimString(
    env[`MORPHEUS_${normalized}_EXECUTION_TOKEN`] ||
      env.MORPHEUS_EXECUTION_TOKEN ||
      env.PHALA_API_TOKEN ||
      env.PHALA_SHARED_SECRET ||
      ''
  );
  if (!baseUrl) {
    throw new Error(`execution base URL is not configured for network ${network}`);
  }
  return {
    baseUrls: baseUrl
      .split(',')
      .map((entry) => trimString(entry).replace(/\/$/, ''))
      .filter(Boolean),
    token,
  };
}

function stableExecutionPoolIndex(seed, size) {
  if (!size || size <= 1) return 0;
  const text = trimString(seed || '');
  if (!text) return 0;
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash % size;
}

function orderExecutionBaseUrls(baseUrls, seed) {
  const urls = Array.isArray(baseUrls) ? baseUrls.filter(Boolean) : [];
  if (urls.length <= 1) return urls;
  const start = stableExecutionPoolIndex(seed, urls.length);
  return [...urls.slice(start), ...urls.slice(0, start)];
}

function resolveNeoN3FeedSigner(env, network) {
  const upper = network === 'mainnet' ? 'MAINNET' : 'TESTNET';
  const wif = trimString(
    env[`MORPHEUS_${upper}_FEED_NEO_N3_WIF`] ||
      env[`MORPHEUS_${upper}_RELAYER_NEO_N3_WIF`] ||
      env.MORPHEUS_FEED_NEO_N3_WIF ||
      env.MORPHEUS_RELAYER_NEO_N3_WIF ||
      ''
  );
  const privateKey = trimString(
    env[`MORPHEUS_${upper}_FEED_NEO_N3_PRIVATE_KEY`] ||
      env[`MORPHEUS_${upper}_RELAYER_NEO_N3_PRIVATE_KEY`] ||
      env.MORPHEUS_FEED_NEO_N3_PRIVATE_KEY ||
      env.MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY ||
      ''
  );
  return {
    ...(wif ? { wif } : {}),
    ...(privateKey ? { private_key: privateKey } : {}),
  };
}

function resolveNeoN3BackendSigner(env, network) {
  return resolveNeoN3FeedSigner(env, network);
}

function isRetryableStatus(status) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

async function fetchJsonWithTimeout(url, init = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(`request timed out after ${timeoutMs}ms`)),
    timeoutMs
  );
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    const text = await response.text();
    let body = text;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text };
    }
    return { response, body };
  } finally {
    clearTimeout(timer);
  }
}

async function callExecutionPlane(env, job) {
  if (!EXECUTION_PLANE_ROUTES.has(job.route)) {
    throw new Error(`route ${job.route} is not mapped to the confidential execution plane`);
  }
  const execution = getExecutionPlaneConfig(env, job.network);
  const headers = new Headers({ 'content-type': 'application/json' });
  if (execution.token) {
    headers.set('authorization', `Bearer ${execution.token}`);
    headers.set('x-phala-token', execution.token);
  }
  const timeoutMs = Math.max(Number(env.MORPHEUS_EXECUTION_TIMEOUT_MS || 30000), 1000);
  let lastError = null;
  let lastResponse = null;
  const orderedBaseUrls = orderExecutionBaseUrls(
    execution.baseUrls,
    job.request_id || job.id || job.dedupe_key || ''
  );
  for (const baseUrl of orderedBaseUrls) {
    try {
      const { response, body } = await fetchJsonWithTimeout(
        `${baseUrl}${job.route}`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(job.payload || {}),
        },
        timeoutMs
      );
      lastResponse = {
        ok: response.ok,
        status: response.status,
        body,
        execution_base_url: baseUrl,
      };
      if (response.ok || !isRetryableStatus(response.status)) {
        return lastResponse;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  if (lastResponse) return lastResponse;
  throw new Error(lastError || 'execution plane unavailable');
}

async function callExecutionFeedPlane(env, job) {
  const execution = getExecutionPlaneConfig(env, job.network);
  const signer = resolveNeoN3FeedSigner(env, job.network);
  if (!signer.wif && !signer.private_key) {
    throw new Error(`Neo N3 updater signer is not configured for ${job.network}`);
  }
  const headers = new Headers({ 'content-type': 'application/json' });
  if (execution.token) {
    headers.set('authorization', `Bearer ${execution.token}`);
    headers.set('x-phala-token', execution.token);
  }
  const timeoutMs = Math.max(Number(env.MORPHEUS_EXECUTION_TIMEOUT_MS || 30000), 1000);
  let lastError = null;
  let lastResponse = null;
  const orderedBaseUrls = orderExecutionBaseUrls(
    execution.baseUrls,
    job.request_id || job.id || job.symbol || job.payload?.symbol || ''
  );
  for (const baseUrl of orderedBaseUrls) {
    try {
      const { response, body } = await fetchJsonWithTimeout(
        `${baseUrl}/oracle/feed`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            ...(job.payload || {}),
            ...signer,
            wait: false,
          }),
        },
        timeoutMs
      );
      lastResponse = {
        ok: response.ok,
        status: response.status,
        body,
        execution_base_url: baseUrl,
      };
      if (response.ok || !isRetryableStatus(response.status)) {
        return lastResponse;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  if (lastResponse) return lastResponse;
  throw new Error(lastError || 'feed execution plane unavailable');
}

function getAppBackendConfig(env) {
  const baseUrl = trimString(env.MORPHEUS_APP_BACKEND_URL || '');
  const token = trimString(
    env.MORPHEUS_APP_BACKEND_TOKEN ||
      env.MORPHEUS_CONTROL_PLANE_API_KEY ||
      env.MORPHEUS_OPERATOR_API_KEY ||
      ''
  );
  if (!baseUrl) {
    throw new Error('MORPHEUS_APP_BACKEND_URL is not configured');
  }
  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    token,
  };
}

async function callAppBackend(env, path, payload) {
  const backend = getAppBackendConfig(env);
  const headers = new Headers({ 'content-type': 'application/json' });
  if (backend.token) {
    headers.set('authorization', `Bearer ${backend.token}`);
    headers.set('x-admin-api-key', backend.token);
  }
  const timeoutMs = Math.max(Number(env.MORPHEUS_APP_BACKEND_TIMEOUT_MS || 30000), 1000);
  const { response, body } = await fetchJsonWithTimeout(
    `${backend.baseUrl}${path}`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(payload || {}),
    },
    timeoutMs
  );
  return {
    ok: response.ok,
    status: response.status,
    body,
    backend_url: backend.baseUrl,
  };
}

async function processExecutionJob(message, env) {
  const body = message.body && typeof message.body === 'object' ? message.body : {};
  const jobId = trimString(body.job_id);
  const network = trimString(body.network) === 'mainnet' ? 'mainnet' : 'testnet';
  if (!jobId) {
    message.ack();
    return;
  }

  const job = await loadJob(env, jobId, network);
  if (!job) {
    message.ack();
    return;
  }

  const nowMs = Date.now();
  const staleProcessingMs = resolveStaleProcessingMs(env);
  const jobStatus = normalizeJobStatus(job.status);
  if (TERMINAL_JOB_STATUSES.has(jobStatus)) {
    message.ack();
    return;
  }
  if (jobStatus === 'processing' && !isStaleProcessing(job, nowMs, staleProcessingMs)) {
    message.ack();
    return;
  }
  if (jobStatus === 'queued') {
    const runAfterMs = parseTimestampMs(job.run_after);
    if (runAfterMs && runAfterMs > nowMs) {
      const delaySeconds = Math.min(Math.max(Math.ceil((runAfterMs - nowMs) / 1000), 1), 300);
      message.retry({ delaySeconds });
      return;
    }
  }

  const attempts = Number(message.attempts || 1);
  await patchJob(env, jobId, network, {
    status: 'processing',
    retry_count: Math.max(attempts - 1, 0),
    started_at: job.started_at || new Date().toISOString(),
    metadata: {
      ...(job.metadata || {}),
      queue_message_id: message.id,
      queue_attempts: attempts,
      queue_name: body.queue || 'oracle_request',
    },
  }).catch(() => null);

  try {
    const result = await callExecutionPlane(env, job);
    if (result.ok) {
      await patchJob(env, jobId, network, {
        status: 'succeeded',
        result: result.body,
        error: null,
        completed_at: new Date().toISOString(),
        run_after: null,
        metadata: {
          ...(job.metadata || {}),
          execution_status: result.status,
          execution_base_url: result.execution_base_url,
        },
      }).catch(() => null);
      message.ack();
      return;
    }

    if (!isRetryableStatus(result.status)) {
      await patchJob(env, jobId, network, {
        status: 'failed',
        result: result.body,
        error:
          trimString(result.body?.error || result.body?.message || '') ||
          `execution failed with status ${result.status}`,
        completed_at: new Date().toISOString(),
        run_after: null,
        metadata: {
          ...(job.metadata || {}),
          execution_status: result.status,
          execution_base_url: result.execution_base_url,
        },
      }).catch(() => null);
      message.ack();
      return;
    }

    const delaySeconds = computeRetryDelaySeconds(attempts, env);
    await patchJob(env, jobId, network, {
      status: 'queued',
      result: null,
      error:
        trimString(result.body?.error || result.body?.message || '') ||
        `execution temporarily failed with status ${result.status}`,
      retry_count: attempts,
      run_after: new Date(Date.now() + delaySeconds * 1000).toISOString(),
      metadata: {
        ...(job.metadata || {}),
        execution_status: result.status,
        execution_base_url: result.execution_base_url,
      },
    }).catch(() => null);
    message.retry({ delaySeconds });
  } catch (error) {
    const delaySeconds = computeRetryDelaySeconds(attempts, env);
    await patchJob(env, jobId, network, {
      status: 'queued',
      result: null,
      error: error instanceof Error ? error.message : String(error),
      retry_count: attempts,
      run_after: new Date(Date.now() + delaySeconds * 1000).toISOString(),
      metadata: {
        ...(job.metadata || {}),
        last_queue_error: error instanceof Error ? error.message : String(error),
      },
    }).catch(() => null);
    message.retry({ delaySeconds });
  }
}

async function processFeedTickJob(message, env) {
  const body = message.body && typeof message.body === 'object' ? message.body : {};
  const jobId = trimString(body.job_id);
  const network = trimString(body.network) === 'mainnet' ? 'mainnet' : 'testnet';
  if (!jobId) {
    message.ack();
    return;
  }
  const job = await loadJob(env, jobId, network);
  if (!job) {
    message.ack();
    return;
  }
  const nowMs = Date.now();
  const staleProcessingMs = resolveStaleProcessingMs(env);
  const jobStatus = normalizeJobStatus(job.status);
  if (TERMINAL_JOB_STATUSES.has(jobStatus)) {
    message.ack();
    return;
  }
  if (jobStatus === 'processing' && !isStaleProcessing(job, nowMs, staleProcessingMs)) {
    message.ack();
    return;
  }
  if (jobStatus === 'queued') {
    const runAfterMs = parseTimestampMs(job.run_after);
    if (runAfterMs && runAfterMs > nowMs) {
      const delaySeconds = Math.min(Math.max(Math.ceil((runAfterMs - nowMs) / 1000), 1), 300);
      message.retry({ delaySeconds });
      return;
    }
  }
  const attempts = Number(message.attempts || 1);
  await patchJob(env, jobId, network, {
    status: 'processing',
    retry_count: Math.max(attempts - 1, 0),
    started_at: job.started_at || new Date().toISOString(),
  }).catch(() => null);

  try {
    const result = await callExecutionFeedPlane(env, {
      ...job,
      network,
    });
    if (result.ok) {
      await patchJob(env, jobId, network, {
        status: 'succeeded',
        result: result.body,
        error: null,
        completed_at: new Date().toISOString(),
        run_after: null,
        metadata: {
          ...(job.metadata || {}),
          execution_status: result.status,
          execution_base_url: result.execution_base_url,
        },
      }).catch(() => null);
      message.ack();
      return;
    }

    if (!isRetryableStatus(result.status)) {
      await patchJob(env, jobId, network, {
        status: 'failed',
        result: result.body,
        error:
          trimString(result.body?.error || result.body?.message || '') ||
          `feed tick failed with status ${result.status}`,
        completed_at: new Date().toISOString(),
        run_after: null,
        metadata: {
          ...(job.metadata || {}),
          execution_status: result.status,
          execution_base_url: result.execution_base_url,
        },
      }).catch(() => null);
      message.ack();
      return;
    }

    const delaySeconds = computeRetryDelaySeconds(attempts, env);
    await patchJob(env, jobId, network, {
      status: 'queued',
      error:
        trimString(result.body?.error || result.body?.message || '') ||
        `feed tick temporarily failed with status ${result.status}`,
      retry_count: attempts,
      run_after: new Date(Date.now() + delaySeconds * 1000).toISOString(),
      metadata: {
        ...(job.metadata || {}),
        execution_status: result.status,
        execution_base_url: result.execution_base_url,
      },
    }).catch(() => null);
    message.retry({ delaySeconds });
  } catch (error) {
    const delaySeconds = computeRetryDelaySeconds(attempts, env);
    await patchJob(env, jobId, network, {
      status: 'queued',
      error: error instanceof Error ? error.message : String(error),
      retry_count: attempts,
      run_after: new Date(Date.now() + delaySeconds * 1000).toISOString(),
      metadata: {
        ...(job.metadata || {}),
        last_queue_error: error instanceof Error ? error.message : String(error),
      },
    }).catch(() => null);
    message.retry({ delaySeconds });
  }
}

export class CallbackBroadcastWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const payload = event.payload && typeof event.payload === 'object' ? event.payload : {};
    const jobId = trimString(payload.job_id || '');
    const network = trimString(payload.network) === 'mainnet' ? 'mainnet' : 'testnet';
    if (!jobId) {
      throw new Error('job_id is required');
    }

    const job = await step.do('load callback broadcast job', async () => loadJob(this.env, jobId, network));
    if (!job) {
      throw new Error(`job not found: ${jobId}`);
    }

    await step.do('mark callback broadcast processing', async () =>
      patchJob(this.env, jobId, network, {
        status: 'processing',
        error: null,
        started_at: job.started_at || new Date().toISOString(),
        metadata: {
          ...(job.metadata || {}),
          workflow_name: 'callback_broadcast',
          workflow_binding: 'CALLBACK_BROADCAST_WORKFLOW',
          workflow_runtime: 'cloudflare-workflows',
        },
      })
    );

    try {
      const signer = resolveNeoN3BackendSigner(this.env, network);
      const result = await step.do(
        'execute callback broadcast',
        {
          retries: { limit: 5, delay: '30 seconds', backoff: 'exponential' },
        },
        async () =>
          callAppBackend(this.env, '/api/internal/control-plane/callback-broadcast', {
            ...(job.payload || {}),
            network,
            ...signer,
          })
      );

      if (!result.ok) {
        throw new Error(
          trimString(result.body?.error || result.body?.message || '') ||
            `callback broadcast failed with status ${result.status}`
        );
      }

      await step.do('mark callback broadcast success', async () =>
        patchJob(this.env, jobId, network, {
          status: 'succeeded',
          result: result.body,
          error: null,
          completed_at: new Date().toISOString(),
          metadata: {
            ...(job.metadata || {}),
            backend_status: result.status,
            backend_url: result.backend_url,
            workflow_name: 'callback_broadcast',
            workflow_binding: 'CALLBACK_BROADCAST_WORKFLOW',
            workflow_runtime: 'cloudflare-workflows',
          },
        })
      );

      return {
        ok: true,
        workflow: 'callback_broadcast',
        job_id: jobId,
        network,
        result: result.body,
      };
    } catch (error) {
      await step.do('mark callback broadcast failure', async () =>
        patchJob(this.env, jobId, network, {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          completed_at: new Date().toISOString(),
          metadata: {
            ...(job.metadata || {}),
            workflow_name: 'callback_broadcast',
            workflow_binding: 'CALLBACK_BROADCAST_WORKFLOW',
            workflow_runtime: 'cloudflare-workflows',
          },
        })
      );
      throw error;
    }
  }
}

export class AutomationExecuteWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const payload = event.payload && typeof event.payload === 'object' ? event.payload : {};
    const jobId = trimString(payload.job_id || '');
    const network = trimString(payload.network) === 'mainnet' ? 'mainnet' : 'testnet';
    if (!jobId) {
      throw new Error('job_id is required');
    }

    const job = await step.do('load automation execute job', async () => loadJob(this.env, jobId, network));
    if (!job) {
      throw new Error(`job not found: ${jobId}`);
    }

    await step.do('mark automation execute processing', async () =>
      patchJob(this.env, jobId, network, {
        status: 'processing',
        error: null,
        started_at: job.started_at || new Date().toISOString(),
        metadata: {
          ...(job.metadata || {}),
          workflow_name: 'automation_execute',
          workflow_binding: 'AUTOMATION_EXECUTE_WORKFLOW',
          workflow_runtime: 'cloudflare-workflows',
        },
      })
    );

    try {
      const automationId = trimString(job.payload?.automation_id || job.payload?.id || '');
      if (!automationId) {
        throw new Error('automation_id is required');
      }
      const signer = resolveNeoN3BackendSigner(this.env, network);
      const result = await step.do(
        'execute automation queueing',
        {
          retries: { limit: 5, delay: '30 seconds', backoff: 'exponential' },
        },
        async () =>
          callAppBackend(this.env, '/api/internal/control-plane/automation-execute', {
            automation_id: automationId,
            network,
            ...signer,
          })
      );

      if (!result.ok) {
        throw new Error(
          trimString(result.body?.error || result.body?.message || '') ||
            `automation execute failed with status ${result.status}`
        );
      }

      await step.do('mark automation execute success', async () =>
        patchJob(this.env, jobId, network, {
          status: 'succeeded',
          result: result.body,
          error: null,
          completed_at: new Date().toISOString(),
          metadata: {
            ...(job.metadata || {}),
            backend_status: result.status,
            backend_url: result.backend_url,
            workflow_name: 'automation_execute',
            workflow_binding: 'AUTOMATION_EXECUTE_WORKFLOW',
            workflow_runtime: 'cloudflare-workflows',
          },
        })
      );

      return {
        ok: true,
        workflow: 'automation_execute',
        job_id: jobId,
        network,
        result: result.body,
      };
    } catch (error) {
      await step.do('mark automation execute failure', async () =>
        patchJob(this.env, jobId, network, {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          completed_at: new Date().toISOString(),
          metadata: {
            ...(job.metadata || {}),
            workflow_name: 'automation_execute',
            workflow_binding: 'AUTOMATION_EXECUTE_WORKFLOW',
            workflow_runtime: 'cloudflare-workflows',
          },
        })
      );
      throw error;
    }
  }
}

export default {
  async fetch(request, env) {
    const authFailure = validateAuth(request, env);
    if (authFailure) return authFailure;

    const url = new URL(request.url);
    const routing = resolveNetworkRoute(url);

    if (routing.routePath === '/' || routing.routePath === '') {
      return json(200, {
        service: 'morpheus-control-plane',
        network_default: 'testnet',
        supported_routes: Object.keys(JOB_ROUTE_CONFIG),
      });
    }

    if (routing.routePath === '/health') {
      return json(200, {
        status: 'ok',
        network: routing.network,
        queues: {
          oracle_request: Boolean(env.MORPHEUS_ORACLE_REQUEST_QUEUE),
          feed_tick: Boolean(env.MORPHEUS_FEED_TICK_QUEUE),
        },
        workflows: {
          callback_broadcast: isWorkflowBindingAvailable(env, 'CALLBACK_BROADCAST_WORKFLOW'),
          automation_execute: isWorkflowBindingAvailable(env, 'AUTOMATION_EXECUTE_WORKFLOW'),
        },
        delivery: {
          oracle_request: 'queue',
          feed_tick: 'queue',
          callback_broadcast: 'workflow',
          automation_execute: 'workflow',
        },
      });
    }

    if (routing.routePath === '/jobs/recover') {
      if (request.method !== 'POST') {
        return json(405, { error: 'method_not_allowed' });
      }
      try {
        const limit = resolveRequeueLimit(env);
        const staleProcessingMs = resolveStaleProcessingMs(env);
        const jobs = await listRecoverableJobs(env, routing.network, limit, staleProcessingMs);
        const requeued = [];
        const skipped = [];
        const failed = [];
        for (const job of jobs) {
          try {
            const outcome = await requeueJob(env, job);
            const entry = {
              id: job.id,
              route: job.route,
              previous_status: job.status,
              action: outcome?.action || 'queue_requeued',
              workflow_instance_id: outcome?.workflow_instance_id || null,
              workflow_status: outcome?.workflow_status || null,
            };
            if (entry.action === 'queue_requeued' || entry.action === 'workflow_redispatched') {
              requeued.push(entry);
            } else {
              skipped.push(entry);
            }
          } catch (error) {
            failed.push({
              id: job.id,
              route: job.route,
              previous_status: job.status,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
        return json(200, {
          network: routing.network,
          scanned: jobs.length,
          requeued_count: requeued.length,
          skipped_count: skipped.length,
          failed_count: failed.length,
          requeued,
          skipped,
          failed,
        });
      } catch (error) {
        return json(500, { error: error instanceof Error ? error.message : String(error) });
      }
    }

    const jobMatch = routing.routePath.match(/^\/jobs\/([0-9a-f-]+)$/i);
    if (request.method === 'GET' && jobMatch) {
      try {
        const job = await loadJob(env, jobMatch[1], routing.network);
        if (!job) return json(404, { error: 'job not found' });
        const jobConfig = JOB_ROUTE_CONFIG[job.route];
        if (
          job?.metadata?.workflow_instance_id &&
          isWorkflowRouteConfig(jobConfig)
        ) {
          try {
            const workflow = await loadWorkflowInstanceDetails(
              env,
              jobConfig,
              job.metadata.workflow_instance_id
            );
            return json(200, {
              ...job,
              workflow: {
                instance_id: workflow.id,
                status: workflow.details,
              },
            });
          } catch {
            // fall back to stored job only
          }
        }
        return json(200, job);
      } catch (error) {
        return json(500, { error: error instanceof Error ? error.message : String(error) });
      }
    }

    const jobConfig = JOB_ROUTE_CONFIG[routing.routePath];
    if (!jobConfig) {
      return json(404, { error: 'not found', path: routing.routePath });
    }
    if (request.method !== 'POST') {
      return json(405, { error: 'method_not_allowed' });
    }

    const rateLimited = await applyRateLimit(request, env, jobConfig.queue);
    if (rateLimited) return rateLimited;

    const rawBody = await request.text();
    let payload = {};
    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return json(400, { error: 'invalid JSON body' });
    }

    const metadata = resolveJobMetadata(routing.routePath, payload);
    const jobId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const baseRecord = {
      id: jobId,
      network: routing.network,
      queue: jobConfig.queue,
      route: routing.routePath,
      target_chain: metadata.target_chain,
      project_slug: metadata.project_slug,
      request_id: metadata.request_id,
      status: 'queued',
      dedupe_key: metadata.dedupe_key,
      payload,
      metadata: {
        ingress_route: url.pathname,
        source: 'cloudflare-control-plane',
        client_ip: getClientIp(request),
        delivery_mode: jobConfig.delivery || 'queue',
      },
      retry_count: 0,
      created_at: createdAt,
      updated_at: createdAt,
    };

    try {
      const inserted = await insertJob(env, baseRecord);
      let updated = inserted;
      if (isWorkflowRouteConfig(jobConfig)) {
        const workflow = await dispatchWorkflowInstance(env, inserted, jobConfig);
        updated =
          (await patchJob(env, jobId, routing.network, {
            status: 'dispatched',
            metadata: {
              ...(inserted.metadata || {}),
              workflow_name: workflow.workflow_name,
              workflow_binding: workflow.workflow_binding,
              workflow_instance_id: workflow.id,
              workflow_status: workflow.details || null,
              workflow_dispatch_count: workflow.workflow_dispatch_count,
            },
          }).catch(() => null)) || inserted;
      } else {
        await enqueueJob(env, jobConfig.binding, {
          job_id: jobId,
          network: routing.network,
          queue: jobConfig.queue,
          route: routing.routePath,
          payload,
          target_chain: metadata.target_chain,
          project_slug: metadata.project_slug,
          request_id: metadata.request_id,
          created_at: createdAt,
        });
        updated =
          (await patchJob(env, jobId, routing.network, {
            status: 'dispatched',
          }).catch(() => null)) || inserted;
      }
      return json(202, updated);
    } catch (error) {
      await patchJob(env, jobId, routing.network, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        completed_at: new Date().toISOString(),
      }).catch(() => null);
      return json(503, {
        error: error instanceof Error ? error.message : String(error),
        job_id: jobId,
      });
    }
  },

  async queue(batch, env) {
    for (const message of batch.messages) {
      if (batch.queue === 'morpheus-oracle-request') {
        await processExecutionJob(message, env);
        continue;
      }
      if (batch.queue === 'morpheus-feed-tick') {
        await processFeedTickJob(message, env);
        continue;
      }
      message.ack();
    }
  },
};
