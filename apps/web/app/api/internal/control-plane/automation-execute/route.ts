import { isAuthorizedControlPlaneRequest } from '@/lib/control-plane-auth';
import {
  fetchAutomationJobForBackend,
  patchAutomationJobForBackend,
  queueNeoN3AutomationViaBackend,
  recordAutomationRunForBackend,
  resolveControlPlaneNetwork,
} from '@/lib/neo-control-plane';

export const runtime = 'nodejs';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function badRequest(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function parseTimestamp(value: unknown) {
  const text = trimString(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function readSignerMaterial(body: Record<string, unknown>) {
  const wif = trimString(body.wif || '');
  const private_key = trimString(body.private_key || body.privateKey || '');
  return {
    ...(wif ? { wif } : {}),
    ...(private_key ? { private_key } : {}),
  };
}

export async function POST(request: Request) {
  if (!isAuthorizedControlPlaneRequest(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!isPlainObject(body)) return badRequest('invalid JSON body');

  const automationId = trimString(body.automation_id || body.id || '');
  if (!automationId) return badRequest('automation_id is required');

  const network = resolveControlPlaneNetwork(trimString(body.network || 'testnet'));

  try {
    const job = await fetchAutomationJobForBackend(network, automationId);
    if (!job) {
      return Response.json({ error: `automation not found: ${automationId}` }, { status: 404 });
    }

    const currentStatus = trimString(job.status || '');
    if (currentStatus !== 'active') {
      return Response.json({
        ok: true,
        network,
        automation_id: automationId,
        job_status: currentStatus || null,
        queued: false,
        reason: 'inactive',
      });
    }

    const nextRunAt = parseTimestamp(job.next_run_at);
    if (nextRunAt && nextRunAt.getTime() > Date.now()) {
      return Response.json({
        ok: true,
        network,
        automation_id: automationId,
        job_status: currentStatus,
        queued: false,
        reason: 'not-due',
        next_run_at: nextRunAt.toISOString(),
      });
    }

    if (trimString(job.chain || '') !== 'neo_n3') {
      return Response.json(
        { error: 'only neo_n3 automation execution is currently implemented in app backend' },
        { status: 400 }
      );
    }

    const payloadText = JSON.stringify(
      typeof job.execution_payload === 'string' ? { raw_payload: job.execution_payload } : job.execution_payload || {}
    );
    const requestId = `automation:${job.chain}:${automationId}:${Number(job.execution_count || 0) + 1}`;

    const queueTx = await queueNeoN3AutomationViaBackend({
      network,
      requester: trimString(job.requester || ''),
      requestType: trimString(job.execution_request_type || ''),
      payloadText,
      callbackContract: trimString(job.callback_contract || ''),
      callbackMethod: trimString(job.callback_method || ''),
      requestId,
      ...readSignerMaterial(body),
    });

    await recordAutomationRunForBackend(network, {
      automation_id: automationId,
      queued_request_id: queueTx.request_id || requestId,
      chain: job.chain,
      status: 'queued',
      trigger_reason: trimString(job.trigger_type || '') || 'manual_control_plane',
      observed_value: null,
      queue_tx: queueTx,
      error: null,
    });

    const nextExecutionCount = Number(job.execution_count || 0) + 1;
    await patchAutomationJobForBackend(network, automationId, {
      execution_count: nextExecutionCount,
      last_run_at: new Date().toISOString(),
      last_queued_request_id: queueTx.request_id || requestId,
      last_error: null,
    });

    return Response.json({
      ok: true,
      network,
      automation_id: automationId,
      job_status: currentStatus,
      queued: true,
      queue_tx: queueTx,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
