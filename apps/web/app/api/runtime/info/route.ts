import { getPublicWorkflowCatalog } from '@/lib/workflow-runtime';
import { buildStaticRuntimeInfo } from '@/lib/runtime-health';

// Re-homed (2026-06): the box does not serve /info publicly and dstack metadata is
// not on-chain, so serve the configured enclave identity (labeled source:'config')
// instead of proxying the retired runtime.
export async function GET() {
  const catalog = getPublicWorkflowCatalog() as { envelope?: { version?: string } };
  const version = catalog?.envelope?.version || null;
  return Response.json(buildStaticRuntimeInfo(version), {
    headers: { 'cache-control': 'public, max-age=60' },
  });
}
