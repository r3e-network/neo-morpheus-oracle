import { getServerSupabaseClient, isAuthorizedAdminRequest, resolveSupabaseNetwork } from "@/lib/server-supabase";
import { recordOperationLog } from "@/lib/operation-logs";

function badRequest(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function requireAdmin(request: Request) {
  if (isAuthorizedAdminRequest(request, "relayer_ops")) return null;
  return badRequest("unauthorized", 401);
}

export async function GET(request: Request) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) {
    await recordOperationLog({
      route: "/api/relayer/metrics",
      method: "GET",
      category: "relayer",
      requestPayload: Object.fromEntries(new URL(request.url).searchParams.entries()),
      responsePayload: { error: "unauthorized" },
      httpStatus: 401,
      error: "unauthorized",
    });
    return unauthorized;
  }

  const supabase = getServerSupabaseClient();
  if (!supabase) return badRequest("Supabase server configuration missing", 500);

  const url = new URL(request.url);
  const limit = Math.max(Number(url.searchParams.get("limit") || 10), 1);
  const network = resolveSupabaseNetwork(url.searchParams.get("network"));

  const { data, error } = await supabase
    .from("morpheus_relayer_runs")
    .select("id, network, status, started_at, completed_at, duration_ms, metrics, checkpoints, runtime, created_at")
    .eq("network", network)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    await recordOperationLog({
      route: "/api/relayer/metrics",
      method: "GET",
      category: "relayer",
      requestPayload: Object.fromEntries(url.searchParams.entries()),
      responsePayload: { error: error.message },
      httpStatus: 500,
      error: error.message,
    });
    return badRequest(error.message, 500);
  }
  const body = { network, runs: data || [], latest: data?.[0] || null };
  await recordOperationLog({
    route: "/api/relayer/metrics",
    method: "GET",
    category: "relayer",
    requestPayload: Object.fromEntries(url.searchParams.entries()),
    responsePayload: body,
    httpStatus: 200,
  });
  return Response.json(body);
}
