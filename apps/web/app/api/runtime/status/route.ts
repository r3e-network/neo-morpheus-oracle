import { proxyToNitro } from '@/lib/nitro';
import { getPublicWorkflowCatalog } from '@/lib/workflow-runtime';
import {
  buildPublicRuntimeStatusSnapshot,
  type RuntimeProbeSnapshotInput,
} from '@neo-morpheus-oracle/shared/public-runtime';

function maybeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text || null;
  }
}

async function readRuntimeProbe(
  path: string,
  probe: 'health' | 'info'
): Promise<RuntimeProbeSnapshotInput> {
  const response = await proxyToNitro(
    path,
    { method: 'GET' },
    {
      route: '/api/runtime/status',
      category: 'runtime',
      metadata: { probe },
    }
  );

  return {
    ok: response.ok,
    status: response.status,
    body: maybeParseJson(await response.text()),
  };
}

export async function GET() {
  const checkedAt = new Date().toISOString();
  const [health, info] = await Promise.all([
    readRuntimeProbe('/health', 'health'),
    readRuntimeProbe('/info', 'info'),
  ]);
  const snapshot = buildPublicRuntimeStatusSnapshot({
    catalog: getPublicWorkflowCatalog(),
    checkedAt,
    health,
    info,
  });

  return Response.json(snapshot, {
    status: snapshot.runtime.status === 'down' ? 503 : 200,
    headers: {
      'cache-control': 'no-store',
    },
  });
}
