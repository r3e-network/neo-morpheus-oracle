import {
  json,
  parseBodyMaybe,
  requestLog,
  sanitizeErrorMessage,
  trimString,
} from './platform/core.js';
import { requireAuth } from './platform/auth.js';
import { buildDstackAttestation, getDstackInfo } from './platform/dstack.js';
import { acquireOverloadSlot, snapshotOverloadState } from './platform/overload-guard.js';
import { applyRequestGuards, persistGuardResult } from './platform/request-guards.js';
import { normalizeExecutionPlan } from './platform/execution-plan.js';
import { buildResultEnvelope } from './platform/result-envelope.js';
import { resolveCapability, listCapabilityFeatures } from './capabilities.js';

function resolveActiveTargetChains() {
  const raw = String(process.env.MORPHEUS_ACTIVE_CHAINS || '').trim();
  if (!raw) return ['neo_n3'];
  const chains = raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry === 'neo_n3' || entry === 'neo_x');
  return chains.length > 0 ? chains : ['neo_n3'];
}

function handleHealth() {
  const targetChains = resolveActiveTargetChains();
  return json(200, {
    status: 'ok',
    runtime: 'phala-worker',
    oracle: {
      privacy_oracle: true,
      target_chains: targetChains,
      pricefeed_chain: 'neo_n3',
      compute_merged_into_oracle: true,
    },
    features: listCapabilityFeatures(),
  });
}

function resolveExecutionPlan(resolved, path, payload) {
  const workflowId = trimString(
    payload.workflow_id || payload.workflowId || resolved?.capability?.workflow?.id || ''
  );
  const executionId = trimString(payload.execution_id || payload.executionId || '');
  if (!workflowId || !executionId) return null;

  return normalizeExecutionPlan({
    workflow_id: workflowId,
    workflow_version:
      payload.workflow_version || payload.workflowVersion || resolved?.capability?.workflow?.version,
    execution_id: executionId,
    network: payload.network,
    provider_refs: payload.provider_refs || payload.providerRefs,
    sealed_inputs: payload.sealed_inputs || payload.sealedInputs,
    step_list: payload.step_list || payload.stepList,
    payload,
    route: path,
  });
}

async function parseResponseOutput(response) {
  try {
    const cloned = response.clone();
    const text = await cloned.text();
    if (!text) return null;
    return parseBodyMaybe(text, cloned.headers.get('content-type')) ?? { raw: text };
  } catch {
    return null;
  }
}

async function wrapWorkflowResponse(response, executionPlan) {
  if (!executionPlan) return response;
  const output = await parseResponseOutput(response);
  return json(
    response.status,
    buildResultEnvelope(
      executionPlan,
      {
        ok: response.ok,
        error:
          !response.ok && output && typeof output === 'object' ? trimString(output.error || '') : '',
      },
      output
    )
  );
}

export default async function handler(request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, '');
  const payload =
    request.method === 'GET'
      ? Object.fromEntries(url.searchParams.entries())
      : await request.json().catch(() => ({}));

  let executionPlan = null;

  try {
    if (path.endsWith('/health')) return handleHealth();
    if (path.endsWith('/info')) {
      return json(200, {
        dstack: await getDstackInfo({ required: false }),
        overload: snapshotOverloadState(),
      });
    }
    if (path.endsWith('/attestation')) {
      const reportData =
        payload.report_data ||
        payload.reportData ||
        payload.output_hash ||
        payload.message ||
        'morpheus-attestation';
      return json(200, {
        attestation: await buildDstackAttestation(reportData, { required: false }),
      });
    }

    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const guards = await applyRequestGuards({ request, path, payload });
    if (!guards.ok) return guards.response;
    const overload = acquireOverloadSlot(path);
    if (!overload.ok) return overload.response;

    try {
      const resolved = resolveCapability(path, payload);
      let response;
      if (resolved) {
        executionPlan = resolveExecutionPlan(resolved, path, payload);
        const start = Date.now();
        requestLog('info', 'request', {
          capability: resolved.capability.id,
          method: request.method,
          path,
          workflow_id: executionPlan?.workflow_id || null,
          execution_id: executionPlan?.execution_id || null,
        });
        response = await resolved.capability.handler({
          path,
          url,
          payload,
          request,
          executionPlan,
        });
        response = await wrapWorkflowResponse(response, executionPlan);
        requestLog('info', 'response', {
          capability: resolved.capability.id,
          status: response.status,
          latency_ms: Date.now() - start,
          workflow_id: executionPlan?.workflow_id || null,
          execution_id: executionPlan?.execution_id || null,
        });
      } else {
        response = json(404, { error: 'not found', path });
      }
      await persistGuardResult(guards, response);
      return response;
    } finally {
      overload.release();
    }
  } catch (error) {
    const message = sanitizeErrorMessage(error);
    if (executionPlan) {
      return json(
        400,
        buildResultEnvelope(
          executionPlan,
          {
            ok: false,
            error: message,
          },
          { error: message }
        )
      );
    }
    return json(400, { error: message });
  }
}
