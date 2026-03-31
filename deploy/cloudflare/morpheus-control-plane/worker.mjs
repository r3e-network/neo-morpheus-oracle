import { json, getClientIp } from '@neo-morpheus-oracle/shared/utils';
import { handleRootRoute, handleHealthRoute, JOB_ROUTE_CONFIG } from './lib/health.js';
import {
  resolveNetworkRoute,
  resolveJobMetadata,
  resolveRequeueLimit,
  resolveStaleProcessingMs,
} from './lib/config.js';
import { validateAuth, applyRateLimit } from './lib/auth.js';
import { insertJob, loadJob, patchJob } from './lib/jobs.js';
import { enqueueJob, listRecoverableJobs, requeueJob } from './lib/recovery.js';
import {
  dispatchWorkflowInstance,
  isWorkflowRouteConfig,
  loadWorkflowInstanceDetails,
} from './lib/workflows.js';
import { processExecutionJob, processFeedTickJob } from './lib/queue-consumer.js';
import { CallbackBroadcastWorkflow, AutomationExecuteWorkflow } from './lib/workflows-impl.js';

export { CallbackBroadcastWorkflow, AutomationExecuteWorkflow };

export default {
  async fetch(request, env) {
    const authFailure = validateAuth(request, env);
    if (authFailure) return authFailure;

    const url = new URL(request.url);
    const routing = resolveNetworkRoute(url);

    if (routing.routePath === '/' || routing.routePath === '') {
      return handleRootRoute(routing.network);
    }

    if (routing.routePath === '/health') {
      return handleHealthRoute(routing.network, env);
    }

    if (routing.routePath === '/jobs/recover') {
      if (request.method !== 'POST') {
        return json(405, { error: 'method_not_allowed' });
      }
      try {
        const limit = resolveRequeueLimit(env);
        const staleProcessingMs = resolveStaleProcessingMs(env);
        const jobs = await listRecoverableJobs(env, routing.network, limit, staleProcessingMs);
        const requeued = [];
        const skipped = [];
        const failed = [];
        for (const job of jobs) {
          try {
            const outcome = await requeueJob(env, job);
            const entry = {
              id: job.id,
              route: job.route,
              previous_status: job.status,
              action: outcome?.action || 'queue_requeued',
              workflow_instance_id: outcome?.workflow_instance_id || null,
              workflow_status: outcome?.workflow_status || null,
            };
            if (entry.action === 'queue_requeued' || entry.action === 'workflow_redispatched') {
              requeued.push(entry);
            } else {
              skipped.push(entry);
            }
          } catch (error) {
            failed.push({
              id: job.id,
              route: job.route,
              previous_status: job.status,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
        return json(200, {
          network: routing.network,
          scanned: jobs.length,
          requeued_count: requeued.length,
          skipped_count: skipped.length,
          failed_count: failed.length,
          requeued,
          skipped,
          failed,
        });
      } catch (error) {
        return json(500, { error: error instanceof Error ? error.message : String(error) });
      }
    }

    const jobMatch = routing.routePath.match(/^\/jobs\/([0-9a-f-]+)$/i);
    if (request.method === 'GET' && jobMatch) {
      try {
        const job = await loadJob(env, jobMatch[1], routing.network);
        if (!job) return json(404, { error: 'job not found' });
        const jobConfig = JOB_ROUTE_CONFIG[job.route];
        if (job?.metadata?.workflow_instance_id && isWorkflowRouteConfig(jobConfig)) {
          try {
            const workflow = await loadWorkflowInstanceDetails(
              env,
              jobConfig,
              job.metadata.workflow_instance_id
            );
            return json(200, {
              ...job,
              workflow: {
                instance_id: workflow.id,
                status: workflow.details,
              },
            });
          } catch {
            // fall back to stored job only
          }
        }
        return json(200, job);
      } catch (error) {
        return json(500, { error: error instanceof Error ? error.message : String(error) });
      }
    }

    const jobConfig = JOB_ROUTE_CONFIG[routing.routePath];
    if (!jobConfig) {
      return json(404, { error: 'not found', path: routing.routePath });
    }
    if (request.method !== 'POST') {
      return json(405, { error: 'method_not_allowed' });
    }

    const rateLimited = await applyRateLimit(request, env, jobConfig.queue);
    if (rateLimited) return rateLimited;

    const rawBody = await request.text();
    let payload = {};
    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return json(400, { error: 'invalid JSON body' });
    }

    const metadata = resolveJobMetadata(routing.routePath, payload);
    const jobId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const baseRecord = {
      id: jobId,
      network: routing.network,
      queue: jobConfig.queue,
      route: routing.routePath,
      target_chain: metadata.target_chain,
      project_slug: metadata.project_slug,
      request_id: metadata.request_id,
      status: 'queued',
      dedupe_key: metadata.dedupe_key,
      payload,
      metadata: {
        ingress_route: url.pathname,
        source: 'cloudflare-control-plane',
        client_ip: getClientIp(request),
        delivery_mode: jobConfig.delivery || 'queue',
      },
      retry_count: 0,
      created_at: createdAt,
      updated_at: createdAt,
    };

    try {
      const inserted = await insertJob(env, baseRecord);
      let updated = inserted;
      if (isWorkflowRouteConfig(jobConfig)) {
        const workflow = await dispatchWorkflowInstance(env, inserted, jobConfig);
        updated =
          (await patchJob(env, jobId, routing.network, {
            status: 'dispatched',
            metadata: {
              ...(inserted.metadata || {}),
              workflow_name: workflow.workflow_name,
              workflow_binding: workflow.workflow_binding,
              workflow_instance_id: workflow.id,
              workflow_status: workflow.details || null,
              workflow_dispatch_count: workflow.workflow_dispatch_count,
            },
          }).catch(() => null)) || inserted;
      } else {
        await enqueueJob(env, jobConfig.binding, {
          job_id: jobId,
          network: routing.network,
          queue: jobConfig.queue,
          route: routing.routePath,
          payload,
          target_chain: metadata.target_chain,
          project_slug: metadata.project_slug,
          request_id: metadata.request_id,
          created_at: createdAt,
        });
        updated =
          (await patchJob(env, jobId, routing.network, {
            status: 'dispatched',
          }).catch(() => null)) || inserted;
      }
      return json(202, updated);
    } catch (error) {
      await patchJob(env, jobId, routing.network, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        completed_at: new Date().toISOString(),
      }).catch(() => null);
      return json(503, {
        error: error instanceof Error ? error.message : String(error),
        job_id: jobId,
      });
    }
  },

  async queue(batch, env) {
    for (const message of batch.messages) {
      if (batch.queue === 'morpheus-oracle-request') {
        await processExecutionJob(message, env);
        continue;
      }
      if (batch.queue === 'morpheus-feed-tick') {
        await processFeedTickJob(message, env);
        continue;
      }
      message.ack();
    }
  },
};
