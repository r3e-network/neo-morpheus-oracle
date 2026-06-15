import { getPublicWorkflowCatalog } from '@/lib/workflow-runtime';
import { buildPublicRuntimeStatusSnapshot } from '@neo-morpheus-oracle/shared/public-runtime';
import { fetchBoxHealth, buildStaticRuntimeInfo } from '@/lib/runtime-health';

// Re-homed (2026-06): synthesize the public runtime status from trustless sources —
// the attested box /health (liveness), the configured enclave identity, and the
// static workflow catalog — via the shared snapshot assembler (kept unchanged so
// apps/web and the edge worker stay byte-compatible). No retired-runtime proxy.
export async function GET() {
  const checkedAt = new Date().toISOString();
  const catalog = getPublicWorkflowCatalog() as { envelope?: { version?: string } };
  const version = catalog?.envelope?.version || null;

  const boxHealth = await fetchBoxHealth();
  const snapshot = buildPublicRuntimeStatusSnapshot({
    catalog,
    checkedAt,
    health: { ok: boxHealth.ok, status: boxHealth.status, body: boxHealth.body },
    info: { ok: true, status: 200, body: buildStaticRuntimeInfo(version) },
  });

  return Response.json(snapshot, {
    status: snapshot.runtime.status === 'down' ? 503 : 200,
    headers: { 'cache-control': 'no-store' },
  });
}
