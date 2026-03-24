import test from 'node:test';
import assert from 'node:assert/strict';

import worker from './worker.mjs';

function createEnv(overrides = {}) {
  const oracleMessages = [];
  const feedMessages = [];
  const callbackMessages = [];
  const automationMessages = [];
  return {
    SUPABASE_URL: 'https://supabase.test',
    SUPABASE_SECRET_KEY: 'service-role-key',
    MORPHEUS_CONTROL_PLANE_API_KEY: 'control-plane-key',
    MORPHEUS_TESTNET_EXECUTION_BASE_URL: 'https://exec.test',
    MORPHEUS_APP_BACKEND_URL: 'https://app.test',
    MORPHEUS_EXECUTION_TOKEN: 'exec-token',
    MORPHEUS_APP_BACKEND_TOKEN: 'backend-token',
    MORPHEUS_TESTNET_RELAYER_NEO_N3_WIF: 'testnet-updater-wif',
    MORPHEUS_MAINNET_RELAYER_NEO_N3_WIF: 'mainnet-updater-wif',
    MORPHEUS_ORACLE_REQUEST_QUEUE: {
      sent: oracleMessages,
      async send(message) {
        oracleMessages.push(message);
      },
    },
    MORPHEUS_FEED_TICK_QUEUE: {
      sent: feedMessages,
      async send(message) {
        feedMessages.push(message);
      },
    },
    MORPHEUS_CALLBACK_BROADCAST_QUEUE: {
      sent: callbackMessages,
      async send(message) {
        callbackMessages.push(message);
      },
    },
    MORPHEUS_AUTOMATION_EXECUTE_QUEUE: {
      sent: automationMessages,
      async send(message) {
        automationMessages.push(message);
      },
    },
    ...overrides,
  };
}

function createState() {
  return {
    jobs: new Map(),
    executionCalls: [],
    backendCalls: [],
    executionResponses: [],
    backendResponses: [],
  };
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function parseRequestBody(init = {}) {
  if (!init.body) return null;
  return JSON.parse(String(init.body));
}

function createFetchMock(state) {
  return async (url, init = {}) => {
    const target = new URL(String(url));

    if (
      target.origin === 'https://supabase.test' &&
      target.pathname === '/rest/v1/morpheus_control_plane_jobs'
    ) {
      if (init.method === 'POST') {
        const record = parseRequestBody(init);
        state.jobs.set(record.id, { ...record });
        return jsonResponse(201, [record]);
      }

      const id = target.searchParams.get('id')?.replace(/^eq\./, '') || '';
      const network = target.searchParams.get('network')?.replace(/^eq\./, '') || '';
      if (init.method === 'PATCH') {
        const existing = state.jobs.get(id);
        if (!existing || (network && existing.network !== network)) {
          return jsonResponse(200, []);
        }
        const patch = parseRequestBody(init);
        const updated = { ...existing, ...patch };
        state.jobs.set(id, updated);
        return jsonResponse(200, [updated]);
      }

      if (!id) {
        let rows = [...state.jobs.values()];
        if (network) {
          rows = rows.filter((row) => row.network === network);
        }
        const statusIn = target.searchParams.get('status');
        if (statusIn?.startsWith('in.(') && statusIn.endsWith(')')) {
          const statuses = statusIn
            .slice(4, -1)
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean);
          rows = rows.filter((row) => statuses.includes(String(row.status || '')));
        }
        rows.sort((left, right) => String(left.created_at || '').localeCompare(String(right.created_at || '')));
        const limit = Number(target.searchParams.get('limit') || rows.length);
        return jsonResponse(200, rows.slice(0, limit));
      }

      const existing = state.jobs.get(id);
      if (!existing || (network && existing.network !== network)) {
        return jsonResponse(200, []);
      }

      return jsonResponse(200, [existing]);
    }

    if (target.origin.startsWith('https://exec')) {
      state.executionCalls.push({
        origin: target.origin,
        path: target.pathname,
        body: parseRequestBody(init),
        headers: Object.fromEntries(new Headers(init.headers || {}).entries()),
      });
      return state.executionResponses.shift() || jsonResponse(200, {
        ok: true,
        route: target.pathname,
        result: 'execution-ok',
      });
    }

    if (target.origin === 'https://app.test') {
      state.backendCalls.push({
        path: target.pathname,
        body: parseRequestBody(init),
        headers: Object.fromEntries(new Headers(init.headers || {}).entries()),
      });
      return state.backendResponses.shift() || jsonResponse(200, {
        ok: true,
        route: target.pathname,
      });
    }

    throw new Error(`unexpected fetch ${target}`);
  };
}

function createQueueMessage(body, attempts = 1) {
  return {
    id: 'msg-1',
    attempts,
    body,
    acked: false,
    retried: false,
    retryDelaySeconds: null,
    ack() {
      this.acked = true;
    },
    retry(options = {}) {
      this.retried = true;
      this.retryDelaySeconds = options.delaySeconds || null;
    },
  };
}

const originalFetch = global.fetch;

test.afterEach(() => {
  global.fetch = originalFetch;
});

