import { dispatchToControlPlane, shouldDispatchToControlPlane } from '@/lib/control-plane';
import { proxyToPhala } from '@/lib/phala';

export async function POST(request: Request) {
  const body = await request.text();
  if (shouldDispatchToControlPlane('/neodid/recovery-ticket')) {
    return dispatchToControlPlane(
      '/neodid/recovery-ticket',
      {
        method: 'POST',
        body,
        headers: { 'content-type': 'application/json' },
      },
      {
        route: '/api/neodid/recovery-ticket',
        category: 'system',
        requestPayload: body,
      }
    );
  }
  return proxyToPhala(
    '/neodid/recovery-ticket',
    {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json' },
    },
    {
      route: '/api/neodid/recovery-ticket',
      category: 'system',
      requestPayload: body,
    }
  );
}
