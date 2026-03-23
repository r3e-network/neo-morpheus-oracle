import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { wallet } from '@cityofzion/neon-js';

import {
  buildOnchainResultEnvelope,
  buildFulfillmentDigestBytes,
  buildWorkerPayload,
  decodePayloadText,
  encodeFulfillmentResult,
  isOperatorOnlyRequestType,
  normalizeRequestType,
  resolveWorkerRoute,
} from './src/router.js';
import { callPhala } from './src/phala.js';
import {
  guardQueuedAutomationExecution,
  isAutomationControlRequestType,
  processAutomationJobs,
} from './src/automation.js';
import {
  buildFeedSyncPayload,
  getRequestCursorFloor,
  getFeedSyncDelayMs,
  hydrateDurableQueue,
  persistFreshEventsToDurableQueue,
  pruneRetryQueueBelowRequestFloor,
  quarantineDurableBacklogBelowRequestFloor,
  resolveChainFromBlock,
  shouldRunFeedSync,
  shouldRunRequestProcessing,
} from './src/relayer.js';
import {
  buildEventKey,
  createEmptyRelayerState,
  getDueRetryItems,
  hasProcessedEvent,
  isEventQueuedForRetry,
  saveRelayerState,
  recordProcessedEvent,
  scheduleRetry,
  snapshotMetrics,
} from './src/state.js';
import {
  buildNeoN3RelayRequestId,
  decodeNeoItem,
  encodeUtf8ByteArrayParamValue,
  hasNeoN3RelayerConfig,
} from './src/neo-n3.js';
import { hasNeoXRelayerConfig } from './src/neo-x.js';
import { claimRelayerJob, sanitizeForPostgres } from './src/persistence.js';
import { createRelayerConfig } from './src/config.js';

const retryConfig = {
  maxRetries: 3,
  retryBaseDelayMs: 1000,
  retryMaxDelayMs: 10000,
  processedCacheSize: 100,
  deadLetterLimit: 10,
};

const ISOLATED_RELAYER_SIGNER_ENV_KEYS = [
  'MORPHEUS_ALLOW_UNPINNED_SIGNERS',
  'MORPHEUS_RELAYER_NEO_N3_WIF',
  'MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY',
  'MORPHEUS_UPDATER_NEO_N3_WIF',
  'MORPHEUS_UPDATER_NEO_N3_PRIVATE_KEY',
  'NEO_N3_WIF',
  'NEO_TESTNET_WIF',
  'PHALA_NEO_N3_WIF',
  'PHALA_NEO_N3_PRIVATE_KEY',
];

