import runtimeCatalog from '../public/morpheus-runtime-catalog.json';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function coerceObject(value: unknown): Record<string, unknown> {
  if (isPlainObject(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (isPlainObject(parsed)) return parsed;
    } catch {
      return {};
    }
  }
  return {};
}

function normalizeRoutePath(path: string) {
  const trimmed = trimString(path);
  if (!trimmed) return '';
  return trimmed.replace(/^\/(mainnet|testnet)(?=\/)/i, '');
}

export type PublicWorkflowCatalog = typeof runtimeCatalog;
export type PublicWorkflowDefinition = PublicWorkflowCatalog['workflows'][number];

export function getPublicWorkflowCatalog(): PublicWorkflowCatalog {
  return clone(runtimeCatalog);
}

export function getPublicPolicyCatalog() {
  const catalog = getPublicWorkflowCatalog();
  const grouped = new Map<string, { id: string; workflows: string[] }>();

  for (const workflow of catalog.workflows) {
    for (const policyId of workflow.policies) {
      const current = grouped.get(policyId) || { id: policyId, workflows: [] };
      if (!current.workflows.includes(workflow.id)) {
        current.workflows.push(workflow.id);
      }
      grouped.set(policyId, current);
    }
  }

  return {
    envelope: catalog.envelope,
    policies: Array.from(grouped.values()).sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export function getWorkflowDefinitionById(workflowId: string) {
  const normalized = trimString(workflowId);
  if (!normalized) return null;
  return getPublicWorkflowCatalog().workflows.find((item) => item.id === normalized) || null;
}

export function getWorkflowDispatchMetadata(path: string) {
  const normalizedPath = normalizeRoutePath(path);
  if (!normalizedPath) return null;

  const catalog = getPublicWorkflowCatalog();
  const workflow = catalog.workflows.find((item) => item.route === normalizedPath);
  if (!workflow) return null;

  return {
    workflowId: workflow.id,
    workflowVersion: workflow.version,
    envelopeVersion: catalog.envelope.version,
  };
}

export function decorateControlPlaneJob(job: Record<string, unknown>) {
  const metadata = coerceObject(job.metadata);
  const workflowId = trimString(job.workflow_id || metadata.workflow_id || '');
  const workflow = workflowId ? getWorkflowDefinitionById(workflowId) : null;
  const workflowVersion = Number(job.workflow_version || metadata.workflow_version || workflow?.version || 0) || null;

  return {
    ...job,
    metadata,
    workflow_id: workflowId || null,
    workflow_version: workflowVersion,
    result_envelope_version:
      trimString(job.result_envelope_version || metadata.result_envelope_version || '') ||
      runtimeCatalog.envelope.version,
    workflow: workflow
      ? {
          id: workflow.id,
          version: workflow.version,
          route: workflow.route,
          trigger: workflow.trigger,
          policies: workflow.policies,
          delivery: workflow.delivery,
        }
      : null,
  };
}
