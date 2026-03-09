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
  const limit = Math.max(Number(url.searchParams.get("limit") || 20), 1);

  const { data, error } = await supabase
    .from("morpheus_relayer_jobs")
    .select("id, event_key, chain, request_id, request_type, tx_hash, block_number, route, status, attempts, last_error, worker_status, updated_at, completed_at, created_at")
    .eq("status", "exhausted")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) return badRequest(error.message, 500);
  return Response.json({ dead_letters: data || [] });
}