function withIsolatedRelayerSigner(run) {
  const previous = new Map();
  for (const key of ISOLATED_RELAYER_SIGNER_ENV_KEYS) {
    previous.set(key, process.env[key]);
  }

  const isolatedSigner = new wallet.Account(wallet.generatePrivateKey());
  process.env.MORPHEUS_ALLOW_UNPINNED_SIGNERS = 'true';
  process.env.MORPHEUS_RELAYER_NEO_N3_WIF = isolatedSigner.WIF;
  delete process.env.MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY;
  delete process.env.MORPHEUS_UPDATER_NEO_N3_WIF;
  delete process.env.MORPHEUS_UPDATER_NEO_N3_PRIVATE_KEY;
  delete process.env.NEO_N3_WIF;
  delete process.env.NEO_TESTNET_WIF;
  delete process.env.PHALA_NEO_N3_WIF;
  delete process.env.PHALA_NEO_N3_PRIVATE_KEY;

  try {
    return run();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('normalizeRequestType normalizes separators and casing', () => {
  assert.equal(normalizeRequestType('Privacy-Oracle'), 'privacy_oracle');
  assert.equal(normalizeRequestType('  ZKP Compute '), 'zkp_compute');
});

test('resolveWorkerRoute routes compute, feed, vrf, and oracle payloads', () => {
  assert.equal(resolveWorkerRoute('compute', {}), '/compute/execute');
  assert.equal(resolveWorkerRoute('datafeed', {}), '/oracle/feed');
  assert.equal(resolveWorkerRoute('rng', {}), '/vrf/random');
  assert.equal(resolveWorkerRoute('vrf', {}), '/vrf/random');
  assert.equal(resolveWorkerRoute('neodid_bind', {}), '/neodid/bind');
  assert.equal(resolveWorkerRoute('neodid_action_ticket', {}), '/neodid/action-ticket');
  assert.equal(resolveWorkerRoute('neodid_recovery_ticket', {}), '/neodid/recovery-ticket');
  assert.equal(resolveWorkerRoute('neodid_zklogin_ticket', {}), '/neodid/zklogin-ticket');
  assert.equal(
    resolveWorkerRoute('privacy_oracle', { script: 'function process(){}' }),
    '/oracle/smart-fetch'
  );
  assert.equal(resolveWorkerRoute('privacy_oracle', {}), '/oracle/smart-fetch');
});

test('isOperatorOnlyRequestType flags feed sync requests', () => {
  assert.equal(isOperatorOnlyRequestType('datafeed'), true);
  assert.equal(isOperatorOnlyRequestType('price-feed'), true);
  assert.equal(isOperatorOnlyRequestType('privacy_oracle'), false);
});

test('isAutomationControlRequestType detects automation registration flows', () => {
  assert.equal(isAutomationControlRequestType('automation_register'), true);
  assert.equal(isAutomationControlRequestType('automation-cancel'), true);
  assert.equal(isAutomationControlRequestType('privacy_oracle'), false);
});

test('callPhala rejects when the worker fetch never resolves', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = () => new Promise(() => {});

    await assert.rejects(
      callPhala(
        {
          phala: {
            apiUrl: 'https://worker.test',
            token: 'secret',
            timeoutMs: 25,
          },
        },
        '/oracle/query',
        { ping: true }
      ),
      /phala request timed out after 1000ms/
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test('callPhala rejects when the worker response body never resolves', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      text: () => new Promise(() => {}),
    });

    await assert.rejects(
      callPhala(
        {
          phala: {
            apiUrl: 'https://worker.test',
            token: 'secret',
            timeoutMs: 25,
          },
        },
        '/oracle/query',
        { ping: true }
      ),
      /phala request timed out after 1000ms/
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test('callPhala falls back to the next configured worker endpoint', async () => {
  const originalFetch = global.fetch;
  try {
    const calls = [];
    global.fetch = async (url) => {
      calls.push(String(url));
      if (String(url).startsWith('https://worker-a.test')) {
        throw new Error('fetch failed');
      }
      return new Response(JSON.stringify({ ok: true, route: 'fallback' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const response = await callPhala(
      {
        phala: {
          apiUrl: 'https://worker-a.test, https://worker-b.test',
          token: 'secret',
          timeoutMs: 1000,
        },
      },
      '/oracle/query',
      { ping: true }
    );

    assert.equal(response.ok, true);
    assert.equal(response.status, 200);
    assert.equal(response.body.route, 'fallback');
    assert.equal(response.api_url, 'https://worker-b.test');
    assert.deepEqual(calls, [
      'https://worker-a.test/oracle/query',
      'https://worker-b.test/oracle/query',
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});

test('guardQueuedAutomationExecution blocks cancelled queued automation requests', async () => {
  const patchedRuns = [];
  const result = await guardQueuedAutomationExecution(
    { txHash: '0xqueue' },
    {
      fetchAutomationRunByQueueTxHash: async (txHash) => ({
        automation_id: 'automation:neo_n3:test-cancelled',
        queue_tx: { tx_hash: txHash },
      }),
      fetchAutomationJobById: async () => ({
        automation_id: 'automation:neo_n3:test-cancelled',
        status: 'cancelled',
        chain: 'neo_n3',
      }),
      patchAutomationRunByQueueTxHash: async (txHash, fields) => {
        patchedRuns.push({ txHash, fields });
      },
    }
  );

  assert.equal(result.blocked, true);
  assert.equal(result.route, 'automation:cancelled-before-execution');
  assert.match(result.error, /automation cancelled before execution/i);
  assert.deepEqual(patchedRuns, [
    {
      txHash: '0xqueue',
      fields: {
        status: 'failed',
        error: 'automation cancelled before execution: automation:neo_n3:test-cancelled',
      },
    },
  ]);
});

test('guardQueuedAutomationExecution allows non-cancelled queued automation requests', async () => {
  const result = await guardQueuedAutomationExecution(
    { txHash: '0xqueue' },
    {
      fetchAutomationRunByQueueTxHash: async () => ({
        automation_id: 'automation:neo_n3:test-ok',
      }),
      fetchAutomationJobById: async () => ({
        automation_id: 'automation:neo_n3:test-ok',
        status: 'completed',
        chain: 'neo_n3',
      }),
      patchAutomationRunByQueueTxHash: async () => {
        throw new Error('should not patch run when not blocked');
      },
    }
  );

  assert.equal(result.blocked, false);
  assert.equal(result.automation_id, 'automation:neo_n3:test-ok');
  assert.equal(result.job.status, 'completed');
});

test('processAutomationJobs fail-closes automation jobs on request fee exhaustion', async () => {
  const patchedJobs = [];
  const insertedRuns = [];
  const result = await processAutomationJobs(
    {
      automation: {
        enabled: true,
        batchSize: 10,
        maxQueuedPerTick: 10,
        defaultPriceCooldownMs: 60000,
      },
    },
    { info() {}, warn() {} },
    {
      fetchActiveAutomationJobs: async () => [
        {
          automation_id: 'automation:neo_n3:exhausted',
          status: 'active',
          chain: 'neo_n3',
          requester: '0x0c3146e78efc42bfb7d4cc2e06e3efd063c01c56',
          callback_contract: '0x8c506f224d82e67200f20d9d5361f767f0756e3b',
          callback_method: 'onOracleResult',
          execution_request_type: 'privacy_oracle',
          execution_payload: { provider: 'twelvedata' },
          trigger_type: 'one_shot',
          trigger_config: { execute_at: new Date(0).toISOString() },
          next_run_at: new Date(0).toISOString(),
          execution_count: 0,
          max_executions: 1,
        },
      ],
      queueNeoN3AutomationRequest: async () => {
        throw new Error(
          'at instruction 2827 (ABORTMSG): ABORTMSG is executed. Reason: request fee not paid'
        );
      },
      patchAutomationJob: async (automationId, fields) => {
        patchedJobs.push({ automationId, fields });
      },
      insertAutomationRun: async (record) => {
        insertedRuns.push(record);
      },
    }
  );

  assert.deepEqual(result, { queued: 0, skipped: 0, failed: 1, inspected: 1 });
  assert.deepEqual(patchedJobs, [
    {
      automationId: 'automation:neo_n3:exhausted',
      fields: {
        status: 'error',
        next_run_at: null,
        last_error:
          'at instruction 2827 (ABORTMSG): ABORTMSG is executed. Reason: request fee not paid',
      },
    },
  ]);
  assert.equal(insertedRuns.length, 1);
  assert.equal(insertedRuns[0].status, 'failed');
  assert.match(insertedRuns[0].error, /request fee not paid/i);
});

test('processAutomationJobs preserves retry semantics for transient automation queue errors', async () => {
  const patchedJobs = [];
  const insertedRuns = [];
  const result = await processAutomationJobs(
    {
      automation: {
        enabled: true,
        batchSize: 10,
        maxQueuedPerTick: 10,
        defaultPriceCooldownMs: 60000,
      },
    },
    { info() {}, warn() {} },
    {
      fetchActiveAutomationJobs: async () => [
        {
          automation_id: 'automation:neo_n3:transient',
          status: 'active',
          chain: 'neo_n3',
          requester: '0x0c3146e78efc42bfb7d4cc2e06e3efd063c01c56',
          callback_contract: '0x8c506f224d82e67200f20d9d5361f767f0756e3b',
          callback_method: 'onOracleResult',
          execution_request_type: 'privacy_oracle',
          execution_payload: { provider: 'twelvedata' },
          trigger_type: 'one_shot',
          trigger_config: { execute_at: new Date(0).toISOString() },
          next_run_at: new Date(0).toISOString(),
          execution_count: 0,
          max_executions: 1,
        },
      ],
      queueNeoN3AutomationRequest: async () => {
        throw new Error('rpc timeout');
      },
      patchAutomationJob: async (automationId, fields) => {
        patchedJobs.push({ automationId, fields });
      },
      insertAutomationRun: async (record) => {
        insertedRuns.push(record);
      },
    }
  );

  assert.deepEqual(result, { queued: 0, skipped: 0, failed: 1, inspected: 1 });
  assert.deepEqual(patchedJobs, [
    {
      automationId: 'automation:neo_n3:transient',
      fields: {
        last_error: 'rpc timeout',
      },
    },
  ]);
  assert.equal(insertedRuns.length, 1);
  assert.equal(insertedRuns[0].status, 'failed');
  assert.equal(insertedRuns[0].error, 'rpc timeout');
});

test('decodePayloadText parses JSON and preserves raw strings', () => {
  assert.deepEqual(decodePayloadText('{"provider":"twelvedata"}'), { provider: 'twelvedata' });
  assert.deepEqual(decodePayloadText('not-json'), { raw_payload: 'not-json' });
});

test('buildWorkerPayload injects relayer metadata', () => {
  assert.deepEqual(
    buildWorkerPayload('neo_n3', 'privacy_oracle', { provider: 'twelvedata' }, 42, {
      requester: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      callbackContract: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      callbackMethod: 'onOracleResult',
    }),
    {
      provider: 'twelvedata',
      request_id: '42',
      request_source: 'morpheus-relayer:neo_n3',
      target_chain: 'neo_n3',
      requester: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      callback_contract: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      callback_method: 'onOracleResult',
    }
  );
});

test('buildFulfillmentDigestBytes binds the full callback context', () => {
  const baseline = buildFulfillmentDigestBytes('42', 'compute', true, '{"ok":true}', '');
  const changedResult = buildFulfillmentDigestBytes('42', 'compute', true, '{"ok":false}', '');
  const changedError = buildFulfillmentDigestBytes('42', 'compute', false, '', 'failed');
  const changedRequest = buildFulfillmentDigestBytes('43', 'compute', true, '{"ok":true}', '');

  assert.equal(Buffer.isBuffer(baseline), true);
  assert.equal(baseline.length, 32);
  assert.notDeepEqual(baseline, changedResult);
  assert.notDeepEqual(baseline, changedError);
  assert.notDeepEqual(baseline, changedRequest);
});

test('encodeFulfillmentResult returns success envelope for worker output', () => {
  const fulfilled = encodeFulfillmentResult('privacy_oracle', {
    ok: true,
    status: 200,
    body: {
      result: true,
      output_hash: 'abc',
      attestation_hash: 'abc',
      tee_attestation: { report_data: '0xabc' },
    },
  });
  assert.equal(fulfilled.success, true);
  assert.equal(typeof fulfilled.result, 'string');
  assert.equal(fulfilled.error, '');

  const parsed = JSON.parse(fulfilled.result);
  assert.equal(parsed.version, 'morpheus-result/v1');
  assert.equal(parsed.request_type, 'privacy_oracle');
  assert.equal(parsed.result.result, true);
  assert.equal(parsed.verification.output_hash, 'abc');
  assert.equal(parsed.verification.tee_attestation.quote_hash, null);

  const failed = encodeFulfillmentResult('compute', {
    ok: false,
    status: 400,
    body: { error: 'bad request' },
  });
  assert.equal(failed.success, false);
  assert.equal(failed.result, '');
  assert.equal(failed.error, 'bad request');
});

test('encodeFulfillmentResult emits compact bytes for neodid recovery ticket callbacks when requested', () => {
  const fulfilled = encodeFulfillmentResult('neodid_recovery_ticket', {
    ok: true,
    status: 200,
    body: {
      callback_encoding: 'neo_n3_recovery_v1',
      new_owner: '0x89b05cac00804648c666b47ecb1c57bc185821b7',
      recovery_nonce: '7',
      expires_at: '1735689600',
      action_id: 'aa_recovery:demo:7',
      master_nullifier: '0x1111111111111111111111111111111111111111111111111111111111111111',
      action_nullifier: '0x2222222222222222222222222222222222222222222222222222222222222222',
      signature: '33'.repeat(64),
    },
  });

  assert.equal(fulfilled.success, true);
  assert.equal(fulfilled.result, '');
  assert.equal(typeof fulfilled.result_bytes_base64, 'string');
  assert.ok(Buffer.from(fulfilled.result_bytes_base64, 'base64').length > 100);
});

test('encodeFulfillmentResult emits raw randomness bytes for rng callbacks', () => {
  const fulfilled = encodeFulfillmentResult('rng', {
    ok: true,
    status: 200,
    body: {
      randomness: '11'.repeat(32),
    },
  });

  assert.equal(fulfilled.success, true);
  assert.equal(fulfilled.result, '');
  assert.equal(fulfilled.error, '');
  assert.equal(
    Buffer.from(fulfilled.result_bytes_base64, 'base64').toString('hex'),
    '11'.repeat(32)
  );
});

test('buildFulfillmentDigestBytes can bind raw callback bytes instead of utf8 JSON', () => {
  const raw = Buffer.from('01020304', 'hex').toString('base64');
  const baseline = buildFulfillmentDigestBytes('42', 'neodid_recovery_ticket', true, '', '', raw);
  const changed = buildFulfillmentDigestBytes(
    '42',
    'neodid_recovery_ticket',
    true,
    '',
    '',
    Buffer.from('05060708', 'hex').toString('base64')
  );

  assert.equal(Buffer.isBuffer(baseline), true);
  assert.equal(baseline.length, 32);
  assert.notDeepEqual(baseline, changed);
});

test('buildOnchainResultEnvelope normalizes verification metadata', () => {
  const envelope = buildOnchainResultEnvelope('vrf', {
    ok: true,
    status: 200,
    body: {
      randomness: '1234',
      verification: {
        output_hash: 'deadbeef',
        attestation_hash: 'deadbeef',
        tee_attestation: { report_data: '0xdeadbeef', quote: '0x1234', event_log: 'demo-log' },
      },
    },
  });

  assert.equal(envelope.version, 'morpheus-result/v1');
  assert.equal(envelope.request_type, 'vrf');
  assert.equal(envelope.result.randomness, '1234');
  assert.equal(envelope.verification.output_hash, 'deadbeef');
  assert.equal(typeof envelope.verification.tee_attestation.quote_hash, 'string');
  assert.equal(typeof envelope.verification.tee_attestation.event_log_hash, 'string');
});

test('buildOnchainResultEnvelope preserves neodid recovery ticket fields', () => {
  const envelope = buildOnchainResultEnvelope('neodid_recovery_ticket', {
    ok: true,
    status: 200,
    body: {
      mode: 'neodid_recovery_ticket',
      aa_contract: '0x017520f068fd602082fe5572596185e62a4ad991',
      account_id: 'aa-test-01',
      new_owner: '0x89b05cac00804648c666b47ecb1c57bc185821b7',
      recovery_nonce: '7',
      expires_at: '1735689600',
      action_id: 'aa_recovery:neo_n3:oracle:aa-test-01:new:7',
      master_nullifier: '0x1111111111111111111111111111111111111111111111111111111111111111',
      action_nullifier: '0x2222222222222222222222222222222222222222222222222222222222222222',
      digest: '0x3333333333333333333333333333333333333333333333333333333333333333',
      verification: {
        output_hash: 'deadbeef',
        attestation_hash: 'deadbeef',
      },
    },
  });

  assert.equal(envelope.request_type, 'neodid_recovery_ticket');
  assert.equal(envelope.result.account_id, 'aa-test-01');
  assert.equal(envelope.result.new_owner, '0x89b05cac00804648c666b47ecb1c57bc185821b7');
  assert.equal(
    envelope.result.action_nullifier,
    '0x2222222222222222222222222222222222222222222222222222222222222222'
  );
});

test('buildOnchainResultEnvelope compacts oversized privacy oracle payloads', () => {
  const envelope = buildOnchainResultEnvelope('privacy_oracle', {
    ok: true,
    status: 200,
    body: {
      mode: 'fetch',
      target_chain: 'neo_n3',
      result: { huge: 'x'.repeat(5000) },
      extracted_value: '42',
      verification: {
        output_hash: 'deadbeef',
        attestation_hash: 'beadfeed',
        tee_attestation: {
          app_id: 'app',
          compose_hash: 'hash',
          report_data: 'rd',
          quote: 'q'.repeat(5000),
          event_log: 'e'.repeat(5000),
        },
      },
    },
  });

  const encoded = JSON.stringify(envelope);
  assert.ok(encoded.length < 900);
  assert.equal(envelope.result.result, '42');
  assert.equal(envelope.result.result_source, 'extracted_value');
  assert.equal(typeof envelope.verification.tee_attestation.quote_hash, 'string');
});

test('state tracks processed events and metrics snapshot', () => {
  const state = createEmptyRelayerState();
  const event = {
    chain: 'neo_n3',
    requestId: '7',
    txHash: '0xabc',
    logIndex: 0,
    blockNumber: 12,
    requestType: 'privacy_oracle',
  };
  recordProcessedEvent(state, 'neo_n3', event, 'fulfilled', { attempts: 1 }, retryConfig);
  assert.equal(hasProcessedEvent(state, 'neo_n3', event), true);
  const metrics = snapshotMetrics(state);
  assert.equal(metrics.retry_queue_sizes.neo_n3, 0);
  assert.equal(metrics.checkpoints.neo_n3, null);
  assert.ok(buildEventKey(event).includes('neo_n3:7:0xabc'));
});

test('state schedules retries and marks queued items due', () => {
  const state = createEmptyRelayerState();
  const event = {
    chain: 'neo_x',
    requestId: '9',
    txHash: '0xdef',
    logIndex: 3,
    blockNumber: 22,
    requestType: 'compute',
  };
  const scheduled = scheduleRetry(state, 'neo_x', event, 'temporary failure', retryConfig);
  assert.equal(scheduled.status, 'scheduled');
  assert.equal(isEventQueuedForRetry(state, 'neo_x', event), true);

  state.neo_x.retry_queue[0].next_retry_at = Date.now() - 1;
  const due = getDueRetryItems(state, 'neo_x');
  assert.equal(due.length, 1);
  assert.equal(due[0].key, buildEventKey(event));
});

test('state exhausts retries after max attempts', () => {
  const state = createEmptyRelayerState();
  const event = {
    chain: 'neo_n3',
    requestId: '11',
    txHash: '0x123',
    logIndex: 0,
    blockNumber: 30,
    requestType: 'datafeed',
  };
  assert.equal(scheduleRetry(state, 'neo_n3', event, 'fail-1', retryConfig).status, 'scheduled');
  assert.equal(scheduleRetry(state, 'neo_n3', event, 'fail-2', retryConfig).status, 'scheduled');
  assert.equal(scheduleRetry(state, 'neo_n3', event, 'fail-3', retryConfig).status, 'scheduled');
  const exhausted = scheduleRetry(state, 'neo_n3', event, 'fail-4', retryConfig);
  assert.equal(exhausted.status, 'exhausted');
});

test('saveRelayerState creates parent directories', () => {
  const state = createEmptyRelayerState();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'morpheus-relayer-state-'));
  const target = path.join(root, 'nested', '.morpheus-relayer-state.json');
  saveRelayerState(target, state);
  assert.equal(fs.existsSync(target), true);
});

test('relayer config accepts derived-key mode for Neo N3 and Neo X', () => {
  const previous = process.env.PHALA_USE_DERIVED_KEYS;
  process.env.PHALA_USE_DERIVED_KEYS = 'true';

  const config = {
    neo_n3: {
      rpcUrl: 'https://neo.test',
      oracleContract: '0xabc',
      updaterWif: '',
      updaterPrivateKey: '',
    },
    neo_x: { rpcUrl: 'https://neox.test', oracleContract: '0xdef', updaterPrivateKey: '' },
  };

  assert.equal(hasNeoN3RelayerConfig(config), true);
  assert.equal(hasNeoXRelayerConfig(config), true);

  process.env.PHALA_USE_DERIVED_KEYS = previous;
});

test('createRelayerConfig exposes request cursor start ids', () => {
  const previousNetwork = process.env.MORPHEUS_NETWORK;
  const previousNeoN3 = process.env.MORPHEUS_RELAYER_NEO_N3_START_REQUEST_ID;
  const previousNeoX = process.env.MORPHEUS_RELAYER_NEO_X_START_REQUEST_ID;

  process.env.MORPHEUS_NETWORK = 'testnet';
  process.env.MORPHEUS_RELAYER_NEO_N3_START_REQUEST_ID = '150';
  process.env.MORPHEUS_RELAYER_NEO_X_START_REQUEST_ID = '77';

  try {
    const config = withIsolatedRelayerSigner(() => createRelayerConfig());
    assert.equal(config.startRequestIds.neo_n3, 150);
    assert.equal(config.startRequestIds.neo_x, 77);
  } finally {
    if (previousNetwork === undefined) delete process.env.MORPHEUS_NETWORK;
    else process.env.MORPHEUS_NETWORK = previousNetwork;

    if (previousNeoN3 === undefined) delete process.env.MORPHEUS_RELAYER_NEO_N3_START_REQUEST_ID;
    else process.env.MORPHEUS_RELAYER_NEO_N3_START_REQUEST_ID = previousNeoN3;

    if (previousNeoX === undefined) delete process.env.MORPHEUS_RELAYER_NEO_X_START_REQUEST_ID;
    else process.env.MORPHEUS_RELAYER_NEO_X_START_REQUEST_ID = previousNeoX;
  }
});

test('createRelayerConfig defaults active chains to neo_n3 only', () => {
  const previous = process.env.MORPHEUS_ACTIVE_CHAINS;
  delete process.env.MORPHEUS_ACTIVE_CHAINS;

  try {
    const config = withIsolatedRelayerSigner(() => createRelayerConfig());
    assert.deepEqual(config.activeChains, ['neo_n3']);
  } finally {
    if (previous === undefined) delete process.env.MORPHEUS_ACTIVE_CHAINS;
    else process.env.MORPHEUS_ACTIVE_CHAINS = previous;
  }
});

test('createRelayerConfig enables durable queue by default when Supabase is configured', () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const previousFlag = process.env.MORPHEUS_DURABLE_QUEUE_ENABLED;
  const previousFailClosed = process.env.MORPHEUS_DURABLE_QUEUE_FAIL_CLOSED;

  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  delete process.env.MORPHEUS_DURABLE_QUEUE_ENABLED;
  delete process.env.MORPHEUS_DURABLE_QUEUE_FAIL_CLOSED;

  try {
    const config = withIsolatedRelayerSigner(() => createRelayerConfig());
    assert.equal(config.durableQueue.enabled, true);
    assert.equal(config.durableQueue.failClosed, true);
  } finally {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    if (previousFlag === undefined) delete process.env.MORPHEUS_DURABLE_QUEUE_ENABLED;
    else process.env.MORPHEUS_DURABLE_QUEUE_ENABLED = previousFlag;
    if (previousFailClosed === undefined) delete process.env.MORPHEUS_DURABLE_QUEUE_FAIL_CLOSED;
    else process.env.MORPHEUS_DURABLE_QUEUE_FAIL_CLOSED = previousFailClosed;
  }
});

test('createRelayerConfig supports feed_only mode with isolated default state file', () => {
  const previousMode = process.env.MORPHEUS_RELAYER_MODE;
  const previousStateFile = process.env.MORPHEUS_RELAYER_STATE_FILE;
  delete process.env.MORPHEUS_RELAYER_STATE_FILE;
  process.env.MORPHEUS_RELAYER_MODE = 'feed_only';

  try {
    const config = withIsolatedRelayerSigner(() => createRelayerConfig());
    assert.equal(config.mode, 'feed_only');
    assert.match(config.stateFile, /\.morpheus-relayer-state\.feed_only\.json$/);
  } finally {
    if (previousMode === undefined) delete process.env.MORPHEUS_RELAYER_MODE;
    else process.env.MORPHEUS_RELAYER_MODE = previousMode;
    if (previousStateFile === undefined) delete process.env.MORPHEUS_RELAYER_STATE_FILE;
    else process.env.MORPHEUS_RELAYER_STATE_FILE = previousStateFile;
  }
});

test('createRelayerConfig exposes dedicated feed sync timeout', () => {
  const previous = process.env.MORPHEUS_FEED_SYNC_TIMEOUT_MS;
  process.env.MORPHEUS_FEED_SYNC_TIMEOUT_MS = '90000';
  try {
    const config = withIsolatedRelayerSigner(() => createRelayerConfig());
    assert.equal(config.feedSync.timeoutMs, 90000);
  } finally {
    if (previous === undefined) delete process.env.MORPHEUS_FEED_SYNC_TIMEOUT_MS;
    else process.env.MORPHEUS_FEED_SYNC_TIMEOUT_MS = previous;
  }
});

test('createRelayerConfig appends public runtime fallbacks after explicit runtime urls', () => {
  const previousNetwork = process.env.MORPHEUS_NETWORK;
  const previousApiUrl = process.env.PHALA_API_URL;
  const previousRuntimeUrl = process.env.MORPHEUS_RUNTIME_URL;

  process.env.MORPHEUS_NETWORK = 'testnet';
  process.env.PHALA_API_URL = 'http://phala-worker:8080';
  delete process.env.MORPHEUS_RUNTIME_URL;

  try {
    const config = withIsolatedRelayerSigner(() => createRelayerConfig());
    assert.match(config.phala.apiUrl, /^http:\/\/phala-worker:8080,/);
    assert.match(config.phala.apiUrl, /https:\/\/morpheus-testnet\.meshmini\.app/);
    assert.match(config.phala.apiUrl, /https:\/\/edge\.meshmini\.app\/testnet/);
  } finally {
    if (previousNetwork === undefined) delete process.env.MORPHEUS_NETWORK;
    else process.env.MORPHEUS_NETWORK = previousNetwork;
    if (previousApiUrl === undefined) delete process.env.PHALA_API_URL;
    else process.env.PHALA_API_URL = previousApiUrl;
    if (previousRuntimeUrl === undefined) delete process.env.MORPHEUS_RUNTIME_URL;
    else process.env.MORPHEUS_RUNTIME_URL = previousRuntimeUrl;
  }
});

test('buildFeedSyncPayload forwards target-chain signer material to the worker runtime', () => {
  const config = {
    feedSync: {
      symbols: ['NEO-USD'],
      projectSlug: 'feeds_price',
      changeThresholdBps: 50,
      minUpdateIntervalMs: 30000,
      provider: 'twelvedata',
    },
    neo_n3: {
      updaterWif: 'KzjaqMvqzF1uup6KrTKRxTgjcXE7PbKLRH84e6ckyXDt3fu7afUb',
      updaterPrivateKey: '',
    },
    neo_x: {
      updaterPrivateKey: '0x59c6995e998f97a5a0044976f5d7d28f6af5b8b4f3d8f93f2af6d0a2b03f1abb',
    },
  };

  const neoN3Payload = buildFeedSyncPayload(config, 'neo_n3');
  assert.equal(neoN3Payload.target_chain, 'neo_n3');
  assert.equal(neoN3Payload.provider, 'twelvedata');
  assert.equal(neoN3Payload.wif, config.neo_n3.updaterWif);
  assert.equal('private_key' in neoN3Payload, false);

  const neoXPayload = buildFeedSyncPayload(config, 'neo_x');
  assert.equal(neoXPayload.target_chain, 'neo_x');
  assert.equal(neoXPayload.private_key, config.neo_x.updaterPrivateKey);
});

test('encodeUtf8ByteArrayParamValue encodes JSON payloads as base64 utf8', () => {
  const encoded = encodeUtf8ByteArrayParamValue('{"ok":true}');
  assert.equal(Buffer.from(encoded, 'base64').toString('utf8'), '{"ok":true}');
});

test('decodeNeoItem converts 20-byte base64 notifications into hash160', () => {
  const littleEndianHashBytes = Buffer.from(
    '6d0656f6dd91469db1c90cc1e574380613f43738',
    'hex'
  ).reverse();
  const decoded = decodeNeoItem({
    type: 'ByteString',
    value: littleEndianHashBytes.toString('base64'),
  });
  assert.equal(decoded, '0x6d0656f6dd91469db1c90cc1e574380613f43738');
});

test('buildNeoN3RelayRequestId keeps the chain request id while making relay attempts unique', () => {
  const a = buildNeoN3RelayRequestId('fulfill', '3836');
  const b = buildNeoN3RelayRequestId('fulfill', '3836');
  assert.match(a, /^relayer:n3:fulfill:3836:/);
  assert.match(b, /^relayer:n3:fulfill:3836:/);
  assert.notEqual(a, b);
});

test('decodeNeoItem keeps printable 20-byte byte strings as text', () => {
  const decoded = decodeNeoItem({
    type: 'ByteString',
    value: Buffer.from('neodid_action_ticket', 'utf8').toString('base64'),
  });
  assert.equal(decoded, 'neodid_action_ticket');
});

test('decodeNeoItem decodes Neo VM structs recursively', () => {
  const decoded = decodeNeoItem({
    type: 'Struct',
    value: [
      { type: 'Integer', value: '150' },
      { type: 'ByteString', value: Buffer.from('compute', 'utf8').toString('base64') },
      { type: 'Boolean', value: true },
    ],
  });

  assert.deepEqual(decoded, ['150', 'compute', true]);
});

test('buildOnchainResultEnvelope keeps working when verification is missing', () => {
  const envelope = buildOnchainResultEnvelope('privacy_oracle', {
    ok: true,
    status: 200,
    body: { result: { ok: true } },
  });
  assert.equal(envelope.version, 'morpheus-result/v1');
  assert.equal(envelope.verification, null);
});

test('buildOnchainResultEnvelope keeps automation registration metadata', () => {
  const envelope = buildOnchainResultEnvelope('automation_register', {
    ok: true,
    status: 200,
    body: {
      mode: 'automation',
      action: 'register',
      automation_id: 'automation:neo_x:test',
      trigger_type: 'interval',
      execution_request_type: 'privacy_oracle',
      status: 'active',
    },
  });
  assert.equal(envelope.result.mode, 'automation');
  assert.equal(envelope.result.action, 'register');
  assert.equal(envelope.result.automation_id, 'automation:neo_x:test');
});

test('sanitizeForPostgres strips NUL bytes recursively', () => {
  const sanitized = sanitizeForPostgres({
    text: 'ab\u0000cd',
    nested: {
      value: '\u0000hello',
      items: ['x\u0000y', 42, { inner: 'z\u0000' }],
    },
  });

  assert.deepEqual(sanitized, {
    text: 'abcd',
    nested: {
      value: 'hello',
      items: ['xy', 42, { inner: 'z' }],
    },
  });
});

test('resolveChainFromBlock resets checkpoints ahead of the confirmed tip', () => {
  const state = createEmptyRelayerState();
  state.neo_n3.last_block = 14258261;

  const config = {
    startBlocks: { neo_n3: 8996388, neo_x: null },
  };

  const fromBlock = resolveChainFromBlock(config, state, 'neo_n3', 8996666, null);
  assert.equal(fromBlock, 8996388);
  assert.equal(state.neo_n3.last_block, null);
});

test('resolveChainFromBlock advances from a valid checkpoint', () => {
  const state = createEmptyRelayerState();
  state.neo_n3.last_block = 8996666;

  const config = {
    startBlocks: { neo_n3: 8996388, neo_x: null },
  };

  const fromBlock = resolveChainFromBlock(config, state, 'neo_n3', 8997000, null);
  assert.equal(fromBlock, 8996667);
  assert.equal(state.neo_n3.last_block, 8996666);
});

test('getFeedSyncDelayMs uses the last feed-sync start time', () => {
  const config = {
    feedSync: {
      enabled: true,
      intervalMs: 60000,
    },
  };
  const state = createEmptyRelayerState();
  state.metrics.last_feed_sync_success_at = '2026-03-10T13:00:05.000Z';

  assert.equal(getFeedSyncDelayMs(config, state, Date.parse('2026-03-10T13:00:10.000Z')), 55000);
  assert.equal(getFeedSyncDelayMs(config, state, Date.parse('2026-03-10T13:01:01.000Z')), 4000);
});

test('durable queue persists fresh chain events before checkpoint advancement', async () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalFetch = global.fetch;
  const inserted = [];

  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  global.fetch = async (url, options = {}) => {
    assert.match(String(url), /morpheus_relayer_jobs/);
    assert.equal(options.method, 'POST');
    inserted.push(JSON.parse(String(options.body)));
    return new Response('', { status: 201 });
  };

  try {
    await persistFreshEventsToDurableQueue(
      {
        network: 'testnet',
        concurrency: 2,
        durableQueue: { enabled: true, failClosed: true },
      },
      { warn() {}, info() {} },
      'neo_n3',
      [
        { chain: 'neo_n3', requestId: '101', requestType: 'privacy_oracle', txHash: '0xaaa' },
        { chain: 'neo_n3', requestId: '102', requestType: 'privacy_oracle', txHash: '0xbbb' },
      ]
    );
  } finally {
    global.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }

  assert.equal(inserted.length, 2);
  assert.equal(inserted[0].status, 'queued');
  assert.equal(inserted[1].status, 'queued');
  assert.equal(inserted[0].request_id, '101');
  assert.equal(inserted[1].request_id, '102');
});

test('durable queue hydrates queued and stale processing jobs back into retry queue', async () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalFetch = global.fetch;
  const state = createEmptyRelayerState();
  let persisted = 0;

  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  global.fetch = async (url) => {
    assert.match(String(url), /morpheus_relayer_jobs/);
    return new Response(
      JSON.stringify([
        {
          event_key: 'neo_n3:101:0xaaa::',
          chain: 'neo_n3',
          request_id: '101',
          status: 'queued',
          attempts: 0,
          event: {
            chain: 'neo_n3',
            requestId: '101',
            requestType: 'privacy_oracle',
            txHash: '0xaaa',
          },
          updated_at: new Date(Date.now() - 10_000).toISOString(),
        },
        {
          event_key: 'neo_n3:102:0xbbb::',
          chain: 'neo_n3',
          request_id: '102',
          status: 'processing',
          attempts: 2,
          last_error: 'worker timeout',
          event: {
            chain: 'neo_n3',
            requestId: '102',
            requestType: 'privacy_oracle',
            txHash: '0xbbb',
          },
          updated_at: new Date(Date.now() - 10_000).toISOString(),
        },
        {
          event_key: 'neo_n3:103:0xccc::',
          chain: 'neo_n3',
          request_id: '103',
          status: 'retry_scheduled',
          attempts: 1,
          next_retry_at: new Date(Date.now() + 60_000).toISOString(),
          event: {
            chain: 'neo_n3',
            requestId: '103',
            requestType: 'privacy_oracle',
            txHash: '0xccc',
          },
          updated_at: new Date().toISOString(),
        },
      ]),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  };

  try {
    const hydrated = await hydrateDurableQueue(
      {
        concurrency: 1,
        durableQueue: {
          enabled: true,
          failClosed: true,
          syncLimit: 10,
          staleProcessingMs: 1000,
        },
      },
      state,
      { warn() {}, info() {} },
      'neo_n3',
      () => {
        persisted += 1;
      }
    );
    assert.deepEqual(hydrated.sort(), ['neo_n3:101:0xaaa::', 'neo_n3:102:0xbbb::']);
  } finally {
    global.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }

  assert.equal(state.neo_n3.retry_queue.length, 2);
  assert.ok(state.neo_n3.retry_queue.some((item) => String(item.event.requestId) === '101'));
  assert.ok(state.neo_n3.retry_queue.some((item) => String(item.event.requestId) === '102'));
  assert.equal(persisted, 1);
});

test('durable queue ignores jobs older than configured request cursor floor', async () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalFetch = global.fetch;
  const state = createEmptyRelayerState();

  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  global.fetch = async () =>
    new Response(
      JSON.stringify([
        {
          event_key: 'neo_n3:3999:0xaaa::',
          chain: 'neo_n3',
          request_id: '3999',
          status: 'queued',
          attempts: 0,
          event: {
            chain: 'neo_n3',
            requestId: '3999',
            requestType: 'privacy_oracle',
            txHash: '0xaaa',
          },
          updated_at: new Date().toISOString(),
        },
        {
          event_key: 'neo_n3:4050:0xbbb::',
          chain: 'neo_n3',
          request_id: '4050',
          status: 'queued',
          attempts: 0,
          event: {
            chain: 'neo_n3',
            requestId: '4050',
            requestType: 'privacy_oracle',
            txHash: '0xbbb',
          },
          updated_at: new Date().toISOString(),
        },
      ]),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );

  try {
    const hydrated = await hydrateDurableQueue(
      {
        startRequestIds: { neo_n3: 4050 },
        durableQueue: { enabled: true, failClosed: true, syncLimit: 10, staleProcessingMs: 1000 },
      },
      state,
      { warn() {}, info() {} },
      'neo_n3',
      () => {}
    );
    assert.deepEqual(hydrated, ['neo_n3:4050:0xbbb::']);
  } finally {
    global.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }

  assert.equal(state.neo_n3.retry_queue.length, 1);
  assert.equal(String(state.neo_n3.retry_queue[0].event.requestId), '4050');
});

test('request cursor floor prunes legacy local retry queue entries', () => {
  const state = createEmptyRelayerState();

  state.neo_n3.retry_queue.push(
    {
      key: 'neo_n3:3999:0xaaa::',
      event: { chain: 'neo_n3', requestId: '3999', requestType: 'privacy_oracle', txHash: '0xaaa' },
      attempts: 1,
      next_retry_at: Date.now(),
    },
    {
      key: 'neo_n3:4050:0xbbb::',
      event: { chain: 'neo_n3', requestId: '4050', requestType: 'privacy_oracle', txHash: '0xbbb' },
      attempts: 1,
      next_retry_at: Date.now(),
    }
  );

  const floor = getRequestCursorFloor({ startRequestIds: { neo_n3: 4050 } }, 'neo_n3');
  const pruned = pruneRetryQueueBelowRequestFloor(state, 'neo_n3', floor);
  assert.equal(pruned, 1);
  assert.equal(state.neo_n3.retry_queue.length, 1);
  assert.equal(String(state.neo_n3.retry_queue[0].event.requestId), '4050');
});

test('request cursor floor quarantines durable jobs below the floor', async () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalFetch = global.fetch;
  const calls = [];

  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  global.fetch = async (url, options = {}) => {
    const value = String(url);
    if (!options.method || options.method === 'GET') {
      return new Response(
        JSON.stringify([
          {
            event_key: 'neo_n3:3999:0xaaa::',
            request_id: '3999',
            status: 'retry_scheduled',
            last_error: 'legacy',
            chain: 'neo_n3',
          },
          {
            event_key: 'neo_n3:4050:0xbbb::',
            request_id: '4050',
            status: 'retry_scheduled',
            last_error: 'current',
            chain: 'neo_n3',
          },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    calls.push({ url: value, body: JSON.parse(String(options.body || '{}')) });
    return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const patched = await quarantineDurableBacklogBelowRequestFloor(
      {
        network: 'testnet',
        startRequestIds: { neo_n3: 4050 },
        durableQueue: { enabled: true, failClosed: true },
      },
      { warn() {}, info() {} },
      'neo_n3'
    );
    assert.equal(patched, 1);
  } finally {
    global.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.status, 'stale_quarantined');
});

test('claimRelayerJob returns null when another instance already claimed the row', async () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalFetch = global.fetch;
  let calls = 0;

  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  global.fetch = async (url, options = {}) => {
    calls += 1;
    assert.match(String(url), /morpheus_relayer_jobs/);
    assert.equal(options.method, 'PATCH');
    return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const result = await claimRelayerJob(
      'neo_n3:101:0xaaa::',
      { status: 'processing', attempts: 0 },
      {
        readyStatuses: ['queued'],
        staleStatuses: ['processing'],
        staleBeforeIso: new Date().toISOString(),
      }
    );
    assert.equal(result, null);
  } finally {
    global.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }

  assert.equal(calls, 1);
});

test('relayer mode helpers isolate pricefeed from request-processing loops', () => {
  assert.equal(shouldRunFeedSync({ mode: 'combined' }), true);
  assert.equal(shouldRunFeedSync({ mode: 'feed_only' }), true);
  assert.equal(shouldRunFeedSync({ mode: 'requests_only' }), false);
  assert.equal(shouldRunRequestProcessing({ mode: 'combined' }), true);
  assert.equal(shouldRunRequestProcessing({ mode: 'feed_only' }), false);
  assert.equal(shouldRunRequestProcessing({ mode: 'requests_only' }), true);
});
