import { isAuthorizedControlPlaneRequest } from '@/lib/control-plane-auth';
import { appConfig } from '@/lib/config';

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

function resolveNetwork(value: unknown) {
  return trimString(value) === 'mainnet' ? 'mainnet' : 'testnet';
}

export async function POST(request: Request) {
  if (!isAuthorizedControlPlaneRequest(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!isPlainObject(body)) return badRequest('invalid JSON body');
  if (!appConfig.controlPlaneUrl) return badRequest('MORPHEUS_CONTROL_PLANE_URL is not configured', 500);

  const headers = new Headers({ 'content-type': 'application/json' });
  if (appConfig.controlPlaneApiKey) {
    headers.set('authorization', `Bearer ${appConfig.controlPlaneApiKey}`);
    headers.set('x-admin-api-key', appConfig.controlPlaneApiKey);
  }

  const network = resolveNetwork(body.network);
  const response = await fetch(
    `${appConfig.controlPlaneUrl.replace(/\/$/, '')}/${network}/automation/execute`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store',
    }
  );
  const text = await response.text();
  return new Response(text, {
    status: response.status,
    headers: { 'content-type': response.headers.get('content-type') || 'application/json' },
  });
}
