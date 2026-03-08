import { getServerSupabaseClient, isAuthorizedAdminRequest } from "@/lib/server-supabase";

function badRequest(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireAdmin(request: Request) {
  if (isAuthorizedAdminRequest(request)) return null;
  return badRequest("unauthorized", 401);
}

async function resolveProjectId(
  supabase: NonNullable<ReturnType<typeof getServerSupabaseClient>>,
  projectSlug: string,
) {
  const { data, error } = await supabase
    .from("morpheus_projects")
    .select("id, slug")
    .eq("slug", projectSlug)
    .maybeSingle();
  if (error) throw error;
  return data?.id || null;
}

export async function GET(request: Request) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;

  const supabase = getServerSupabaseClient();
  if (!supabase) return badRequest("Supabase server configuration missing", 500);

  const url = new URL(request.url);
  const projectSlug = (url.searchParams.get("project_slug") || "demo").trim();
  const projectId = await resolveProjectId(supabase, projectSlug);
  if (!projectId) return badRequest(`project not found: ${projectSlug}`, 404);

  const { data, error } = await supabase
    .from("morpheus_provider_configs")
    .select("provider_id, enabled, config, created_at, updated_at")
    .eq("project_id", projectId)
    .order("provider_id");

  if (error) return badRequest(error.message, 500);
  return Response.json({ project_slug: projectSlug, configs: data || [] });
}

export async function POST(request: Request) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;

  const supabase = getServerSupabaseClient();
  if (!supabase) return badRequest("Supabase server configuration missing", 500);

  const body = await request.json().catch(() => null);
  if (!isPlainObject(body)) return badRequest("invalid JSON body");

  const projectSlug = String(body.project_slug || "demo").trim();
  const providerId = String(body.provider_id || "").trim();
  const enabled = body.enabled !== false;
  const config = body.config === undefined ? {} : body.config;
  if (!projectSlug) return badRequest("project_slug required");
  if (!providerId) return badRequest("provider_id required");
  if (!isPlainObject(config)) return badRequest("config must be a JSON object");

  const projectId = await resolveProjectId(supabase, projectSlug);
  if (!projectId) return badRequest(`project not found: ${projectSlug}`, 404);

  const payload = {
    project_id: projectId,
    provider_id: providerId,
    enabled,
    config,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("morpheus_provider_configs")
    .upsert(payload, { onConflict: "project_id,provider_id" })
    .select("provider_id, enabled, config, updated_at")
    .single();

  if (error) return badRequest(error.message, 500);
  return Response.json({ ok: true, config: data });
}

export async function DELETE(request: Request) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;

  const supabase = getServerSupabaseClient();
  if (!supabase) return badRequest("Supabase server configuration missing", 500);

  const url = new URL(request.url);
  const projectSlug = (url.searchParams.get("project_slug") || "demo").trim();
  const providerId = (url.searchParams.get("provider_id") || "").trim();
  if (!providerId) return badRequest("provider_id required");

  const projectId = await resolveProjectId(supabase, projectSlug);
  if (!projectId) return badRequest(`project not found: ${projectSlug}`, 404);

  const { error } = await supabase
    .from("morpheus_provider_configs")
    .delete()
    .eq("project_id", projectId)
    .eq("provider_id", providerId);

  if (error) return badRequest(error.message, 500);
  return Response.json({ ok: true });
}
