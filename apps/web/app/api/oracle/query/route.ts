import {
  dispatchToControlPlane,
  shouldDispatchToControlPlane,
  shouldUseControlPlaneFallback,
} from '@/lib/control-plane';
import { resolveProviderAwarePayload } from '@/lib/provider-configs';
import { recordOperationLog } from '@/lib/operation-logs';
import { proxyToPhala } from '@/lib/phala';
import { createRateLimitedHandler } from '@/lib/rate-limit';

function badRequest(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

const handlePost = createRateLimitedHandler(
async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!isPlainObject(body)) {
    await recordOperationLog({
      route: '/api/oracle/query',
      method: 'POST',
      category: 'oracle',
      requestPayload: body,
      responsePayload: { error: 'invalid JSON body' },
      httpStatus: 400,
      error: 'invalid JSON body',
    });
    return badRequest('invalid JSON body');
  }

  try {
    const resolved = await resolveProviderAwarePayload(body, {
      fallbackProviderId: !body.url && body.symbol ? 'twelvedata' : undefined,
    });
    if (shouldDispatchToControlPlane('/oracle/query')) {
      const controlPlaneResponse = await dispatchToControlPlane(
        '/oracle/query',
        {
          method: 'POST',
          body: JSON.stringify(resolved.payload),
        },
        {
          route: '/api/oracle/query',
          category: 'oracle',
          requestPayload: resolved.payload,
        }
      );
      if (!shouldUseControlPlaneFallback(controlPlaneResponse)) {
        return controlPlaneResponse;
      }
    }
    return proxyToPhala(
      '/oracle/query',
      {
        method: 'POST',
        body: JSON.stringify(resolved.payload),
      },
      {
        route: '/api/oracle/query',
        category: 'oracle',
        requestPayload: resolved.payload,
      }
    );
  } catch (error) {
    await recordOperationLog({
      route: '/api/oracle/query',
      method: 'POST',
      category: 'oracle',
      requestPayload: body,
      responsePayload: { error: error instanceof Error ? error.message : String(error) },
      httpStatus: 400,
      error: error instanceof Error ? error.message : String(error),
    });
    return badRequest(error instanceof Error ? error.message : String(error));
  }
},
{ scope: 'oracle_query', maxRequests: 30, windowMs: 60_000 }
);

export async function POST(request: Request) {
  return handlePost(request);
}
