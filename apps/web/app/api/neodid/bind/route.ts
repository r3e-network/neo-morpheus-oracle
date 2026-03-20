import { dispatchToControlPlane, shouldDispatchToControlPlane } from '@/lib/control-plane';
import { proxyToPhala } from '@/lib/phala';

export async function POST(request: Request) {
  const body = await request.text();
  if (shouldDispatchToControlPlane('/neodid/bind')) {
    return dispatchToControlPlane(
      '/neodid/bind',
      {
        method: 'POST',
        body,
        headers: { 'content-type': 'application/json' },
      },
      {
        route: '/api/neodid/bind',
        category: 'system',
        requestPayload: body,
      }
    );
  }
  return proxyToPhala(
    '/neodid/bind',
    {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json' },
    },
    {
      route: '/api/neodid/bind',
      category: 'system',
      requestPayload: body,
    }
  );
}
