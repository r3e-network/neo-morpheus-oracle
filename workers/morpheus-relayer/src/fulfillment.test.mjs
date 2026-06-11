import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyError,
  computeRetryDelayMs,
  enrichAutomationExecutionPayload,
  isAlreadyFulfilledError,
  isQueuedAutomationExecutionPayload,
  isTerminalConfigurationError,
  processEvent,
  resolveCallbackRetryCeiling,
  resolveEventFulfillmentContext,
  resolveFulfillmentSigningContext,
  trimOnchainErrorMessage,
} from './fulfillment.js';
import { buildEventKey, createEmptyRelayerState } from './state.js';

// ===================================================================
// trimOnchainErrorMessage
// ===================================================================

describe('trimOnchainErrorMessage', () => {
  it('returns default message for empty/blank input', () => {
    assert.equal(trimOnchainErrorMessage(''), 'request execution failed');
    assert.equal(trimOnchainErrorMessage('   '), 'request execution failed');
  });

  it('passes through short messages unchanged', () => {
    assert.equal(trimOnchainErrorMessage('something went wrong'), 'something went wrong');
  });

  it('truncates messages exceeding maxLength', () => {
    const long = 'a'.repeat(300);
    const result = trimOnchainErrorMessage(long, 240);
    assert.ok(result.length <= 240);
    assert.ok(result.endsWith('...'));
  });

  it('handles Error objects', () => {
    const result = trimOnchainErrorMessage(new Error('test error'));
    assert.equal(result, 'test error');
  });

  it('handles non-string types', () => {
    const result = trimOnchainErrorMessage(42);
    assert.equal(result, '42');
  });

  it('respects custom maxLength', () => {
    const msg = 'a'.repeat(50);
    const result = trimOnchainErrorMessage(msg, 20);
    assert.ok(result.length <= 20);
    assert.ok(result.endsWith('...'));
  });

  it('redacts URLs so finalized error text cannot leak infrastructure endpoints', () => {
    const message =
      'request 42 not found [oracle_contract=0xabc rpc_url=https://user:secret@mainnet1.neo.coz.io:443/rpc]';
    const result = trimOnchainErrorMessage(message);
    assert.ok(!result.includes('http'), `expected no URL in: ${result}`);
    assert.ok(!result.includes('secret'));
    assert.match(result, /\[redacted-url\]/);
    assert.match(result, /request 42 not found/);
  });

  it('redacts RPC endpoints embedded by the Neo RPC error formatter', () => {
    const result = trimOnchainErrorMessage(
      'Neo RPC invokefunction failed via http://seed1.neo.org:10332 (503): unavailable'
    );
    assert.ok(!result.includes('seed1.neo.org'));
    assert.match(result, /Neo RPC invokefunction failed via \[redacted-url\] \(503\)/);
  });
});

// ===================================================================
// isAlreadyFulfilledError
// ===================================================================

describe('isAlreadyFulfilledError', () => {
  it('detects "already fulfilled" in various forms', () => {
    assert.equal(isAlreadyFulfilledError('already fulfilled'), true);
    assert.equal(isAlreadyFulfilledError('Request Already Fulfilled'), true);
    assert.equal(isAlreadyFulfilledError('reason: request already fulfilled'), true);
    assert.equal(isAlreadyFulfilledError('ALREADY FULFILLED by another node'), true);
  });

  it('returns false for unrelated errors', () => {
    assert.equal(isAlreadyFulfilledError('network timeout'), false);
    assert.equal(isAlreadyFulfilledError('unauthorized'), false);
    assert.equal(isAlreadyFulfilledError(''), false);
  });

  it('handles Error objects', () => {
    assert.equal(isAlreadyFulfilledError(new Error('already fulfilled')), true);
    assert.equal(isAlreadyFulfilledError(new Error('timeout')), false);
  });
});

// ===================================================================
// isTerminalConfigurationError
// ===================================================================

describe('isTerminalConfigurationError', () => {
  it('detects unauthorized errors', () => {
    assert.equal(isTerminalConfigurationError('reason: unauthorized'), true);
  });

  it('detects invalid signature errors', () => {
    assert.equal(isTerminalConfigurationError('invalid signature for request'), true);
    assert.equal(isTerminalConfigurationError('verifier rejected signature'), true);
  });

  it('detects oracle verifier errors', () => {
    assert.equal(isTerminalConfigurationError('oracle verifier mismatch'), true);
  });

  it('detects updater not set', () => {
    assert.equal(isTerminalConfigurationError('updater not set'), true);
  });

  it('detects callback not allowed', () => {
    assert.equal(isTerminalConfigurationError('callback not allowed'), true);
  });

  it('detects called contract not found', () => {
    assert.equal(isTerminalConfigurationError('called contract 0xabc123 not found'), true);
  });

  it('returns false for transient errors', () => {
    assert.equal(isTerminalConfigurationError('ETIMEDOUT'), false);
    assert.equal(isTerminalConfigurationError('rate limit exceeded'), false);
    assert.equal(isTerminalConfigurationError('socket hang up'), false);
  });
});

