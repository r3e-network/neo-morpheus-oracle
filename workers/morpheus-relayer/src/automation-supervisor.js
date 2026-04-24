function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseNonNegativeInteger(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.trunc(numeric);
}

function normalizeWorkflowVersion(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 1;
  return Math.trunc(numeric);
}

export function buildUpkeepDispatch(job = {}) {
  const automationId = trimString(job.automation_id || job.automationId || '');
  if (!automationId) throw new Error('automation_id is required');

  const workflowId = trimString(job.workflow_id || job.workflowId || '') || 'automation.upkeep';
  const workflowVersion = normalizeWorkflowVersion(job.workflow_version || job.workflowVersion);
  const executionCount = parseNonNegativeInteger(job.execution_count || job.executionCount);
  const nextExecutionCount = executionCount + 1;
  const chain = trimString(job.chain || '') || 'unknown';
  const explicitExecutionId = trimString(job.execution_id || job.executionId || '');
  const executionId = explicitExecutionId || `${workflowId}:${automationId}:${nextExecutionCount}`;

  return {
    workflow_id: workflowId,
    workflow_version: workflowVersion,
    automation_id: automationId,
    execution_count: executionCount,
    next_execution_count: nextExecutionCount,
    execution_id: executionId,
    request_id:
      trimString(job.request_id || job.requestId || '') ||
      (explicitExecutionId
        ? `automation:${chain}:${explicitExecutionId}`
        : `automation:${chain}:${automationId}:${nextExecutionCount}`),
    idempotency_key:
      trimString(job.idempotency_key || job.idempotencyKey || '') ||
      `${workflowId}:${automationId}:${nextExecutionCount}`,
    replay_window: trimString(job.replay_window || job.replayWindow || '') || 'strict',
    delivery_mode: trimString(job.delivery_mode || job.deliveryMode || '') || 'onchain_callback',
  };
}

export function buildUpkeepExecutionPayload(payload = {}, job = {}) {
  const basePayload =
    payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const dispatch = buildUpkeepDispatch(job);
  return {
    ...basePayload,
    automation_id: dispatch.automation_id,
    workflow_id: dispatch.workflow_id,
    workflow_version: dispatch.workflow_version,
    execution_id: dispatch.execution_id,
    idempotency_key: dispatch.idempotency_key,
    replay_window: dispatch.replay_window,
    delivery_mode: dispatch.delivery_mode,
  };
}
