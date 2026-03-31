import { WorkflowEntrypoint } from '../workflow-runtime.mjs';
import { trimString } from '@neo-morpheus-oracle/shared/utils';
import { patchJob, loadJob } from './jobs.js';
import { resolveNeoN3BackendSigner, callAppBackend } from './execution-plane.js';

export class CallbackBroadcastWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const payload = event.payload && typeof event.payload === 'object' ? event.payload : {};
    const jobId = trimString(payload.job_id || '');
    const network = trimString(payload.network) === 'mainnet' ? 'mainnet' : 'testnet';
    if (!jobId) {
      throw new Error('job_id is required');
    }

    const job = await step.do('load callback broadcast job', async () =>
      loadJob(this.env, jobId, network)
    );
    if (!job) {
      throw new Error(`job not found: ${jobId}`);
    }

    await step.do('mark callback broadcast processing', async () =>
      patchJob(this.env, jobId, network, {
        status: 'processing',
        error: null,
        started_at: job.started_at || new Date().toISOString(),
        metadata: {
          ...(job.metadata || {}),
          workflow_name: 'callback_broadcast',
          workflow_binding: 'CALLBACK_BROADCAST_WORKFLOW',
          workflow_runtime: 'cloudflare-workflows',
        },
      })
    );

    try {
      const signer = resolveNeoN3BackendSigner(this.env, network);
      const result = await step.do(
        'execute callback broadcast',
        {
          retries: { limit: 5, delay: '30 seconds', backoff: 'exponential' },
        },
        async () =>
          callAppBackend(this.env, '/api/internal/control-plane/callback-broadcast', {
            ...(job.payload || {}),
            network,
            ...signer,
          })
      );

      if (!result.ok) {
        throw new Error(
          trimString(result.body?.error || result.body?.message || '') ||
            `callback broadcast failed with status ${result.status}`
        );
      }

      await step.do('mark callback broadcast success', async () =>
        patchJob(this.env, jobId, network, {
          status: 'succeeded',
          result: result.body,
          error: null,
          completed_at: new Date().toISOString(),
          metadata: {
            ...(job.metadata || {}),
            backend_status: result.status,
            backend_url: result.backend_url,
            workflow_name: 'callback_broadcast',
            workflow_binding: 'CALLBACK_BROADCAST_WORKFLOW',
            workflow_runtime: 'cloudflare-workflows',
          },
        })
      );

      return {
        ok: true,
        workflow: 'callback_broadcast',
        job_id: jobId,
        network,
        result: result.body,
      };
    } catch (error) {
      await step.do('mark callback broadcast failure', async () =>
        patchJob(this.env, jobId, network, {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          completed_at: new Date().toISOString(),
          metadata: {
            ...(job.metadata || {}),
            workflow_name: 'callback_broadcast',
            workflow_binding: 'CALLBACK_BROADCAST_WORKFLOW',
            workflow_runtime: 'cloudflare-workflows',
          },
        })
      );
      throw error;
    }
  }
}

export class AutomationExecuteWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const payload = event.payload && typeof event.payload === 'object' ? event.payload : {};
    const jobId = trimString(payload.job_id || '');
    const network = trimString(payload.network) === 'mainnet' ? 'mainnet' : 'testnet';
    if (!jobId) {
      throw new Error('job_id is required');
    }

    const job = await step.do('load automation execute job', async () =>
      loadJob(this.env, jobId, network)
    );
    if (!job) {
      throw new Error(`job not found: ${jobId}`);
    }

    await step.do('mark automation execute processing', async () =>
      patchJob(this.env, jobId, network, {
        status: 'processing',
        error: null,
        started_at: job.started_at || new Date().toISOString(),
        metadata: {
          ...(job.metadata || {}),
          workflow_name: 'automation_execute',
          workflow_binding: 'AUTOMATION_EXECUTE_WORKFLOW',
          workflow_runtime: 'cloudflare-workflows',
        },
      })
    );

    try {
      const automationId = trimString(job.payload?.automation_id || job.payload?.id || '');
      if (!automationId) {
        throw new Error('automation_id is required');
      }
      const signer = resolveNeoN3BackendSigner(this.env, network);
      const result = await step.do(
        'execute automation queueing',
        {
          retries: { limit: 5, delay: '30 seconds', backoff: 'exponential' },
        },
        async () =>
          callAppBackend(this.env, '/api/internal/control-plane/automation-execute', {
            automation_id: automationId,
            network,
            ...signer,
          })
      );

      if (!result.ok) {
        throw new Error(
          trimString(result.body?.error || result.body?.message || '') ||
            `automation execute failed with status ${result.status}`
        );
      }

      await step.do('mark automation execute success', async () =>
        patchJob(this.env, jobId, network, {
          status: 'succeeded',
          result: result.body,
          error: null,
          completed_at: new Date().toISOString(),
          metadata: {
            ...(job.metadata || {}),
            backend_status: result.status,
            backend_url: result.backend_url,
            workflow_name: 'automation_execute',
            workflow_binding: 'AUTOMATION_EXECUTE_WORKFLOW',
            workflow_runtime: 'cloudflare-workflows',
          },
        })
      );

      return {
        ok: true,
        workflow: 'automation_execute',
        job_id: jobId,
        network,
        result: result.body,
      };
    } catch (error) {
      await step.do('mark automation execute failure', async () =>
        patchJob(this.env, jobId, network, {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          completed_at: new Date().toISOString(),
          metadata: {
            ...(job.metadata || {}),
            workflow_name: 'automation_execute',
            workflow_binding: 'AUTOMATION_EXECUTE_WORKFLOW',
            workflow_runtime: 'cloudflare-workflows',
          },
        })
      );
      throw error;
    }
  }
}
