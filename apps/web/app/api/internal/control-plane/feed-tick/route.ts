import { runFeedSyncJob } from '@/lib/feed-sync';
import { isAuthorizedControlPlaneRequest } from '@/lib/control-plane-auth';

export const runtime = 'nodejs';

function badRequest(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST(request: Request) {
  if (!isAuthorizedControlPlaneRequest(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  if (!isPlainObject(body)) return badRequest('invalid JSON body');

  const result = await runFeedSyncJob({
    target_chain: trimString(body.target_chain || 'neo_n3'),
    project_slug: trimString(body.project_slug || '') || undefined,
    provider: trimString(body.provider || '') || undefined,
    providers: Array.isArray(body.providers)
      ? body.providers.map((entry) => trimString(entry)).filter(Boolean)
      : undefined,
    symbols: Array.isArray(body.symbols)
      ? body.symbols.map((entry) => trimString(entry)).filter(Boolean)
      : undefined,
  });

  return Response.json(result);
}
