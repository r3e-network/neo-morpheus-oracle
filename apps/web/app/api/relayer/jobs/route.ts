import { getServerSupabaseClient, isAuthorizedAdminRequest } from "@/lib/server-supabase";

function badRequest(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function requireAdmin(request: Request) {
  if (isAuthorizedAdminRequest(request)) return null;
  return badRequest("unauthorized", 401);
}

export async function GET(request: Request) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;

  const supabase = getServerSupabaseClient();
  if (!supabase) return badRequest("Supabase server configuration missing", 500);

  const url = new URL(request.url);
  const limit = Math.max(Number(url.searchParams.get("limit") || 50), 1);
  const status = (url.searchParams.get("status") || "").trim();
  const chain = (url.searchParams.get("chain") || "").trim();

  let query = supabase
    .from("morpheus_relayer_jobs")
    .select("id, event_key, chain, request_id, request_type, tx_hash, block_number, route, status, attempts, last_error, next_retry_at, worker_status, fulfill_tx, updated_at, completed_at, created_at")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("status", status);
  if (chain) query = query.eq("chain", chain);

  const { data, error } = await query;
  if (error) return badRequest(error.message, 500);
  return Response.json({ jobs: data || [] });
}
