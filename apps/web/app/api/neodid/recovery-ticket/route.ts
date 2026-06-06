import {
  dispatchToControlPlane,
  shouldDispatchToControlPlane,
  shouldUseControlPlaneFallback,
} from '@/lib/control-plane';
import { proxyToNitro } from '@/lib/nitro';

export async function POST(request: Request) {
  const body = await request.text();
  if (shouldDispatchToControlPlane('/neodid/recovery-ticket')) {
    const controlPlaneResponse = await dispatchToControlPlane(
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
    if (!shouldUseControlPlaneFallback(controlPlaneResponse)) {
      return controlPlaneResponse;
    }
  }
  return proxyToNitro(
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