test('control plane enqueues oracle request jobs and persists dispatched status', async () => {
  const env = createEnv();
  const state = createState();
  global.fetch = createFetchMock(state);

  const response = await worker.fetch(
    new Request('https://control-plane.test/testnet/oracle/query', {
      method: 'POST',
      headers: {
        authorization: 'Bearer control-plane-key',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        symbol: 'TWELVEDATA:NEO-USD',
        target_chain: 'neo_n3',
        dedupe_key: 'job-1',
      }),
    }),
    env
  );

  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.status, 'dispatched');
  assert.equal(body.queue, 'oracle_request');
  assert.equal(env.MORPHEUS_ORACLE_REQUEST_QUEUE.sent.length, 1);
  const enqueued = env.MORPHEUS_ORACLE_REQUEST_QUEUE.sent[0];
  assert.equal(enqueued.route, '/oracle/query');
  assert.equal(enqueued.network, 'testnet');
  assert.equal(state.jobs.get(body.id)?.status, 'dispatched');
});

test('oracle_request consumer forwards jobs to confidential execution plane', async () => {
  const env = createEnv();
  const state = createState();
  global.fetch = createFetchMock(state);

  state.jobs.set('job-oracle', {
    id: 'job-oracle',
    network: 'testnet',
    queue: 'oracle_request',
    route: '/oracle/query',
    status: 'dispatched',
    payload: {
      symbol: 'TWELVEDATA:NEO-USD',
      target_chain: 'neo_n3',
    },
    metadata: {},
  });

  const message = createQueueMessage({
    job_id: 'job-oracle',
    network: 'testnet',
    queue: 'oracle_request',
  });
  await worker.queue({ queue: 'morpheus-oracle-request', messages: [message] }, env);

  assert.equal(message.acked, true);
  assert.equal(state.executionCalls.length, 1);
  assert.equal(state.executionCalls[0].path, '/oracle/query');
  assert.equal(state.jobs.get('job-oracle')?.status, 'succeeded');
});

test('feed_tick consumer forwards jobs to confidential execution plane feed route', async () => {
  const env = createEnv();
  const state = createState();
  global.fetch = createFetchMock(state);

  state.jobs.set('job-feed', {
    id: 'job-feed',
    network: 'testnet',
    queue: 'feed_tick',
    route: '/feeds/tick',
    status: 'dispatched',
    payload: {
      target_chain: 'neo_n3',
      symbols: ['TWELVEDATA:NEO-USD'],
    },
    metadata: {},
  });

  const message = createQueueMessage({
    job_id: 'job-feed',
    network: 'testnet',
    queue: 'feed_tick',
  });
  await worker.queue({ queue: 'morpheus-feed-tick', messages: [message] }, env);

  assert.equal(message.acked, true);
  assert.equal(state.executionCalls.length, 1);
  assert.equal(state.executionCalls[0].path, '/oracle/feed');
  assert.equal(state.executionCalls[0].body.wif, 'testnet-updater-wif');
  assert.equal(state.jobs.get('job-feed')?.status, 'succeeded');
});

test('oracle_request consumer falls back to the next execution runtime when the first returns retryable status', async () => {
  const env = createEnv({
    MORPHEUS_TESTNET_EXECUTION_BASE_URL: 'https://exec-a.test,https://exec-b.test',
  });
  const state = createState();
  global.fetch = createFetchMock(state);

  state.executionResponses.push(
    jsonResponse(503, { error: 'runtime_unavailable' }),
    jsonResponse(200, { ok: true, route: '/oracle/query', result: 'execution-ok' }),
  );

  state.jobs.set('job-oracle-fallback', {
    id: 'job-oracle-fallback',
    network: 'testnet',
    queue: 'oracle_request',
    route: '/oracle/query',
    status: 'dispatched',
    payload: {
      request_id: 'pool-test-1',
      symbol: 'TWELVEDATA:NEO-USD',
      target_chain: 'neo_n3',
    },
    metadata: {},
  });

  const message = createQueueMessage({
    job_id: 'job-oracle-fallback',
    network: 'testnet',
    queue: 'oracle_request',
  });
  await worker.queue({ queue: 'morpheus-oracle-request', messages: [message] }, env);

  assert.equal(message.acked, true);
  assert.equal(state.executionCalls.length, 2);
  assert.notEqual(state.executionCalls[0].origin, state.executionCalls[1].origin);
  assert.equal(state.jobs.get('job-oracle-fallback')?.status, 'succeeded');
});

test('callback_broadcast consumer forwards jobs to app backend callback route', async () => {
  const env = createEnv();
  const state = createState();
  global.fetch = createFetchMock(state);

  state.jobs.set('job-callback', {
    id: 'job-callback',
    network: 'testnet',
    queue: 'callback_broadcast',
    route: '/callbacks/broadcast',
    status: 'dispatched',
    payload: {
      target_chain: 'neo_n3',
      request_id: '42',
      success: true,
      result: '{"ok":true}',
      verification_signature: 'abcd',
    },
    metadata: {},
  });

  const message = createQueueMessage({
    job_id: 'job-callback',
    network: 'testnet',
    queue: 'callback_broadcast',
  });
  await worker.queue({ queue: 'morpheus-callback-broadcast', messages: [message] }, env);

  assert.equal(message.acked, true);
  assert.equal(state.backendCalls.length, 1);
  assert.equal(state.backendCalls[0].path, '/api/internal/control-plane/callback-broadcast');
  assert.equal(state.backendCalls[0].body.wif, 'testnet-updater-wif');
  assert.equal(state.jobs.get('job-callback')?.status, 'succeeded');
});

