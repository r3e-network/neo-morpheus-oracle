import { buildRelayerExecutionConfig, trimString, withMorpheusNetworkContext } from '@/lib/control-plane-execution';
import { isAuthorizedControlPlaneRequest } from '@/lib/control-plane-auth';
import { resolveSupabaseNetwork } from '@/lib/server-supabase';

export const runtime = 'nodejs';

function badRequest(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export async function POST(request: Request) {
  if (!isAuthorizedControlPlaneRequest(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!isPlainObject(body)) return badRequest('invalid JSON body');

  const automationId = trimString(body.automation_id || body.id || '');
  if (!automationId) return badRequest('automation_id is required');

  const network = resolveSupabaseNetwork(trimString(body.network || 'testnet'));
  try {
    const config = await buildRelayerExecutionConfig(network);
    const automationModulePath = '../../../../../../../workers/morpheus-relayer/src/automation.js';
    const loggerModulePath = '../../../../../../../workers/morpheus-relayer/src/logger.js';
    const persistenceModulePath = '../../../../../../../workers/morpheus-relayer/src/persistence.js';
    const automationMod = (await import(automationModulePath)) as {
      processAutomationJobs: (
        config: unknown,
        logger: unknown,
        deps?: Record<string, unknown>
      ) => Promise<unknown>;
    };
    const loggerMod = (await import(loggerModulePath)) as {
      createLogger: (config: unknown) => unknown;
    };
    const persistenceMod = (await import(persistenceModulePath)) as {
      fetchAutomationJobById: (
        automationId: string
      ) => Promise<{ automation_id?: string; status?: string } | null>;
      fetchActiveAutomationJobs: (
        limit?: number,
        dueAtIso?: string | null
      ) => Promise<Array<{ automation_id?: string; status?: string }>>;
    };
    const logger = loggerMod.createLogger(config);

    const result = await withMorpheusNetworkContext(network, async () => {
      const targetJob = await persistenceMod.fetchAutomationJobById(automationId);
      if (!targetJob) return { missing: true };

      const summary = await automationMod.processAutomationJobs(config, logger, {
        fetchActiveAutomationJobs: async () => {
          const jobs = await persistenceMod.fetchActiveAutomationJobs(
            (config as { automation?: { batchSize?: number } })?.automation?.batchSize || 50,
            new Date().toISOString()
          );
          return jobs.filter(
            (job: { automation_id?: string }) => trimString(job.automation_id) === automationId
          );
        },
      });

      return {
        missing: false,
        job: targetJob,
        summary,
      };
    });

    if (result.missing) {
      return Response.json({ error: `automation not found: ${automationId}` }, { status: 404 });
    }

    return Response.json({
      ok: true,
      network,
      automation_id: automationId,
      job_status: result.job?.status || null,
      summary: result.summary,
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
