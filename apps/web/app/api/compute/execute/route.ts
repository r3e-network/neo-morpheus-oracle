import {
  dispatchToControlPlane,
  shouldDispatchToControlPlane,
  shouldUseControlPlaneFallback,
} from '@/lib/control-plane';
import { proxyToPhala } from '@/lib/phala';
import { createRateLimitedHandler } from '@/lib/rate-limit';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

const handlePost = createRateLimitedHandler(
async function POST(request: Request) {
  const body = await request.text();
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = { raw_body: body };
  }
  const targetChain =
    parsed && typeof parsed === 'object'
      ? trimString(
          (parsed as Record<string, unknown>).target_chain ||
            (parsed as Record<string, unknown>).targetChain ||
            ''
        )
      : '';
  if (targetChain && targetChain !== 'neo_n3') {
    return Response.json({ error: 'target_chain must be neo_n3' }, { status: 400 });
  }
  if (shouldDispatchToControlPlane('/compute/execute')) {
    const controlPlaneResponse = await dispatchToControlPlane(
      '/compute/execute',
      { method: 'POST', body },
      {
        route: '/api/compute/execute',
        category: 'compute',
        requestPayload: parsed,
      }
    );
    if (!shouldUseControlPlaneFallback(controlPlaneResponse)) {
      return controlPlaneResponse;
    }
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
},
{ scope: 'compute_execute', maxRequests: 20, windowMs: 60_000 }
);

export async function POST(request: Request) {
  return handlePost(request);
}
