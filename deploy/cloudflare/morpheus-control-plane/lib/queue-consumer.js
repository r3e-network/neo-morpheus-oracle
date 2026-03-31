import { trimString, parseTimestampMs } from '@neo-morpheus-oracle/shared/utils';
import { loadJob, patchJob, normalizeJobStatus } from './jobs.js';
import { resolveStaleProcessingMs, computeRetryDelaySeconds, isStaleProcessing } from './config.js';
import { isRetryableStatus } from './execution-plane.js';
import { callExecutionPlane, callExecutionFeedPlane } from './execution-plane.js';

const TERMINAL_JOB_STATUSES = new Set(['succeeded', 'failed', 'dead_lettered', 'cancelled']);

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

export { processExecutionJob, processFeedTickJob, TERMINAL_JOB_STATUSES };
