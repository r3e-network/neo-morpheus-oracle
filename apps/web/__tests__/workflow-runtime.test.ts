import { describe, expect, it } from 'vitest';

describe('workflow runtime catalog', () => {
  it('returns workflow and policy metadata without secrets', async () => {
    const { getPublicWorkflowCatalog, getPublicPolicyCatalog } = await import('../lib/workflow-runtime');

    const catalog = getPublicWorkflowCatalog();
    expect(catalog.workflows.some((item) => item.id === 'compute.execute')).toBe(true);
    expect('service_role_key' in catalog).toBe(false);

    const policies = getPublicPolicyCatalog();
    expect(policies.policies.some((item) => item.id === 'risk')).toBe(true);
  });
});
