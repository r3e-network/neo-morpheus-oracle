import { proxyToPhala } from '@/lib/phala';
import { recordOperationLog } from '@/lib/operation-logs';
import { isAuthorizedAdminRequest } from '@/lib/server-supabase';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST(request: Request) {
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
    await recordOperationLog({
      route: '/api/relay/transaction',
      method: 'POST',
      category: 'relay',
      requestPayload: parsed,
      responsePayload: { error: 'target_chain must be neo_n3' },
      httpStatus: 400,
      error: 'target_chain must be neo_n3',
    });
    return Response.json({ error: 'target_chain must be neo_n3' }, { status: 400 });
  }
  if (!isAuthorizedAdminRequest(request, 'relay_transaction')) {
    await recordOperationLog({
      route: '/api/relay/transaction',
      method: 'POST',
      category: 'relay',
      requestPayload: parsed,
      responsePayload: { error: 'unauthorized' },
      httpStatus: 401,
      error: 'unauthorized',
    });
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  return proxyToPhala(
    '/relay/transaction',
    { method: 'POST', body },
    {
      route: '/api/relay/transaction',
      category: 'relay',
      requestPayload: parsed,
    }
  );
}
