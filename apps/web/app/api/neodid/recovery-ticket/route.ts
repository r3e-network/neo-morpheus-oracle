import {
  dispatchToControlPlane,
  shouldDispatchToControlPlane,
  shouldUseControlPlaneFallback,
} from '@/lib/control-plane';
import { proxyToNitro } from '@/lib/nitro';
import { createRateLimitedHandler } from '@/lib/rate-limit';

const handlePost = createRateLimitedHandler(
  async function POST(request: Request) {
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
  },
  { scope: 'neodid_recovery_ticket', maxRequests: 20, windowMs: 60_000 }
);

export async function POST(request: Request) {
  return handlePost(request);
}