// ===================================================================
// classifyError
// ===================================================================

describe('classifyError', () => {
  // --- settled ---
  it('classifies already-fulfilled as settled', () => {
    assert.equal(classifyError('already fulfilled'), 'settled');
    assert.equal(classifyError('request already fulfilled'), 'settled');
  });

  // --- permanent (terminal config) ---
  it('classifies terminal config errors as permanent', () => {
    assert.equal(classifyError('reason: unauthorized'), 'permanent');
    assert.equal(classifyError('invalid signature'), 'permanent');
    assert.equal(classifyError('verifier rejected signature'), 'permanent');
    assert.equal(classifyError('updater not set'), 'permanent');
  });

  // --- transient ---
  it('classifies network errors as transient', () => {
    assert.equal(classifyError('ETIMEDOUT'), 'transient');
    assert.equal(classifyError('ECONNREFUSED'), 'transient');
    assert.equal(classifyError('ECONNRESET'), 'transient');
    assert.equal(classifyError('socket hang up'), 'transient');
  });

  it('classifies rate limit errors as transient', () => {
    assert.equal(classifyError('rate limit exceeded'), 'transient');
  });

  it('classifies HTTP 5xx errors as transient', () => {
    assert.equal(classifyError('HTTP 502 Bad Gateway'), 'transient');
    assert.equal(classifyError('HTTP 503 Service Unavailable'), 'transient');
    assert.equal(classifyError('HTTP 504 Gateway Timeout'), 'transient');
  });

  it('classifies timeout/unavailable as transient', () => {
    assert.equal(classifyError('request timed out'), 'transient');
    assert.equal(classifyError('service unavailable'), 'transient');
    assert.equal(classifyError('network error'), 'transient');
  });

  // --- permanent (general) ---
  it('classifies not-found as permanent', () => {
    assert.equal(classifyError('resource not found'), 'permanent');
  });

  it('classifies unauthorized/forbidden as permanent', () => {
    assert.equal(classifyError('unauthorized access'), 'permanent');
    assert.equal(classifyError('forbidden'), 'permanent');
  });

  it('classifies fault as permanent', () => {
    assert.equal(classifyError('VM fault'), 'permanent');
  });

  it('classifies generic invalid as permanent', () => {
    assert.equal(classifyError('invalid argument'), 'permanent');
  });

  // --- unknown ---
  it('classifies unrecognized errors as unknown', () => {
    assert.equal(classifyError('something weird happened'), 'unknown');
    assert.equal(classifyError(''), 'unknown');
  });

  // --- handles Error objects ---
  it('handles Error objects', () => {
    assert.equal(classifyError(new Error('ECONNRESET')), 'transient');
    assert.equal(classifyError(new Error('already fulfilled')), 'settled');
  });

  // --- settled takes priority over permanent keywords ---
  it('settled classification takes priority over permanent keywords', () => {
    // "already fulfilled" contains no permanent keywords, but let's verify
    // that the order of checks matters: settled is checked first
    assert.equal(classifyError('request already fulfilled'), 'settled');
  });
});

// ===================================================================
// computeRetryDelayMs
// ===================================================================

describe('computeRetryDelayMs', () => {
  const config = {
    retryBaseDelayMs: 1000,
    retryMaxDelayMs: 30000,
  };

  it('returns base delay for first attempt', () => {
    assert.equal(computeRetryDelayMs(config, 1), 1000);
  });

  it('doubles delay with each attempt (exponential backoff)', () => {
    assert.equal(computeRetryDelayMs(config, 1), 1000);
    assert.equal(computeRetryDelayMs(config, 2), 2000);
    assert.equal(computeRetryDelayMs(config, 3), 4000);
    assert.equal(computeRetryDelayMs(config, 4), 8000);
  });

  it('caps at retryMaxDelayMs', () => {
    assert.equal(computeRetryDelayMs(config, 10), 30000);
    assert.equal(computeRetryDelayMs(config, 20), 30000);
  });

  it('handles zero attempts (uses base delay)', () => {
    assert.equal(computeRetryDelayMs(config, 0), 1000);
  });

  it('handles negative attempts (uses base delay)', () => {
    assert.equal(computeRetryDelayMs(config, -1), 1000);
  });

  it('works with different config values', () => {
    const custom = { retryBaseDelayMs: 500, retryMaxDelayMs: 5000 };
    assert.equal(computeRetryDelayMs(custom, 1), 500);
    assert.equal(computeRetryDelayMs(custom, 2), 1000);
    assert.equal(computeRetryDelayMs(custom, 4), 4000);
    assert.equal(computeRetryDelayMs(custom, 5), 5000); // capped
  });
});

