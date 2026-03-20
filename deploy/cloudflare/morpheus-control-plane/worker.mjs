const JOB_ROUTE_CONFIG = {
  '/oracle/query': {
    queue: 'oracle_request',
    binding: 'MORPHEUS_ORACLE_REQUEST_QUEUE',
  },
  '/oracle/smart-fetch': {
    queue: 'oracle_request',
    binding: 'MORPHEUS_ORACLE_REQUEST_QUEUE',
  },
  '/compute/execute': {
    queue: 'oracle_request',
    binding: 'MORPHEUS_ORACLE_REQUEST_QUEUE',
  },
  '/neodid/bind': {
    queue: 'oracle_request',
    binding: 'MORPHEUS_ORACLE_REQUEST_QUEUE',
  },
  '/neodid/action-ticket': {
    queue: 'oracle_request',
    binding: 'MORPHEUS_ORACLE_REQUEST_QUEUE',
  },
  '/neodid/recovery-ticket': {
    queue: 'oracle_request',
    binding: 'MORPHEUS_ORACLE_REQUEST_QUEUE',
  },
  '/feeds/tick': {
    queue: 'feed_tick',
    binding: 'MORPHEUS_FEED_TICK_QUEUE',
  },
  '/callbacks/broadcast': {
    queue: 'callback_broadcast',
    binding: 'MORPHEUS_CALLBACK_BROADCAST_QUEUE',
  },
  '/automation/execute': {
    queue: 'automation_execute',
    binding: 'MORPHEUS_AUTOMATION_EXECUTE_QUEUE',
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

function validateAuth(request, env) {
  const configured = trimString(env.MORPHEUS_CONTROL_PLANE_API_KEY || env.MORPHEUS_OPERATOR_API_KEY);
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

async function enqueueJob(env, bindingName, message) {
  const binding = env[bindingName];
  if (!binding || typeof binding.send !== 'function') {
    throw new Error(`queue binding ${bindingName} is not configured`);
  }
  await binding.send(message);
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
  const timer = setTimeout(() => controller.abort(new Error(`request timed out after ${timeoutMs}ms`)), timeoutMs);
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
  for (const baseUrl of execution.baseUrls) {
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
  for (const baseUrl of execution.baseUrls) {
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
  const { response, body } = await fetchJsonWithTimeout(`${backend.baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload || {}),
  }, timeoutMs);
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

  await patchJob(env, jobId, network, {
    status: 'processing',
    retry_count: Math.max(Number(message.attempts || 1) - 1, 0),
    started_at: job.started_at || new Date().toISOString(),
    metadata: {
      ...(job.metadata || {}),
      queue_message_id: message.id,
      queue_attempts: Number(message.attempts || 1),
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
        metadata: {
          ...(job.metadata || {}),
          execution_status: result.status,
          execution_base_url: result.execution_base_url,
        },
      }).catch(() => null);
      message.ack();
      return;
    }

    await patchJob(env, jobId, network, {
      status: 'queued',
      result: null,
      error:
        trimString(result.body?.error || result.body?.message || '') ||
        `execution temporarily failed with status ${result.status}`,
      retry_count: Number(message.attempts || 1),
      run_after: new Date(Date.now() + 5000).toISOString(),
      metadata: {
        ...(job.metadata || {}),
        execution_status: result.status,
        execution_base_url: result.execution_base_url,
      },
    }).catch(() => null);
    message.retry({ delaySeconds: 5 });
  } catch (error) {
    await patchJob(env, jobId, network, {
      status: 'queued',
      result: null,
      error: error instanceof Error ? error.message : String(error),
      retry_count: Number(message.attempts || 1),
      run_after: new Date(Date.now() + 5_000).toISOString(),
      metadata: {
        ...(job.metadata || {}),
        last_queue_error: error instanceof Error ? error.message : String(error),
      },
    }).catch(() => null);
    message.retry({ delaySeconds: 5 });
  }
}

async function markUnsupportedQueueJob(message, env, queueName) {
  const body = message.body && typeof message.body === 'object' ? message.body : {};
  const jobId = trimString(body.job_id);
  const network = trimString(body.network) === 'mainnet' ? 'mainnet' : 'testnet';
  if (jobId) {
    await patchJob(env, jobId, network, {
      status: 'failed',
      error: `${queueName} consumer is not implemented yet`,
      completed_at: new Date().toISOString(),
    }).catch(() => null);
  }
  message.ack();
}

async function processAutomationExecuteJob(message, env) {
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
  await patchJob(env, jobId, network, {
    status: 'processing',
    retry_count: Math.max(Number(message.attempts || 1) - 1, 0),
    started_at: job.started_at || new Date().toISOString(),
  }).catch(() => null);

  const automationId = trimString(job.payload?.automation_id || job.payload?.id || '');
  if (!automationId) {
    await patchJob(env, jobId, network, {
      status: 'failed',
      error: 'automation_id is required',
      completed_at: new Date().toISOString(),
    }).catch(() => null);
    message.ack();
    return;
  }

  try {
    const signer = resolveNeoN3BackendSigner(env, network);
    const result = await callAppBackend(env, '/api/internal/control-plane/automation-execute', {
      automation_id: automationId,
      network,
      ...signer,
    });
    if (result.ok) {
      await patchJob(env, jobId, network, {
        status: 'succeeded',
        result: result.body,
        error: null,
        completed_at: new Date().toISOString(),
        metadata: {
          ...(job.metadata || {}),
          backend_status: result.status,
          backend_url: result.backend_url,
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
          `automation execution failed with status ${result.status}`,
        completed_at: new Date().toISOString(),
      }).catch(() => null);
      message.ack();
      return;
    }

    await patchJob(env, jobId, network, {
      status: 'queued',
      error:
        trimString(result.body?.error || result.body?.message || '') ||
        `automation execution temporarily failed with status ${result.status}`,
      retry_count: Number(message.attempts || 1),
      run_after: new Date(Date.now() + 5000).toISOString(),
    }).catch(() => null);
    message.retry({ delaySeconds: 5 });
  } catch (error) {
    await patchJob(env, jobId, network, {
      status: 'queued',
      error: error instanceof Error ? error.message : String(error),
      retry_count: Number(message.attempts || 1),
      run_after: new Date(Date.now() + 5000).toISOString(),
    }).catch(() => null);
    message.retry({ delaySeconds: 5 });
  }
}

async function processCallbackBroadcastJob(message, env) {
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
  await patchJob(env, jobId, network, {
    status: 'processing',
    retry_count: Math.max(Number(message.attempts || 1) - 1, 0),
    started_at: job.started_at || new Date().toISOString(),
  }).catch(() => null);

  try {
    const signer = resolveNeoN3BackendSigner(env, network);
    const result = await callAppBackend(
      env,
      '/api/internal/control-plane/callback-broadcast',
      {
        ...job.payload,
        network,
        ...signer,
      }
    );
    if (result.ok) {
      await patchJob(env, jobId, network, {
        status: 'succeeded',
        result: result.body,
        error: null,
        completed_at: new Date().toISOString(),
        metadata: {
          ...(job.metadata || {}),
          backend_status: result.status,
          backend_url: result.backend_url,
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
          `callback broadcast failed with status ${result.status}`,
        completed_at: new Date().toISOString(),
      }).catch(() => null);
      message.ack();
      return;
    }

    await patchJob(env, jobId, network, {
      status: 'queued',
      error:
        trimString(result.body?.error || result.body?.message || '') ||
        `callback broadcast temporarily failed with status ${result.status}`,
      retry_count: Number(message.attempts || 1),
      run_after: new Date(Date.now() + 5000).toISOString(),
    }).catch(() => null);
    message.retry({ delaySeconds: 5 });
  } catch (error) {
    await patchJob(env, jobId, network, {
      status: 'queued',
      error: error instanceof Error ? error.message : String(error),
      retry_count: Number(message.attempts || 1),
      run_after: new Date(Date.now() + 5000).toISOString(),
    }).catch(() => null);
    message.retry({ delaySeconds: 5 });
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
  await patchJob(env, jobId, network, {
    status: 'processing',
    retry_count: Math.max(Number(message.attempts || 1) - 1, 0),
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
        metadata: {
          ...(job.metadata || {}),
          execution_status: result.status,
          execution_base_url: result.execution_base_url,
        },
      }).catch(() => null);
      message.ack();
      return;
    }

    await patchJob(env, jobId, network, {
      status: 'queued',
      error:
        trimString(result.body?.error || result.body?.message || '') ||
        `feed tick temporarily failed with status ${result.status}`,
      retry_count: Number(message.attempts || 1),
      run_after: new Date(Date.now() + 5000).toISOString(),
      metadata: {
        ...(job.metadata || {}),
        execution_status: result.status,
        execution_base_url: result.execution_base_url,
      },
    }).catch(() => null);
    message.retry({ delaySeconds: 5 });
  } catch (error) {
    await patchJob(env, jobId, network, {
      status: 'queued',
      error: error instanceof Error ? error.message : String(error),
      retry_count: Number(message.attempts || 1),
      run_after: new Date(Date.now() + 5000).toISOString(),
      metadata: {
        ...(job.metadata || {}),
        last_queue_error: error instanceof Error ? error.message : String(error),
      },
    }).catch(() => null);
    message.retry({ delaySeconds: 5 });
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
          callback_broadcast: Boolean(env.MORPHEUS_CALLBACK_BROADCAST_QUEUE),
          automation_execute: Boolean(env.MORPHEUS_AUTOMATION_EXECUTE_QUEUE),
        },
      });
    }

    const jobMatch = routing.routePath.match(/^\/jobs\/([0-9a-f-]+)$/i);
    if (request.method === 'GET' && jobMatch) {
      try {
        const job = await loadJob(env, jobMatch[1], routing.network);
        if (!job) return json(404, { error: 'job not found' });
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
      },
      retry_count: 0,
      created_at: createdAt,
      updated_at: createdAt,
    };

    try {
      const inserted = await insertJob(env, baseRecord);
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
      const updated =
        (await patchJob(env, jobId, routing.network, {
          status: 'dispatched',
        }).catch(() => null)) || inserted;
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
      if (batch.queue === 'morpheus-callback-broadcast') {
        await processCallbackBroadcastJob(message, env);
        continue;
      }
      if (batch.queue === 'morpheus-automation-execute') {
        await processAutomationExecuteJob(message, env);
        continue;
      }
      message.ack();
    }
  },
};
