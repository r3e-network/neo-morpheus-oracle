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
  const limit = Math.max(Number(url.searchParams.get("limit") || 10), 1);

  const { data, error } = await supabase
    .from("morpheus_relayer_runs")
    .select("id, network, status, started_at, completed_at, duration_ms, metrics, checkpoints, runtime, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return badRequest(error.message, 500);
  return Response.json({ runs: data || [], latest: data?.[0] || null });
}