// ===================================================================
// resolveFulfillmentSigningContext
// ===================================================================

describe('resolveFulfillmentSigningContext', () => {
  it('uses the legacy digest domain for legacy Neo N3 requests', () => {
    assert.deepEqual(
      resolveFulfillmentSigningContext('neo_n3', {
        requestId: '4453',
        requestType: 'privacy_oracle',
        appId: '',
        moduleId: '',
        operation: '',
      }),
      { chain: 'legacy', appId: '', moduleId: '', operation: '' }
    );
  });

  it('preserves kernel digest context when app and module are present', () => {
    assert.deepEqual(
      resolveFulfillmentSigningContext('neo_n3', {
        appId: 'miniapp-os',
        moduleId: 'oracle.fetch',
        operation: 'privacy_oracle',
      }),
      {
        chain: 'neo_n3',
        appId: 'miniapp-os',
        moduleId: 'oracle.fetch',
        operation: 'privacy_oracle',
      }
    );
  });
});

describe('resolveEventFulfillmentContext', () => {
  it('prefers the on-chain miniapp envelope over the internal route mapping', () => {
    assert.deepEqual(
      resolveEventFulfillmentContext(
        {
          appId: 'morpheus.platform.game',
          moduleId: 'vrf_random',
          operation: 'vrf_random',
        },
        {
          moduleId: 'random.generate',
          operation: 'vrf_random',
        }
      ),
      {
        appId: 'morpheus.platform.game',
        moduleId: 'vrf_random',
        operation: 'vrf_random',
      }
    );
  });

  it('falls back to the legacy kernel mapping when old events lack envelope fields', () => {
    assert.deepEqual(
      resolveEventFulfillmentContext(
        {
          requestType: 'privacy_oracle',
        },
        {
          moduleId: 'oracle.fetch',
          operation: 'privacy_oracle',
        }
      ),
      {
        appId: '',
        moduleId: 'oracle.fetch',
        operation: 'privacy_oracle',
      }
    );
  });
});

// ===================================================================
// enrichAutomationExecutionPayload
// ===================================================================

describe('enrichAutomationExecutionPayload', () => {
  it('enriches automation payloads without throwing and preserves explicit identifiers', () => {
    const payload = enrichAutomationExecutionPayload(
      {
        chain: 'neo_n3',
        requestType: 'automation_upkeep',
        requestId: '42',
      },
      {
        automation_id: 'job-7',
        execution_id: 'custom-execution',
        workflow_id: 'custom.workflow',
        request_id: 'custom-request',
        idempotency_key: 'custom-idempotency',
      }
    );

    assert.equal(payload.execution_id, 'custom-execution');
    assert.equal(payload.workflow_id, 'custom.workflow');
    assert.equal(payload.request_id, 'custom-request');
    assert.equal(payload.idempotency_key, 'custom-idempotency');
  });
});

describe('isQueuedAutomationExecutionPayload', () => {
  it('does not treat regular oracle payloads as automation executions', () => {
    assert.equal(isQueuedAutomationExecutionPayload({ url: 'https://prices.test/neo' }), false);
    assert.equal(isQueuedAutomationExecutionPayload('raw payload'), false);
    assert.equal(isQueuedAutomationExecutionPayload(null), false);
  });

  it('detects scheduler execution payloads', () => {
    assert.equal(
      isQueuedAutomationExecutionPayload({
        automation_id: 'automation:neo_n3:test',
        workflow_id: 'automation.upkeep',
      }),
      true
    );
    assert.equal(
      isQueuedAutomationExecutionPayload({
        automationId: 'automation:neo_n3:test',
        executionId: 'execution-1',
      }),
      true
    );
  });
});

// ===================================================================
// resolveCallbackRetryCeiling
// ===================================================================

describe('resolveCallbackRetryCeiling', () => {
  it('defaults to maxRetries * 2', () => {
    assert.equal(resolveCallbackRetryCeiling({ maxRetries: 5 }), 10);
    assert.equal(resolveCallbackRetryCeiling({ maxRetries: 3 }), 6);
  });

  it('honours an explicit maxCallbackRetries', () => {
    assert.equal(resolveCallbackRetryCeiling({ maxRetries: 5, maxCallbackRetries: 3 }), 3);
  });

  it('never drops below one attempt', () => {
    assert.equal(resolveCallbackRetryCeiling({ maxRetries: 0 }), 1);
    assert.equal(resolveCallbackRetryCeiling({}), 1);
  });
});

// ===================================================================
// processEvent retry exhaustion (callback delivery + failure finalize)
// ===================================================================

