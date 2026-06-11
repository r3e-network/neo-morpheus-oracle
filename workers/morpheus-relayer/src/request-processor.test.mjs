import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { processChainByRequestCursor } from './request-processor.js';
import { createEmptyRelayerState } from './state.js';

const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };

function tempStateFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'morpheus-relayer-rp-'));
  return path.join(dir, '.morpheus-relayer-state.json');
}

function cursorConfig(overrides = {}) {
  return {
    network: 'testnet',
    stateFile: tempStateFile(),
    concurrency: 2,
    maxBlocksPerTick: 250,
    maxRetries: 3,
    retryBaseDelayMs: 10,
    retryMaxDelayMs: 100,
    processedCacheSize: 100,
    deadLetterLimit: 10,
    startRequestIds: {},
    durableQueue: { enabled: false },
    backpressure: { maxFreshEventsPerTick: 32, maxRetryEventsPerTick: 16, deferDelayMs: 250 },
    ...overrides,
  };
}

test('processChainByRequestCursor does not advance the cursor when the scan throws', async () => {
  const state = createEmptyRelayerState();
  state.neox.last_request_id = 4;

  await assert.rejects(
    processChainByRequestCursor(cursorConfig(), state, silentLogger, 'neox', {
      hasConfig: () => true,
      getLatestRequestId: async () => 10,
      scan: async () => {
        throw new Error('ECONNRESET');
      },
    }),
    /ECONNRESET/
  );

  // The failed range (5..10) must be rescanned next tick — a swallowed transport
  // error here would orphan paid requests behind the cursor forever.
  assert.equal(state.neox.last_request_id, 4);
});

test('quiet-chain early return still caps due retries and counts skipped items', async () => {
  const state = createEmptyRelayerState();
  state.neox.last_request_id = 10;

  const preparedFulfillment = {
    success: true,
    result: '{"ok":true}',
    error: '',
    result_bytes_base64: '',
    route: '/oracle/fetch',
    module_id: 'oracle.fetch',
    operation: 'privacy_oracle',
    worker_status: 200,
    verification_signature: 'sig',
  };
  for (const requestId of ['7', '8', '9']) {
    state.neox.retry_queue.push({
      key: `neox:${requestId}:::`,
      event: { chain: 'neox', requestId, requestType: 'privacy_oracle', txHash: '' },
      attempts: 0,
      next_retry_at: Date.now() - 1000,
      prepared_fulfillment: preparedFulfillment,
      durable_claimed: true,
    });
  }

  const fulfillCalls = [];
  const config = cursorConfig({
    backpressure: { maxFreshEventsPerTick: 32, maxRetryEventsPerTick: 1, deferDelayMs: 250 },
    hooks: {
      fulfillNeoRequest: async (call) => {
        fulfillCalls.push(call.requestId);
        return {
          request_id: `neox:fulfill:${call.requestId}`,
          tx_hash: '0xfulfilled',
          vm_state: 'HALT',
          target_chain: 'neox',
        };
      },
    },
  });

  // fromRequestId (11) > latestRequestId (10) -> the quiet-chain early return,
  // which previously processed ALL due retries with no backpressure cap.
  const result = await processChainByRequestCursor(config, state, silentLogger, 'neox', {
    hasConfig: () => true,
    getLatestRequestId: async () => 10,
    scan: async () => [],
  });

  assert.equal(result.scanned_requests, null);
  assert.equal(result.retries.length, 1);
  assert.deepEqual(fulfillCalls, ['7']);
  assert.equal(state.metrics.backpressure_retry_skipped_total, 2);
  assert.equal(state.neox.retry_queue.length, 2);
});
