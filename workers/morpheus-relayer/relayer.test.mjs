import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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
import {
  guardQueuedAutomationExecution,
  isAutomationControlRequestType,
  processAutomationJobs,
} from './src/automation.js';
import { getFeedSyncDelayMs, resolveChainFromBlock } from './src/relayer.js';
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
import { sanitizeForPostgres } from './src/persistence.js';
import { createRelayerConfig } from './src/config.js';

const retryConfig = {
  maxRetries: 3,
  retryBaseDelayMs: 1000,
  retryMaxDelayMs: 10000,
  processedCacheSize: 100,
  deadLetterLimit: 10,
};

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
    const config = createRelayerConfig();
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
    const config = createRelayerConfig();
    assert.deepEqual(config.activeChains, ['neo_n3']);
  } finally {
    if (previous === undefined) delete process.env.MORPHEUS_ACTIVE_CHAINS;
    else process.env.MORPHEUS_ACTIVE_CHAINS = previous;
  }
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
  state.metrics.last_feed_sync_started_at = '2026-03-10T13:00:00.000Z';
  state.metrics.last_feed_sync_completed_at = '2026-03-10T13:00:05.000Z';

  assert.equal(getFeedSyncDelayMs(config, state, Date.parse('2026-03-10T13:00:10.000Z')), 50000);
  assert.equal(getFeedSyncDelayMs(config, state, Date.parse('2026-03-10T13:01:01.000Z')), 0);
});
