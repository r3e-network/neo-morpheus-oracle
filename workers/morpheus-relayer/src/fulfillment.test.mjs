import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyError,
  computeRetryDelayMs,
  enrichAutomationExecutionPayload,
  isAlreadyFulfilledError,
  isQueuedAutomationExecutionPayload,
  isTerminalConfigurationError,
  resolveFulfillmentSigningContext,
  trimOnchainErrorMessage,
} from './fulfillment.js';

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
