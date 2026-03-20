import { trimString, withMorpheusNetworkContext } from '@/lib/control-plane-execution';
import { isAuthorizedControlPlaneRequest } from '@/lib/control-plane-auth';

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

  const body = await request.json().catch(() => ({}));
  if (!isPlainObject(body)) return badRequest('invalid JSON body');

  const network = trimString(body.network || 'testnet') === 'mainnet' ? 'mainnet' : 'testnet';
  const payload = {
    target_chain: trimString(body.target_chain || 'neo_n3'),
    project_slug: trimString(body.project_slug || '') || undefined,
    provider: trimString(body.provider || '') || undefined,
    providers: Array.isArray(body.providers)
      ? body.providers.map((entry) => trimString(entry)).filter(Boolean)
      : undefined,
    symbols: Array.isArray(body.symbols)
      ? body.symbols.map((entry) => trimString(entry)).filter(Boolean)
      : undefined,
    wait: false,
  };

  const result = await withMorpheusNetworkContext(network, async () => {
    const modulePath = '../../../../../../../workers/phala-worker/src/oracle/feeds.js';
    const feeds = (await import(modulePath)) as {
      handleOracleFeed: (payload: Record<string, unknown>) => Promise<Response>;
    };
    const response = await feeds.handleOracleFeed(payload);
    const bodyJson = await response.json();
    return {
      ok: response.ok,
      ...bodyJson,
    };
  });

  return Response.json(result, { status: result.ok ? 200 : 502 });
}
