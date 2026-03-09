import { getServerSupabaseClient, isAuthorizedAdminRequest } from "@/lib/server-supabase";

function badRequest(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function requireAdmin(request: Request) {
  if (isAuthorizedAdminRequest(request)) return null;
  return badRequest("unauthorized", 401);
}

export async function POST(request: Request) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;

  const supabase = getServerSupabaseClient();
  if (!supabase) return badRequest("Supabase server configuration missing", 500);

  const body = await request.json().catch(() => null);
  const eventKey = typeof body?.event_key === "string" ? body.event_key.trim() : "";
  if (!eventKey) return badRequest("event_key required");

  const { data: existing, error: existingError } = await supabase
    .from("morpheus_relayer_jobs")
    .select("id, event_key, status, event")
    .eq("event_key", eventKey)
    .maybeSingle();

  if (existingError) return badRequest(existingError.message, 500);
  if (!existing) return badRequest(`job not found: ${eventKey}`, 404);
  if (!existing.event) return badRequest("job has no event payload to retry", 400);

  const { error } = await supabase
    .from("morpheus_relayer_jobs")
    .update({
      status: "manual_retry_requested",
      next_retry_at: new Date().toISOString(),
      completed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("event_key", eventKey);

  if (error) return badRequest(error.message, 500);
  return Response.json({ ok: true, event_key: eventKey, action: "manual_retry_requested" });
}