test('automation_execute consumer forwards jobs to app backend automation route', async () => {
  const env = createEnv();
  const state = createState();
  global.fetch = createFetchMock(state);

  state.jobs.set('job-automation', {
    id: 'job-automation',
    network: 'testnet',
    queue: 'automation_execute',
    route: '/automation/execute',
    status: 'dispatched',
    payload: {
      automation_id: 'automation:neo_n3:test',
    },
    metadata: {},
  });

  const message = createQueueMessage({
    job_id: 'job-automation',
    network: 'testnet',
    queue: 'automation_execute',
  });
  await worker.queue({ queue: 'morpheus-automation-execute', messages: [message] }, env);

  assert.equal(message.acked, true);
  assert.equal(state.backendCalls.length, 1);
  assert.equal(state.backendCalls[0].path, '/api/internal/control-plane/automation-execute');
  assert.equal(state.backendCalls[0].body.wif, 'testnet-updater-wif');
  assert.equal(state.jobs.get('job-automation')?.status, 'succeeded');
});

test('jobs/recover requeues stale queued and processing jobs', async () => {
  const env = createEnv();
  const state = createState();
  global.fetch = createFetchMock(state);

  state.jobs.set('job-old-queued', {
    id: 'job-old-queued',
    network: 'testnet',
    queue: 'oracle_request',
    route: '/oracle/query',
    status: 'queued',
    payload: { symbol: 'TWELVEDATA:NEO-USD', target_chain: 'neo_n3' },
    metadata: {},
    created_at: '2026-03-22T11:00:00.000Z',
    updated_at: '2026-03-22T11:00:00.000Z',
    run_after: '2026-03-22T11:00:05.000Z',
  });
  state.jobs.set('job-stale-processing', {
    id: 'job-stale-processing',
    network: 'testnet',
    queue: 'feed_tick',
    route: '/feeds/tick',
    status: 'processing',
    payload: { target_chain: 'neo_n3', symbols: ['TWELVEDATA:NEO-USD'] },
    metadata: {},
    created_at: '2026-03-22T11:01:00.000Z',
    updated_at: '2026-03-22T11:01:00.000Z',
    started_at: '2026-03-22T11:01:00.000Z',
  });
  state.jobs.set('job-future', {
    id: 'job-future',
    network: 'testnet',
    queue: 'oracle_request',
    route: '/oracle/query',
    status: 'queued',
    payload: { symbol: 'TWELVEDATA:GAS-USD', target_chain: 'neo_n3' },
    metadata: {},
    created_at: '2099-03-22T11:02:00.000Z',
    updated_at: '2099-03-22T11:02:00.000Z',
    run_after: '2099-03-22T11:12:00.000Z',
  });

  const response = await worker.fetch(
    new Request('https://control-plane.test/testnet/jobs/recover', {
      method: 'POST',
      headers: { authorization: 'Bearer control-plane-key' },
    }),
    env
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.scanned, 2);
  assert.equal(body.requeued_count, 2);
  assert.equal(body.failed_count, 0);
  assert.equal(env.MORPHEUS_ORACLE_REQUEST_QUEUE.sent.length, 1);
  assert.equal(env.MORPHEUS_FEED_TICK_QUEUE.sent.length, 1);
  assert.equal(state.jobs.get('job-old-queued')?.status, 'dispatched');
  assert.equal(state.jobs.get('job-stale-processing')?.status, 'dispatched');
  assert.match(String(state.jobs.get('job-old-queued')?.metadata?.last_requeued_at || ''), /\d{4}-\d{2}-\d{2}T/);
  assert.equal(state.jobs.get('job-future')?.status, 'queued');
});

test('oracle_request consumer defers queued jobs until run_after', async () => {
  const env = createEnv();
  const state = createState();
  global.fetch = createFetchMock(state);

  state.jobs.set('job-deferred', {
    id: 'job-deferred',
    network: 'testnet',
    queue: 'oracle_request',
    route: '/oracle/query',
    status: 'queued',
    payload: {
      symbol: 'TWELVEDATA:NEO-USD',
      target_chain: 'neo_n3',
    },
    metadata: {},
    run_after: '2099-03-22T12:00:00.000Z',
  });

  const message = createQueueMessage({
    job_id: 'job-deferred',
    network: 'testnet',
    queue: 'oracle_request',
  });
  await worker.queue({ queue: 'morpheus-oracle-request', messages: [message] }, env);

  assert.equal(message.acked, false);
  assert.equal(message.retried, true);
  assert.ok((message.retryDelaySeconds || 0) >= 1);
  assert.equal(state.executionCalls.length, 0);
  assert.equal(state.jobs.get('job-deferred')?.status, 'queued');
});
