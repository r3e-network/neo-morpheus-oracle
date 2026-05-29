import { getServerSupabaseClient, resolveSupabaseNetwork } from '@/lib/server-supabase';
import { recordOperationLog } from '@/lib/operation-logs';
import { badRequest } from '@/lib/api-helpers';
import { logRelayerUnauthorized, requireRelayerAdmin } from '@/lib/relayer-auth';

export async function GET(request: Request) {
  const unauthorized = requireRelayerAdmin(request);
  if (unauthorized) {
    await logRelayerUnauthorized(
      '/api/relayer/jobs',
      'GET',
      Object.fromEntries(new URL(request.url).searchParams.entries())
    );
    return unauthorized;
  }

  const supabase = getServerSupabaseClient();
  if (!supabase) return badRequest('Supabase server configuration missing', 500);

  const url = new URL(request.url);
  const limit = Math.max(Number(url.searchParams.get('limit') || 50), 1);
  const network = resolveSupabaseNetwork(url.searchParams.get('network'));
  const status = (url.searchParams.get('status') || '').trim();
  const chain = (url.searchParams.get('chain') || '').trim();

  let query = supabase
    .from('morpheus_relayer_jobs')
    .select(
      'id, event_key, chain, request_id, request_type, tx_hash, block_number, route, status, attempts, last_error, next_retry_at, worker_status, fulfill_tx, updated_at, completed_at, created_at'
    )
    .eq('network', network)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (status) query = query.eq('status', status);
  if (chain) query = query.eq('chain', chain);

  const { data, error } = await query;
  if (error) {
    await recordOperationLog({
      route: '/api/relayer/jobs',
      method: 'GET',
      category: 'relayer',
      requestPayload: Object.fromEntries(url.searchParams.entries()),
      responsePayload: { error: error.message },
      httpStatus: 500,
      error: error.message,
    });
    return badRequest(error.message, 500);
  }
  const body = { network, jobs: data || [] };
  await recordOperationLog({
    route: '/api/relayer/jobs',
    method: 'GET',
    category: 'relayer',
    requestPayload: Object.fromEntries(url.searchParams.entries()),
    responsePayload: body,
    httpStatus: 200,
  });
  return Response.json(body);
}
