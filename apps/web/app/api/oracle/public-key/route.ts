import { proxyToPhala } from '@/lib/phala';

async function parseResponseBody(response: Response) {
  return response.json().catch(() => ({}));
}

function shouldDegradePublicKeyStatus(status: number) {
  return status === 401 || status === 403 || status === 408 || status === 429 || status >= 500;
}

function readNetwork(request: Request) {
  return new URL(request.url).searchParams.get('network');
}

export async function GET(request: Request) {
  const network = readNetwork(request);
  const response = await proxyToPhala(
    '/oracle/public-key',
    { method: 'GET' },
    {
      route: '/api/oracle/public-key',
      category: 'oracle',
      network,
      metadata: { network },
    }
  );

  if (response.ok || !shouldDegradePublicKeyStatus(response.status)) {
    return response;
  }

  const body = await parseResponseBody(response);
  const message =
    typeof body?.error === 'string'
      ? body.error
      : typeof body?.message === 'string'
        ? body.message
        : 'oracle public key unavailable';

  return Response.json(
    {
      available: false,
      degraded: true,
      public_key: null,
      key_source: 'unavailable',
      algorithm: 'X25519-HKDF-SHA256-AES-256-GCM',
      error: 'oracle_public_key_unavailable',
      message,
      upstream_status: response.status,
    },
    {
      status: 200,
      headers: { 'x-morpheus-upstream-status': String(response.status) },
    }
  );
}