describe('processEvent delivery retry exhaustion', () => {
  // Deterministic throwaway test key (not used anywhere live).
  const TEST_PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
  const silentLogger = { info() {}, warn() {}, error() {} };
  const baseRetryConfig = {
    network: 'testnet',
    maxRetries: 3,
    retryBaseDelayMs: 10,
    retryMaxDelayMs: 100,
    processedCacheSize: 100,
    deadLetterLimit: 10,
    durableQueue: { enabled: false },
  };
  const preparedFulfillment = {
    success: true,
    result: '{"answer":42}',
    error: '',
    result_bytes_base64: '',
    route: '/oracle/fetch',
    module_id: 'oracle.fetch',
    operation: 'privacy_oracle',
    worker_status: 200,
    verification_signature: 'signed-result',
  };

  function throwingDeliveryConfig(errorMessage) {
    return {
      ...baseRetryConfig,
      hooks: {
        fulfillNeoRequest: async () => {
          throw new Error(errorMessage);
        },
      },
    };
  }

  it('keeps retrying transient delivery errors below the callback ceiling', async () => {
    const state = createEmptyRelayerState();
    const event = { chain: 'neo_n3', requestId: '300', requestType: 'privacy_oracle', txHash: '0x300' };
    const result = await processEvent(
      throwingDeliveryConfig('ECONNRESET'),
      state,
      () => {},
      silentLogger,
      event,
      { attempts: 1, prepared_fulfillment: preparedFulfillment, durable_claimed: true }
    );

    assert.equal(result.retry_status, 'callback_retry_scheduled');
    assert.equal(state.neo_n3.retry_queue.length, 1);
    assert.equal(state.neo_n3.dead_letters.length, 0);
  });

  it('dead-letters prepared callback redelivery once the retry ceiling is exceeded', async () => {
    const state = createEmptyRelayerState();
    const event = { chain: 'neo_n3', requestId: '301', requestType: 'privacy_oracle', txHash: '0x301' };
    // attempts 6 == maxRetries * 2 -> the next failure (attempt 7) exhausts.
    const result = await processEvent(
      throwingDeliveryConfig('mempool rejected the transaction'),
      state,
      () => {},
      silentLogger,
      event,
      { attempts: 6, prepared_fulfillment: preparedFulfillment, durable_claimed: true }
    );

    assert.equal(result.retry_status, 'exhausted');
    assert.equal(result.attempts, 7);
    const key = buildEventKey(event);
    assert.equal(state.neo_n3.processed_records[key].status, 'exhausted');
    assert.equal(state.neo_n3.dead_letters.length, 1);
    assert.equal(state.neo_n3.dead_letters[0].request_id, '301');
    assert.equal(state.neo_n3.retry_queue.length, 0);
    assert.equal(state.metrics.retries_exhausted_total, 1);
  });

  it('short-circuits a permanently FAULTing callback delivery to the dead-letter lane', async () => {
    const state = createEmptyRelayerState();
    const event = { chain: 'neo_n3', requestId: '302', requestType: 'privacy_oracle', txHash: '0x302' };
    // classifyError('... faulted ...') === 'permanent': no point redelivering
    // the same prepared payload, even on the very first attempt.
    const result = await processEvent(
      throwingDeliveryConfig(
        'Neo N3 fulfillRequest test invoke faulted for request 302: callback exploded'
      ),
      state,
      () => {},
      silentLogger,
      event,
      { attempts: 0, prepared_fulfillment: preparedFulfillment, durable_claimed: true }
    );

    assert.equal(result.retry_status, 'exhausted');
    assert.equal(state.neo_n3.dead_letters.length, 1);
    assert.equal(state.neo_n3.retry_queue.length, 0);
  });

  it('dead-letters the failure-finalize lane once the callback ceiling is exceeded', async () => {
    const state = createEmptyRelayerState();
    // Neo X event: signNeoXFulfillment signs locally, so finalizeFailedRequest
    // runs fully offline before the delivery hook rejects.
    const event = { chain: 'neox', requestId: '7', requestType: 'random', txHash: '' };
    const config = {
      ...throwingDeliveryConfig('mempool rejected the transaction'),
      neox: {
        chainId: 47763,
        oracleContract: '0xeCFC1C652B5cCdBfe3E9314a83156787D92a3fD2',
        updaterPrivateKey: TEST_PK,
      },
    };
    const result = await processEvent(config, state, () => {}, silentLogger, event, {
      attempts: 6,
      finalize_only: true,
      terminal_error: 'worker exploded upstream',
      durable_claimed: true,
    });

    assert.equal(result.retry_status, 'exhausted');
    assert.equal(result.attempts, 7);
    assert.equal(state.neox.dead_letters.length, 1);
    assert.equal(state.neox.dead_letters[0].terminal_error, 'worker exploded upstream');
    assert.equal(state.neox.retry_queue.length, 0);
  });
});
