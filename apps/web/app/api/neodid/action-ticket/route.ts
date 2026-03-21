import {
  dispatchToControlPlane,
  shouldDispatchToControlPlane,
  shouldUseControlPlaneFallback,
} from '@/lib/control-plane';
import { proxyToPhala } from '@/lib/phala';

export async function POST(request: Request) {
  const body = await request.text();
  if (shouldDispatchToControlPlane('/neodid/action-ticket')) {
    const controlPlaneResponse = await dispatchToControlPlane(
      '/neodid/action-ticket',
      {
        method: 'POST',
        body,
        headers: { 'content-type': 'application/json' },
      },
      {
        route: '/api/neodid/action-ticket',
        category: 'system',
        requestPayload: body,
      }
    );
    if (!shouldUseControlPlaneFallback(controlPlaneResponse)) {
      return controlPlaneResponse;
    }
  }
  return proxyToPhala(
    '/neodid/action-ticket',
    {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json' },
    },
    {
      route: '/api/neodid/action-ticket',
      category: 'system',
      requestPayload: body,
    }
  );
}
