import { dispatchToControlPlane, shouldDispatchToControlPlane } from '@/lib/control-plane';
import { proxyToPhala } from '@/lib/phala';

export async function POST(request: Request) {
  const body = await request.text();
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = { raw_body: body };
  }
  if (shouldDispatchToControlPlane('/compute/execute')) {
    return dispatchToControlPlane(
      '/compute/execute',
      { method: 'POST', body },
      {
        route: '/api/compute/execute',
        category: 'compute',
        requestPayload: parsed,
      }
    );
  }
  return proxyToPhala(
    '/compute/execute',
    { method: 'POST', body },
    {
      route: '/api/compute/execute',
      category: 'compute',
      requestPayload: parsed,
    }
  );
}
