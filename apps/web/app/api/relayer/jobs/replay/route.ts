import { getServerSupabaseClient, isAuthorizedAdminRequest, resolveSupabaseNetwork } from "@/lib/server-supabase";
import { recordOperationLog } from "@/lib/operation-logs";

function badRequest(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function requireAdmin(request: Request) {
  if (isAuthorizedAdminRequest(request, "relayer_ops")) return null;
  return badRequest("unauthorized", 401);
}

export async function POST(request: Request) {
  const unauthorized = requireAdmin(request);
  const body = await request.json().catch(() => null);
  if (unauthorized) {
    await recordOperationLog({
      route: "/api/relayer/jobs/replay",
      method: "POST",
      category: "relayer",
      requestPayload: body,
      responsePayload: { error: "unauthorized" },
      httpStatus: 401,
      error: "unauthorized",
    });
    return unauthorized;
  }

  const supabase = getServerSupabaseClient();
  if (!supabase) return badRequest("Supabase server configuration missing", 500);

  const eventKey = typeof body?.event_key === "string" ? body.event_key.trim() : "";
  const network = resolveSupabaseNetwork(String(body?.network || ""));
  if (!eventKey) return badRequest("event_key required");

  const { data: existing, error: existingError } = await supabase
    .from("morpheus_relayer_jobs")
    .select("id, event_key, status, event")
    .eq("network", network)
    .eq("event_key", eventKey)
    .maybeSingle();

  if (existingError) return badRequest(existingError.message, 500);
  if (!existing) return badRequest(`job not found: ${eventKey}`, 404);
  if (!existing.event) return badRequest("job has no event payload to replay", 400);

  const { error } = await supabase
    .from("morpheus_relayer_jobs")
    .update({
      status: "manual_replay_requested",
      attempts: 0,
      next_retry_at: new Date().toISOString(),
      completed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("network", network)
    .eq("event_key", eventKey);

  if (error) {
    await recordOperationLog({
      route: "/api/relayer/jobs/replay",
      method: "POST",
      category: "relayer",
      requestPayload: body,
      responsePayload: { error: error.message },
      httpStatus: 500,
      error: error.message,
    });
    return badRequest(error.message, 500);
  }
  const responseBody = { ok: true, network, event_key: eventKey, action: "manual_replay_requested" };
  await recordOperationLog({
    route: "/api/relayer/jobs/replay",
    method: "POST",
    category: "relayer",
    requestPayload: body,
    responsePayload: responseBody,
    httpStatus: 200,
  });
  return Response.json(responseBody);
}
