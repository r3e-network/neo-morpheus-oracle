import { callPhala } from './phala.js';
import {
  buildFulfillmentDigestBytes,
  buildWorkerPayload,
  decodePayloadText,
  encodeFulfillmentResult,
  isOperatorOnlyRequestType,
  resolveKernelIntent,
  resolveWorkerRoute,
} from './router.js';
import {
  guardQueuedAutomationExecution,
  handleAutomationControlRequest,
  isAutomationControlRequestType,
} from './automation.js';
import { fulfillNeoN3Request } from './neo-n3.js';
import { fulfillNeoXRequest } from './neo-x.js';
import {
  buildEventKey,
  clearRetryItem,
  enqueueRetryItem,
  incrementMetric,
  recordProcessedEvent,
  scheduleRetry,
} from './state.js';
import { claimDurableJobForProcessing, maybeUpsertJob } from './queue.js';

export { normalizeErrorMessage } from './feed-sync.js';

export function trimOnchainErrorMessage(value, maxLength = 240) {
  const text = normalizeErrorMessage(value).trim();
  if (!text) return 'request execution failed';
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

export function isAlreadyFulfilledError(message) {
  const normalized = normalizeErrorMessage(message).toLowerCase();
  return (
    normalized.includes('already fulfilled') ||
    normalized.includes('request already fulfilled') ||
    normalized.includes('reason: request already fulfilled')
  );
}

export function isTerminalConfigurationError(message) {
  const normalized = normalizeErrorMessage(message).toLowerCase();
  return (
    normalized.includes('reason: unauthorized') ||
    normalized.includes('invalid signature') ||
    normalized.includes('verifier rejected signature') ||
    normalized.includes('oracle verifier') ||
    normalized.includes('updater not set') ||
    normalized.includes('callback not allowed') ||
    (normalized.includes('called contract') && normalized.includes('not found'))
  );
}

/**
 * Classify an error as transient (network/rate-limit), permanent (auth/not-found),
 * or unknown to guide retry decisions.  Transient errors are always retried;
 * permanent errors skip straight to the dead-letter / finalize path.
 */
export function classifyError(err) {
  const msg = normalizeErrorMessage(err).toLowerCase();
  if (isAlreadyFulfilledError(msg)) return 'settled';
  if (isTerminalConfigurationError(msg)) return 'permanent';
  if (
    msg.includes('etimedout') ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset') ||
    msg.includes('rate limit') ||
    msg.includes('socket hang up') ||
    msg.includes('503') ||
    msg.includes('502') ||
    msg.includes('504') ||
    msg.includes('network') ||
    msg.includes('timed out') ||
    msg.includes('unavailable')
  )
    return 'transient';
  if (
    msg.includes('not found') ||
    msg.includes('fault') ||
    msg.includes('unauthorized') ||
    msg.includes('forbidden') ||
    msg.includes('invalid')
  )
    return 'permanent';
  return 'unknown';
}

export function computeRetryDelayMs(config, attempts) {
  return Math.min(config.retryBaseDelayMs * 2 ** Math.max(attempts - 1, 0), config.retryMaxDelayMs);
}

export async function signFulfillmentPayload(config, chain, fulfillment) {
  const digestBytes = buildFulfillmentDigestBytes(
    fulfillment.requestId,
    fulfillment.requestType,
    fulfillment.success,
    fulfillment.result,
    fulfillment.error,
    fulfillment.result_bytes_base64 || ''
  );
  const response = await callPhala(config, '/sign/payload', {
    target_chain: chain,
    key_role: 'oracle_verifier',
    data_hex: digestBytes.toString('hex'),
  });
  if (!response.ok || typeof response.body?.signature !== 'string' || !response.body.signature) {
    throw new Error(
      typeof response.body?.error === 'string'
        ? response.body.error
        : `worker signing failed with status ${response.status}`
    );
  }
  return response.body;
}

async function fulfillNeoRequest(config, event, fulfillment, verification) {
  return event.chain === 'neo_n3'
    ? await fulfillNeoN3Request(
        config,
        event.requestId,
        fulfillment.success,
        fulfillment.result,
        fulfillment.error,
        verification.signature,
        fulfillment.result_bytes_base64
      )
    : await fulfillNeoXRequest(
        config,
        event.requestId,
        fulfillment.success,
        fulfillment.result,
        fulfillment.error,
        verification.signature,
        fulfillment.result_bytes_base64
      );
}

async function finalizeFailedRequest(config, event, errorMessage) {
  const safeError = trimOnchainErrorMessage(errorMessage);
  const verification = await signFulfillmentPayload(config, event.chain, {
    requestId: event.requestId,
    requestType: event.requestType,
    success: false,
    result: '',
    result_bytes_base64: '',
    error: safeError,
  });
  const fulfillTx = await fulfillNeoRequest(
    config,
    event,
    {
      success: false,
      result: '',
      error: safeError,
      result_bytes_base64: '',
    },
    verification
  );
  return {
    success: false,
    result: '',
    error: safeError,
    route: 'failure-finalize',
    worker_response: null,
    worker_status: null,
    fulfill_tx: fulfillTx,
    verification_signature: verification.signature,
  };
}

async function processOracleRequest(config, event) {
  const payload = decodePayloadText(event.payloadText);
  const kernelIntent = resolveKernelIntent(event.requestType);
  if (isAutomationControlRequestType(event.requestType)) {
    const automationResponse = await handleAutomationControlRequest(event, payload);
    const fulfillment = encodeFulfillmentResult(event.requestType, automationResponse);
    const verification = await signFulfillmentPayload(config, event.chain, {
      requestId: event.requestId,
      requestType: event.requestType,
      success: fulfillment.success,
      result: fulfillment.result || '',
      result_bytes_base64: fulfillment.result_bytes_base64 || '',
      error: fulfillment.error || '',
    });

    const fulfillTx = await fulfillNeoRequest(config, event, fulfillment, verification);

    return {
      ...fulfillment,
      route: automationResponse.route,
      module_id: kernelIntent.moduleId,
      operation: kernelIntent.operation,
      worker_response: automationResponse.body,
      worker_status: automationResponse.status,
      fulfill_tx: fulfillTx,
      verification_signature: verification.signature,
    };
  }
  const automationGuard = await guardQueuedAutomationExecution(event);
  if (automationGuard.blocked) {
    const guardResponse = {
      ok: false,
      status: 409,
      body: {
        mode: 'automation',
        action: 'execute',
        automation_id: automationGuard.automation_id,
        status: automationGuard.job?.status || 'cancelled',
        chain: event.chain,
        error: automationGuard.error,
      },
    };
    const fulfillment = encodeFulfillmentResult(event.requestType, guardResponse);
    const verification = await signFulfillmentPayload(config, event.chain, {
      requestId: event.requestId,
      requestType: event.requestType,
      success: fulfillment.success,
      result: fulfillment.result || '',
      result_bytes_base64: fulfillment.result_bytes_base64 || '',
      error: fulfillment.error || '',
    });

    const fulfillTx = await fulfillNeoRequest(config, event, fulfillment, verification);

    return {
      ...fulfillment,
      route: automationGuard.route,
      module_id: kernelIntent.moduleId,
      operation: kernelIntent.operation,
      worker_response: guardResponse.body,
      worker_status: guardResponse.status,
      fulfill_tx: fulfillTx,
      verification_signature: verification.signature,
    };
  }
  if (isOperatorOnlyRequestType(event.requestType)) {
    const verification = await signFulfillmentPayload(config, event.chain, {
      requestId: event.requestId,
      requestType: event.requestType,
      success: false,
      result: '',
      result_bytes_base64: '',
      error:
        'datafeed requests are operator-only; users should read synchronized on-chain feed data',
    });
    return {
      success: false,
      result: '',
      error:
        'datafeed requests are operator-only; users should read synchronized on-chain feed data',
      route: 'operator-only:rejected',
      module_id: kernelIntent.moduleId,
      operation: kernelIntent.operation,
      worker_response: null,
      worker_status: null,
      fulfill_tx: await fulfillNeoRequest(
        config,
        event,
        {
          success: false,
          result: '',
          error:
            'datafeed requests are operator-only; users should read synchronized on-chain feed data',
          result_bytes_base64: '',
        },
        verification
      ),
      verification_signature: verification.signature,
    };
  }
  const route = resolveWorkerRoute(event.requestType, payload);
  const workerPayload = buildWorkerPayload(
    event.chain,
    event.requestType,
    payload,
    event.requestId,
    {
      requester: event.requester,
      callbackContract: event.callbackContract,
      callbackMethod: event.callbackMethod,
    }
  );
  const workerStartedAt = Date.now();
  const workerResponse = await callPhala(config, route, workerPayload);
  const workerDurationMs = Date.now() - workerStartedAt;
  const fulfillment = encodeFulfillmentResult(event.requestType, workerResponse);
  const verificationStartedAt = Date.now();
  const verification = await signFulfillmentPayload(config, event.chain, {
    requestId: event.requestId,
    requestType: event.requestType,
    success: fulfillment.success,
    result: fulfillment.result || '',
    result_bytes_base64: fulfillment.result_bytes_base64 || '',
    error: fulfillment.error || '',
  });
  const verificationDurationMs = Date.now() - verificationStartedAt;

  const fulfillStartedAt = Date.now();
  const tx = await fulfillNeoRequest(config, event, fulfillment, verification);
  const fulfillDurationMs = Date.now() - fulfillStartedAt;
  return {
    ...fulfillment,
    route,
    module_id: kernelIntent.moduleId,
    operation: kernelIntent.operation,
    worker_response: workerResponse.body,
    worker_status: workerResponse.status,
    fulfill_tx: tx,
    verification_signature: verification.signature,
    durations_ms: {
      worker: workerDurationMs,
      verification: verificationDurationMs,
      fulfill: fulfillDurationMs,
      total: workerDurationMs + verificationDurationMs + fulfillDurationMs,
    },
  };
}

export async function processEvent(config, state, persistState, logger, event, retryItem = null) {
  const eventKey = buildEventKey(event);
  const kernelIntent = resolveKernelIntent(event.requestType);
  const attempts = retryItem?.attempts || 0;
  const processingStartedAt = Date.now();
  const requestAgeMs =
    Number.isFinite(Number(event.createdAtMs || 0)) && Number(event.createdAtMs || 0) > 0
      ? Math.max(processingStartedAt - Number(event.createdAtMs || 0), 0)
      : null;
  const isFinalizeOnly = Boolean(retryItem?.finalize_only);
  const terminalError = trimOnchainErrorMessage(
    retryItem?.terminal_error || retryItem?.last_error || 'request execution failed'
  );

  logger.info(
    {
      chain: event.chain,
      request_id: event.requestId,
      request_type: event.requestType,
      module_id: kernelIntent.moduleId,
      operation: kernelIntent.operation,
      event_key: eventKey,
      attempts,
      tx_hash: event.txHash,
      request_age_ms: requestAgeMs,
    },
    'Processing Morpheus oracle request'
  );

  const claimed = await claimDurableJobForProcessing(config, logger, event, retryItem);
  if (!claimed) {
    incrementMetric(state, 'claim_conflicts_total');
    clearRetryItem(state, event.chain, eventKey);
    persistState();
    return {
      event,
      skipped: true,
      event_key: eventKey,
      attempts,
      retry_status: 'claimed_elsewhere',
    };
  }

  await maybeUpsertJob(logger, event, {
    event_key: eventKey,
    status: retryItem ? 'retrying' : 'processing',
    attempts,
    next_retry_at: null,
  });

  try {
    let result;
    if (isFinalizeOnly) {
      result = await finalizeFailedRequest(config, event, terminalError);
      incrementMetric(state, 'fulfill_failure_total');
    } else {
      incrementMetric(state, 'worker_calls_total');
      result = await processOracleRequest(config, event);
      if (!result.success) incrementMetric(state, 'worker_failures_total');
      incrementMetric(state, result.success ? 'fulfill_success_total' : 'fulfill_failure_total');
    }
    incrementMetric(state, 'events_processed_total');

    recordProcessedEvent(
      state,
      event.chain,
      event,
      result.success ? 'fulfilled' : 'failed',
      {
        attempts,
        route: result.route,
        module_id: result.module_id || kernelIntent.moduleId,
        operation: result.operation || kernelIntent.operation,
        fulfill_tx: result.fulfill_tx,
        worker_status: result.worker_status,
        last_error: result.error || null,
        request_age_ms: requestAgeMs,
        total_duration_ms: Date.now() - processingStartedAt,
        durations_ms: result.durations_ms || null,
      },
      config
    );
    clearRetryItem(state, event.chain, eventKey);
    persistState();

    await maybeUpsertJob(logger, event, {
      event_key: eventKey,
      status: result.success ? 'fulfilled' : 'failed',
      attempts,
      route: result.route,
      worker_status: result.worker_status,
      worker_response:
        result.worker_response && typeof result.worker_response === 'object'
          ? {
              ...result.worker_response,
              kernel_intent: {
                module_id: result.module_id || kernelIntent.moduleId,
                operation: result.operation || kernelIntent.operation,
                legacy_request_type: kernelIntent.legacyRequestType,
              },
            }
          : result.worker_response,
      fulfill_tx: result.fulfill_tx,
      completed_at: new Date().toISOString(),
      next_retry_at: null,
    });

    logger.info(
      {
        chain: event.chain,
        request_id: event.requestId,
        request_type: event.requestType,
        module_id: result.module_id || kernelIntent.moduleId,
        operation: result.operation || kernelIntent.operation,
        event_key: eventKey,
        success: result.success,
        route: result.route,
        worker_status: result.worker_status,
        request_age_ms: requestAgeMs,
        total_duration_ms: Date.now() - processingStartedAt,
        durations_ms: result.durations_ms || null,
      },
      'Fulfilled Morpheus oracle request'
    );
    return { event, result, event_key: eventKey, attempts };
  } catch (error) {
    const message = normalizeErrorMessage(error);
    if (isAlreadyFulfilledError(message)) {
      recordProcessedEvent(
        state,
        event.chain,
        event,
        'settled',
        {
          attempts,
          route: isFinalizeOnly ? 'failure-finalize:already-fulfilled' : 'already-fulfilled',
          module_id: kernelIntent.moduleId,
          operation: kernelIntent.operation,
          last_error: trimOnchainErrorMessage(message),
        },
        config
      );
      clearRetryItem(state, event.chain, eventKey);
      persistState();

      await maybeUpsertJob(logger, event, {
        event_key: eventKey,
        status: 'settled',
        attempts,
        last_error: trimOnchainErrorMessage(message),
        completed_at: new Date().toISOString(),
        next_retry_at: null,
      });

      logger.info(
        {
          chain: event.chain,
          request_id: event.requestId,
          request_type: event.requestType,
          module_id: kernelIntent.moduleId,
          operation: kernelIntent.operation,
          event_key: eventKey,
          attempts,
        },
        'Oracle request was already settled on-chain'
      );
      return { event, result: null, event_key: eventKey, attempts, retry_status: 'settled' };
    }

    if (isTerminalConfigurationError(message)) {
      const terminalError = trimOnchainErrorMessage(message);
      incrementMetric(state, 'retries_exhausted_total');
      recordProcessedEvent(
        state,
        event.chain,
        event,
        'exhausted',
        {
          attempts,
          route: isFinalizeOnly ? 'failure-finalize:config-error' : 'config-error',
          module_id: kernelIntent.moduleId,
          operation: kernelIntent.operation,
          last_error: terminalError,
        },
        config
      );
      clearRetryItem(state, event.chain, eventKey);
      persistState();

      await maybeUpsertJob(logger, event, {
        event_key: eventKey,
        status: 'failed_config',
        attempts,
        last_error: terminalError,
        completed_at: new Date().toISOString(),
        next_retry_at: null,
      });

      logger.error(
        {
          chain: event.chain,
          request_id: event.requestId,
          request_type: event.requestType,
          module_id: kernelIntent.moduleId,
          operation: kernelIntent.operation,
          event_key: eventKey,
          attempts,
          error: terminalError,
        },
        'Relayer stopped retrying due to a terminal configuration or authorization error'
      );
      return {
        event,
        error: terminalError,
        retry_status: 'terminal',
        event_key: eventKey,
        attempts,
      };
    }

    if (isFinalizeOnly) {
      const nextAttempts = attempts + 1;
      const retryItemNext = enqueueRetryItem(state, event.chain, event, {
        attempts: nextAttempts,
        next_retry_at: Date.now() + computeRetryDelayMs(config, nextAttempts),
        first_failed_at: retryItem?.first_failed_at || new Date().toISOString(),
        last_error: trimOnchainErrorMessage(message),
        finalize_only: true,
        terminal_error: terminalError,
      });
      incrementMetric(state, 'retries_scheduled_total');
      persistState();

      await maybeUpsertJob(logger, event, {
        event_key: eventKey,
        status: 'failure_callback_retry_scheduled',
        attempts: retryItemNext.attempts,
        last_error: retryItemNext.last_error,
        next_retry_at: new Date(retryItemNext.next_retry_at).toISOString(),
        worker_response: {
          retry_meta: {
            finalize_only: true,
            terminal_error: terminalError,
            module_id: kernelIntent.moduleId,
            operation: kernelIntent.operation,
          },
        },
      });

      logger.warn(
        {
          chain: event.chain,
          request_id: event.requestId,
          request_type: event.requestType,
          module_id: kernelIntent.moduleId,
          operation: kernelIntent.operation,
          event_key: eventKey,
          attempts: retryItemNext.attempts,
          retry_at: retryItemNext.next_retry_at,
          error: retryItemNext.last_error,
        },
        'Retrying terminal failure callback delivery'
      );
      return {
        event,
        error: retryItemNext.last_error,
        retry_status: 'scheduled',
        event_key: eventKey,
        attempts: retryItemNext.attempts,
      };
    }

    const errorClass = classifyError(message);
    const forceDead = errorClass === 'permanent';
    const retry = forceDead
      ? { status: 'exhausted', key: eventKey, attempts: attempts + 1, error: message }
      : scheduleRetry(state, event.chain, event, message, config);

    if (retry.status === 'exhausted') {
      incrementMetric(state, 'retries_exhausted_total');
      try {
        const result = await finalizeFailedRequest(config, event, message);
        incrementMetric(state, 'events_processed_total');
        incrementMetric(state, 'events_failed_total');
        incrementMetric(state, 'fulfill_failure_total');
        recordProcessedEvent(
          state,
          event.chain,
          event,
          'failed',
          {
            attempts: retry.attempts,
            route: result.route,
            module_id: result.module_id || kernelIntent.moduleId,
            operation: result.operation || kernelIntent.operation,
            fulfill_tx: result.fulfill_tx,
            worker_status: null,
            last_error: result.error,
          },
          config
        );
        clearRetryItem(state, event.chain, eventKey);
        persistState();

        await maybeUpsertJob(logger, event, {
          event_key: eventKey,
          status: 'failed',
          attempts: retry.attempts,
          last_error: result.error,
          fulfill_tx: result.fulfill_tx,
          completed_at: new Date().toISOString(),
          next_retry_at: null,
        });

        logger.warn(
          {
            chain: event.chain,
            request_id: event.requestId,
            request_type: event.requestType,
            event_key: eventKey,
            attempts: retry.attempts,
            error: result.error,
          },
          'Finalized oracle request with an on-chain failure callback'
        );
        return { event, result, event_key: eventKey, attempts: retry.attempts };
      } catch (finalizeError) {
        const nextAttempts = retry.attempts + 1;
        const retryItemNext = enqueueRetryItem(state, event.chain, event, {
          attempts: nextAttempts,
          next_retry_at: Date.now() + computeRetryDelayMs(config, nextAttempts),
          first_failed_at: new Date().toISOString(),
          last_error: trimOnchainErrorMessage(finalizeError),
          finalize_only: true,
          terminal_error: trimOnchainErrorMessage(message),
        });
        incrementMetric(state, 'retries_scheduled_total');
        persistState();

        await maybeUpsertJob(logger, event, {
          event_key: eventKey,
          status: 'failure_callback_retry_scheduled',
          attempts: retryItemNext.attempts,
          last_error: retryItemNext.last_error,
          next_retry_at: new Date(retryItemNext.next_retry_at).toISOString(),
          worker_response: {
            retry_meta: {
              finalize_only: true,
              terminal_error: trimOnchainErrorMessage(message),
              module_id: kernelIntent.moduleId,
              operation: kernelIntent.operation,
            },
          },
        });

        logger.error(
          {
            chain: event.chain,
            request_id: event.requestId,
            request_type: event.requestType,
            module_id: kernelIntent.moduleId,
            operation: kernelIntent.operation,
            event_key: eventKey,
            attempts: retryItemNext.attempts,
            error: retryItemNext.last_error,
          },
          'Primary execution exhausted; retrying terminal failure callback'
        );
        return {
          event,
          error: retryItemNext.last_error,
          retry_status: 'scheduled',
          event_key: eventKey,
          attempts: retryItemNext.attempts,
        };
      }
    }

    incrementMetric(state, 'retries_scheduled_total');
    persistState();

    await maybeUpsertJob(logger, event, {
      event_key: eventKey,
      status: 'retry_scheduled',
      attempts: retry.item.attempts,
      last_error: message,
      next_retry_at: new Date(retry.item.next_retry_at).toISOString(),
    });

    logger.warn(
      {
        chain: event.chain,
        request_id: event.requestId,
        request_type: event.requestType,
        module_id: kernelIntent.moduleId,
        operation: kernelIntent.operation,
        event_key: eventKey,
        attempts: retry.item.attempts,
        retry_at: retry.item.next_retry_at,
        error_class: errorClass,
        error: message,
      },
      'Scheduled Morpheus oracle request retry'
    );
    return {
      event,
      error: message,
      error_class: errorClass,
      retry_status: 'scheduled',
      event_key: eventKey,
      attempts: retry.item.attempts,
    };
  }
}

export { finalizeFailedRequest, processOracleRequest };
