import { randomUUID } from "node:crypto";

import {
  fetchActiveAutomationJobs,
  fetchAutomationJobById,
  fetchAutomationRunByQueueTxHash,
  insertAutomationRun,
  patchAutomationJob,
  patchAutomationRunByQueueTxHash,
  persistAutomationEncryptedFields,
  upsertAutomationJob,
} from "./persistence.js";
import { fetchNeoN3FeedRecord, queueNeoN3AutomationRequest } from "./neo-n3.js";
import { fetchNeoXFeedRecord, queueNeoXAutomationRequest } from "./neo-x.js";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function resolveSupabaseNetwork(value) {
  return trimString(value || process.env.MORPHEUS_NETWORK || process.env.NEXT_PUBLIC_MORPHEUS_NETWORK || "testnet") === "mainnet"
    ? "mainnet"
    : "testnet";
}

function normalizeRequestType(value) {
  return trimString(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nowIso() {
  return new Date().toISOString();
}

function parseTimestamp(value) {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parsePositiveInteger(value, fieldName) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0 || !Number.isInteger(numeric)) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
  return numeric;
}

function parseBigIntLike(value, fieldName) {
  try {
    return BigInt(String(value));
  } catch {
    throw new Error(`${fieldName} must be an integer string`);
  }
}

function resolveExecutionRequestType(payload) {
  const execution = isPlainObject(payload.execution) ? payload.execution : {};
  const requestType = normalizeRequestType(execution.request_type || payload.execution_request_type || "");
  if (!requestType) throw new Error("execution.request_type is required");
  if (requestType.includes("feed")) throw new Error("automation execution request_type cannot be datafeed");
  if (requestType.startsWith("automation_")) throw new Error("automation execution request_type cannot be an automation control type");
  return requestType;
}

function resolveExecutionPayload(payload) {
  const execution = isPlainObject(payload.execution) ? payload.execution : {};
  const executionPayload = execution.payload ?? payload.execution_payload;
  if (typeof executionPayload === "string") {
    try {
      return JSON.parse(executionPayload);
    } catch {
      return { raw_payload: executionPayload };
    }
  }
  if (!isPlainObject(executionPayload)) {
    throw new Error("execution.payload must be a JSON object or string");
  }
  return executionPayload;
}

function stringifyExecutionPayload(payload) {
  if (typeof payload === "string") return payload;
  return JSON.stringify(payload);
}

function buildInitialTrigger(trigger) {
  const type = normalizeRequestType(trigger.type || "");
  if (!type) throw new Error("trigger.type is required");

  if (type === "one_shot") {
    const executeAt = parseTimestamp(trigger.execute_at || trigger.executeAt);
    if (!executeAt) throw new Error("trigger.execute_at is required for one_shot");
    return {
      triggerType: "one_shot",
      triggerConfig: {
        execute_at: executeAt.toISOString(),
      },
      nextRunAt: executeAt.toISOString(),
    };
  }

  if (type === "interval") {
    const intervalMs = parsePositiveInteger(trigger.interval_ms || trigger.intervalMs, "trigger.interval_ms");
    const startAt = parseTimestamp(trigger.start_at || trigger.startAt) || new Date();
    return {
      triggerType: "interval",
      triggerConfig: {
        interval_ms: intervalMs,
        start_at: startAt.toISOString(),
      },
      nextRunAt: startAt.toISOString(),
    };
  }

  if (type === "price_threshold") {
    const comparator = normalizeRequestType(trigger.comparator || "");
    if (!["gte", "lte", "cross_above", "cross_below"].includes(comparator)) {
      throw new Error("trigger.comparator must be one of gte, lte, cross_above, cross_below");
    }
    const pair = trimString(trigger.pair || trigger.feed_pair || "");
    if (!pair) throw new Error("trigger.pair is required for price_threshold");
    const threshold = parseBigIntLike(trigger.threshold, "trigger.threshold").toString();
    const cooldownMs = trigger.cooldown_ms !== undefined
      ? parsePositiveInteger(trigger.cooldown_ms, "trigger.cooldown_ms")
      : null;
    const feedChain = normalizeRequestType(trigger.feed_chain || trigger.feedChain || "");
    return {
      triggerType: "price_threshold",
      triggerConfig: {
        pair,
        comparator,
        threshold,
        cooldown_ms: cooldownMs,
        feed_chain: feedChain || null,
      },
      nextRunAt: null,
    };
  }

  throw new Error(`unsupported trigger.type: ${trigger.type}`);
}

function buildAutomationJobFromPayload(event, payload) {
  if (!isPlainObject(payload)) throw new Error("automation registration payload must be a JSON object");
  const trigger = isPlainObject(payload.trigger) ? payload.trigger : null;
  if (!trigger) throw new Error("trigger is required");

  const executionRequestType = resolveExecutionRequestType(payload);
  const executionPayload = resolveExecutionPayload(payload);
  const { triggerType, triggerConfig, nextRunAt } = buildInitialTrigger(trigger);
  const maxExecutions = payload.max_executions === undefined || payload.max_executions === null || payload.max_executions === ""
    ? null
    : parsePositiveInteger(payload.max_executions, "max_executions");

  return {
    automation_id: `automation:${event.chain}:${randomUUID()}`,
    registration_request_id: String(event.requestId),
    network: resolveSupabaseNetwork(event.network),
    project_slug: trimString(payload.project_slug || executionPayload.project_slug || ""),
    chain: event.chain,
    requester: trimString(event.requester || ""),
    callback_contract: trimString(event.callbackContract || ""),
    callback_method: trimString(event.callbackMethod || ""),
    execution_request_type: executionRequestType,
    execution_payload: executionPayload,
    trigger_type: triggerType,
    trigger_config: triggerConfig,
    trigger_state: {},
    status: "active",
    next_run_at: nextRunAt,
    last_run_at: null,
    execution_count: 0,
    max_executions: maxExecutions,
    last_queued_request_id: null,
    last_error: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
}

function buildRegistrationResult(job) {
  return {
    mode: "automation",
    action: "register",
    automation_id: job.automation_id,
    chain: job.chain,
    requester: job.requester,
    callback_contract: job.callback_contract,
    execution_request_type: job.execution_request_type,
    trigger_type: job.trigger_type,
    next_run_at: job.next_run_at,
    status: job.status,
  };
}

function buildCancellationResult(job, automationId) {
  return {
    mode: "automation",
    action: "cancel",
    automation_id: automationId,
    chain: job?.chain || null,
    status: "cancelled",
  };
}

function buildCancelledExecutionError(automationId) {
  return `automation cancelled before execution: ${automationId}`;
}

export async function guardQueuedAutomationExecution(event, deps = {}) {
  const txHash = trimString(event?.txHash || "");
  if (!txHash) return { blocked: false, run: null, job: null };

  const fetchRun = deps.fetchAutomationRunByQueueTxHash || fetchAutomationRunByQueueTxHash;
  const fetchJob = deps.fetchAutomationJobById || fetchAutomationJobById;
  const patchRun = deps.patchAutomationRunByQueueTxHash || patchAutomationRunByQueueTxHash;

  const run = await fetchRun(txHash);
  if (!run) return { blocked: false, run: null, job: null };

  const automationId = trimString(run.automation_id || "");
  if (!automationId) {
    await patchRun(txHash, {
      status: "failed",
      error: "queued automation run missing automation_id",
    }).catch(() => undefined);
    return {
      blocked: true,
      route: "automation:invalid-queued-run",
      error: "queued automation run missing automation_id",
      automation_id: null,
      run,
      job: null,
    };
  }

  const job = await fetchJob(automationId);
  if (!job) {
    const error = `automation job missing before execution: ${automationId}`;
    await patchRun(txHash, {
      status: "failed",
      error,
    }).catch(() => undefined);
    return {
      blocked: true,
      route: "automation:missing-before-execution",
      error,
      automation_id: automationId,
      run,
      job: null,
    };
  }

  if (trimString(job.status || "") === "cancelled") {
    const error = buildCancelledExecutionError(automationId);
    await patchRun(txHash, {
      status: "failed",
      error,
    }).catch(() => undefined);
    return {
      blocked: true,
      route: "automation:cancelled-before-execution",
      error,
      automation_id: automationId,
      run,
      job,
    };
  }

  return {
    blocked: false,
    automation_id: automationId,
    run,
    job,
  };
}

export function isAutomationControlRequestType(requestType) {
  const normalized = normalizeRequestType(requestType);
  return normalized === "automation_register" || normalized === "automation_cancel";
}

export async function handleAutomationControlRequest(event, payload) {
  const normalized = normalizeRequestType(event.requestType);

  if (normalized === "automation_register") {
    const job = buildAutomationJobFromPayload(event, payload);
    await upsertAutomationJob(job);
    await persistAutomationEncryptedFields(job);
    return {
      ok: true,
      status: 200,
      body: buildRegistrationResult(job),
      route: "automation:register",
    };
  }

  if (normalized === "automation_cancel") {
    const automationId = trimString(payload?.automation_id || payload?.id || "");
    if (!automationId) {
      return { ok: false, status: 400, body: { error: "automation_id required" }, route: "automation:cancel" };
    }
    const job = await fetchAutomationJobById(automationId);
    if (!job) {
      return { ok: false, status: 404, body: { error: `automation not found: ${automationId}` }, route: "automation:cancel" };
    }
    if (trimString(job.requester) !== trimString(event.requester || "")) {
      return { ok: false, status: 403, body: { error: "automation cancel requester mismatch" }, route: "automation:cancel" };
    }
    await patchAutomationJob(automationId, { status: "cancelled", next_run_at: null, last_error: null });
    return {
      ok: true,
      status: 200,
      body: buildCancellationResult(job, automationId),
      route: "automation:cancel",
    };
  }

  return null;
}

function evaluatePriceThreshold(job, record, nowMs, defaultCooldownMs) {
  const triggerConfig = isPlainObject(job.trigger_config) ? job.trigger_config : {};
  const triggerState = isPlainObject(job.trigger_state) ? job.trigger_state : {};
  const threshold = BigInt(String(triggerConfig.threshold || "0"));
  const current = BigInt(String(record.price || "0"));
  const previous = triggerState.last_observed_value !== undefined && triggerState.last_observed_value !== null && triggerState.last_observed_value !== ""
    ? BigInt(String(triggerState.last_observed_value))
    : null;
  const comparator = normalizeRequestType(triggerConfig.comparator || "");
  const cooldownMs = Number(triggerConfig.cooldown_ms ?? defaultCooldownMs ?? 0);

  let due = false;
  if (comparator === "gte") due = current >= threshold;
  if (comparator === "lte") due = current <= threshold;
  if (comparator === "cross_above") due = previous !== null && previous < threshold && current >= threshold;
  if (comparator === "cross_below") due = previous !== null && previous > threshold && current <= threshold;

  return {
    due,
    triggerReason: `${comparator}:${triggerConfig.pair}`,
    observedValue: current.toString(),
    patch: {
      trigger_state: {
        ...triggerState,
        last_observed_value: current.toString(),
        last_observed_at: new Date(nowMs).toISOString(),
        last_round_id: String(record.roundId || "0"),
      },
      next_run_at: due && cooldownMs > 0 ? new Date(nowMs + cooldownMs).toISOString() : job.next_run_at,
    },
  };
}

async function evaluateAutomationJob(config, job, nowMs, deps = {}) {
  if (job.status !== "active") return { due: false, patch: null, reason: "inactive" };

  if (job.max_executions !== null && job.max_executions !== undefined && Number(job.execution_count || 0) >= Number(job.max_executions)) {
    return {
      due: false,
      patch: { status: "completed", next_run_at: null },
      reason: "max-executions-reached",
    };
  }

  if (job.trigger_type === "one_shot" || job.trigger_type === "interval") {
    const nextRun = parseTimestamp(job.next_run_at || (isPlainObject(job.trigger_config) ? job.trigger_config.start_at : null));
    if (!nextRun) {
      return { due: false, patch: { status: "error", last_error: "invalid next_run_at" }, reason: "invalid-next-run" };
    }
    return { due: nextRun.getTime() <= nowMs, patch: null, reason: job.trigger_type };
  }

  if (job.trigger_type === "price_threshold") {
    const triggerConfig = isPlainObject(job.trigger_config) ? job.trigger_config : {};
    const feedChain = normalizeRequestType(triggerConfig.feed_chain || "") || job.chain;
    const pair = trimString(triggerConfig.pair || "");
    if (!pair) {
      return { due: false, patch: { status: "error", last_error: "price_threshold pair missing" }, reason: "invalid-pair" };
    }
    if (job.next_run_at && parseTimestamp(job.next_run_at)?.getTime() > nowMs) {
      return { due: false, patch: null, reason: "cooldown" };
    }
    const loadNeoXFeedRecord = deps.fetchNeoXFeedRecord || fetchNeoXFeedRecord;
    const loadNeoN3FeedRecord = deps.fetchNeoN3FeedRecord || fetchNeoN3FeedRecord;
    const record = feedChain === "neo_x"
      ? await loadNeoXFeedRecord(config, pair)
      : await loadNeoN3FeedRecord(config, pair);
    return evaluatePriceThreshold(job, record, nowMs, config.automation.defaultPriceCooldownMs);
  }

  return { due: false, patch: { status: "error", last_error: `unsupported trigger type: ${job.trigger_type}` }, reason: "unsupported-trigger" };
}

function computeNextIntervalRun(job, nowMs) {
  const triggerConfig = isPlainObject(job.trigger_config) ? job.trigger_config : {};
  const intervalMs = Number(triggerConfig.interval_ms || 0);
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return null;
  return new Date(nowMs + intervalMs).toISOString();
}

function classifyAutomationExecutionFailure(error) {
  const message = trimString(error instanceof Error ? error.message : String(error));
  const normalized = message.toLowerCase();

  // These failures are terminal for the current job state and should stop
  // scheduler retries until an operator/user explicitly reactivates the job.
  if (normalized.includes("request fee not paid")) {
    return {
      terminal: true,
      patch: {
        status: "error",
        next_run_at: null,
        last_error: message,
      },
    };
  }

  return {
    terminal: false,
    patch: {
      last_error: message,
    },
  };
}

function buildAutomationQueueRequestId(job) {
  const nextExecutionCount = Number(job.execution_count || 0) + 1;
  return `automation:${job.chain}:${job.automation_id}:${nextExecutionCount}`;
}

async function queueAutomationExecution(config, job, deps = {}) {
  const payloadText = stringifyExecutionPayload(job.execution_payload || {});
  const requestId = buildAutomationQueueRequestId(job);
  const queueNeoX = deps.queueNeoXAutomationRequest || queueNeoXAutomationRequest;
  const queueNeoN3 = deps.queueNeoN3AutomationRequest || queueNeoN3AutomationRequest;
  if (job.chain === "neo_x") {
    return queueNeoX(
      config,
      job.requester,
      job.execution_request_type,
      payloadText,
      job.callback_contract,
      job.callback_method,
      requestId,
    );
  }
  return queueNeoN3(
    config,
    job.requester,
    job.execution_request_type,
    payloadText,
    job.callback_contract,
    job.callback_method,
    requestId,
  );
}

export async function processAutomationJobs(config, logger, deps = {}) {
  if (!config.automation.enabled) {
    return { queued: 0, skipped: 0, failed: 0, inspected: 0 };
  }

  const fetchJobs = deps.fetchActiveAutomationJobs || fetchActiveAutomationJobs;
  const patchJob = deps.patchAutomationJob || patchAutomationJob;
  const recordRun = deps.insertAutomationRun || insertAutomationRun;
  let jobs;
  try {
    jobs = await fetchJobs(config.automation.batchSize, new Date().toISOString());
  } catch (error) {
    logger.warn({ error }, "Supabase automation fetch unavailable; skipping automation tick");
    return { queued: 0, skipped: 0, failed: 0, inspected: 0 };
  }

  let queued = 0;
  let skipped = 0;
  let failed = 0;
  const nowMs = Date.now();

  for (const job of jobs) {
    if (queued >= config.automation.maxQueuedPerTick) break;

    try {
      const evaluation = await evaluateAutomationJob(config, job, nowMs, deps);
      if (evaluation.patch) {
        await patchJob(job.automation_id, evaluation.patch);
      }
      if (!evaluation.due) {
        skipped += 1;
        continue;
      }

      const queuedTx = await queueAutomationExecution(config, job, deps);
      if (queuedTx?.duplicate) {
        skipped += 1;
        continue;
      }
      await recordRun({
        automation_id: job.automation_id,
        queued_request_id: queuedTx?.request_id || null,
        chain: job.chain,
        status: "queued",
        trigger_reason: evaluation.triggerReason || job.trigger_type,
        observed_value: evaluation.observedValue || null,
        queue_tx: queuedTx,
        error: null,
      });

      const nextExecutionCount = Number(job.execution_count || 0) + 1;
      let nextStatus = "active";
      let nextRunAt = job.next_run_at;
      if (job.trigger_type === "one_shot") {
        nextStatus = "completed";
        nextRunAt = null;
      } else if (job.trigger_type === "interval") {
        nextRunAt = computeNextIntervalRun(job, nowMs);
      } else if (evaluation.patch?.next_run_at !== undefined) {
        nextRunAt = evaluation.patch.next_run_at;
      }
      if (job.max_executions !== null && job.max_executions !== undefined && nextExecutionCount >= Number(job.max_executions)) {
        nextStatus = "completed";
        nextRunAt = null;
      }

      await patchJob(job.automation_id, {
        ...evaluation.patch,
        execution_count: nextExecutionCount,
        last_run_at: new Date(nowMs).toISOString(),
        last_queued_request_id: queuedTx?.request_id || null,
        next_run_at: nextRunAt,
        status: nextStatus,
        last_error: null,
      });
      queued += 1;
    } catch (error) {
      failed += 1;
      const failure = classifyAutomationExecutionFailure(error);
      await patchJob(job.automation_id, failure.patch).catch(() => undefined);
      await recordRun({
        automation_id: job.automation_id,
        queued_request_id: null,
        chain: job.chain,
        status: "failed",
        trigger_reason: job.trigger_type,
        observed_value: null,
        queue_tx: null,
        error: error instanceof Error ? error.message : String(error),
      }).catch(() => undefined);
      logger.warn({ automation_id: job.automation_id, error }, "Automation job processing failed");
    }
  }

  return { queued, skipped, failed, inspected: jobs.length };
}
