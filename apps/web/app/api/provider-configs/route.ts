import {
  getServerSupabaseClient,
  isAuthorizedAdminRequest,
  resolveProjectIdBySlug,
} from "@/lib/server-supabase";
import { recordOperationLog } from "@/lib/operation-logs";

function badRequest(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireAdmin(request: Request) {
  if (isAuthorizedAdminRequest(request, "provider_config")) return null;
  return badRequest("unauthorized", 401);
}

export async function GET(request: Request) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) {
    await recordOperationLog({
      route: "/api/provider-configs",
      method: "GET",
      category: "provider_config",
      requestPayload: Object.fromEntries(new URL(request.url).searchParams.entries()),
      responsePayload: { error: "unauthorized" },
      httpStatus: 401,
      error: "unauthorized",
    });
    return unauthorized;
  }

  const supabase = getServerSupabaseClient();
  if (!supabase) {
    await recordOperationLog({
      route: "/api/provider-configs",
      method: "GET",
      category: "provider_config",
      requestPayload: Object.fromEntries(new URL(request.url).searchParams.entries()),
      responsePayload: { error: "Supabase server configuration missing" },
      httpStatus: 500,
      error: "Supabase server configuration missing",
    });
    return badRequest("Supabase server configuration missing", 500);
  }

  const url = new URL(request.url);
  const projectSlug = (url.searchParams.get("project_slug") || "demo").trim();
  const projectId = await resolveProjectIdBySlug(supabase, projectSlug);
  if (!projectId) {
    await recordOperationLog({
      route: "/api/provider-configs",
      method: "GET",
      category: "provider_config",
      requestPayload: { project_slug: projectSlug },
      responsePayload: { error: `project not found: ${projectSlug}` },
      httpStatus: 404,
      error: `project not found: ${projectSlug}`,
    });
    return badRequest(`project not found: ${projectSlug}`, 404);
  }

  const { data, error } = await supabase
    .from("morpheus_provider_configs")
    .select("provider_id, enabled, config, created_at, updated_at")
    .eq("project_id", projectId)
    .order("provider_id");

  if (error) {
    await recordOperationLog({
      route: "/api/provider-configs",
      method: "GET",
      category: "provider_config",
      requestPayload: { project_slug: projectSlug },
      responsePayload: { error: error.message },
      httpStatus: 500,
      error: error.message,
    });
    return badRequest(error.message, 500);
  }
  const body = { project_slug: projectSlug, configs: data || [] };
  await recordOperationLog({
    route: "/api/provider-configs",
    method: "GET",
    category: "provider_config",
    requestPayload: { project_slug: projectSlug },
    responsePayload: body,
    httpStatus: 200,
  });
  return Response.json(body);
}

export async function POST(request: Request) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) {
    await recordOperationLog({
      route: "/api/provider-configs",
      method: "POST",
      category: "provider_config",
      responsePayload: { error: "unauthorized" },
      httpStatus: 401,
      error: "unauthorized",
    });
    return unauthorized;
  }

  const supabase = getServerSupabaseClient();
  if (!supabase) {
    await recordOperationLog({
      route: "/api/provider-configs",
      method: "POST",
      category: "provider_config",
      responsePayload: { error: "Supabase server configuration missing" },
      httpStatus: 500,
      error: "Supabase server configuration missing",
    });
    return badRequest("Supabase server configuration missing", 500);
  }

  const body = await request.json().catch(() => null);
  if (!isPlainObject(body)) {
    await recordOperationLog({
      route: "/api/provider-configs",
      method: "POST",
      category: "provider_config",
      requestPayload: body,
      responsePayload: { error: "invalid JSON body" },
      httpStatus: 400,
      error: "invalid JSON body",
    });
    return badRequest("invalid JSON body");
  }

  const projectSlug = String(body.project_slug || "demo").trim();
  const providerId = String(body.provider_id || "").trim();
  const enabled = body.enabled !== false;
  const config = body.config === undefined ? {} : body.config;
  if (!projectSlug) {
    await recordOperationLog({
      route: "/api/provider-configs",
      method: "POST",
      category: "provider_config",
      requestPayload: body,
      responsePayload: { error: "project_slug required" },
      httpStatus: 400,
      error: "project_slug required",
    });
    return badRequest("project_slug required");
  }
  if (!providerId) {
    await recordOperationLog({
      route: "/api/provider-configs",
      method: "POST",
      category: "provider_config",
      requestPayload: body,
      responsePayload: { error: "provider_id required" },
      httpStatus: 400,
      error: "provider_id required",
    });
    return badRequest("provider_id required");
  }
  if (!isPlainObject(config)) {
    await recordOperationLog({
      route: "/api/provider-configs",
      method: "POST",
      category: "provider_config",
      requestPayload: body,
      responsePayload: { error: "config must be a JSON object" },
      httpStatus: 400,
      error: "config must be a JSON object",
    });
    return badRequest("config must be a JSON object");
  }

  const projectId = await resolveProjectIdBySlug(supabase, projectSlug);
  if (!projectId) {
    await recordOperationLog({
      route: "/api/provider-configs",
      method: "POST",
      category: "provider_config",
      requestPayload: body,
      responsePayload: { error: `project not found: ${projectSlug}` },
      httpStatus: 404,
      error: `project not found: ${projectSlug}`,
    });
    return badRequest(`project not found: ${projectSlug}`, 404);
  }

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

  if (error) {
    await recordOperationLog({
      route: "/api/provider-configs",
      method: "POST",
      category: "provider_config",
      requestPayload: body,
      responsePayload: { error: error.message },
      httpStatus: 500,
      error: error.message,
    });
    return badRequest(error.message, 500);
  }
  const responseBody = { ok: true, config: data };
  await recordOperationLog({
    route: "/api/provider-configs",
    method: "POST",
    category: "provider_config",
    requestPayload: body,
    responsePayload: responseBody,
    httpStatus: 200,
  });
  return Response.json(responseBody);
}

export async function DELETE(request: Request) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) {
    await recordOperationLog({
      route: "/api/provider-configs",
      method: "DELETE",
      category: "provider_config",
      requestPayload: Object.fromEntries(new URL(request.url).searchParams.entries()),
      responsePayload: { error: "unauthorized" },
      httpStatus: 401,
      error: "unauthorized",
    });
    return unauthorized;
  }

  const supabase = getServerSupabaseClient();
  if (!supabase) {
    await recordOperationLog({
      route: "/api/provider-configs",
      method: "DELETE",
      category: "provider_config",
      requestPayload: Object.fromEntries(new URL(request.url).searchParams.entries()),
      responsePayload: { error: "Supabase server configuration missing" },
      httpStatus: 500,
      error: "Supabase server configuration missing",
    });
    return badRequest("Supabase server configuration missing", 500);
  }

  const url = new URL(request.url);
  const projectSlug = (url.searchParams.get("project_slug") || "demo").trim();
  const providerId = (url.searchParams.get("provider_id") || "").trim();
  if (!providerId) {
    await recordOperationLog({
      route: "/api/provider-configs",
      method: "DELETE",
      category: "provider_config",
      requestPayload: { project_slug: projectSlug, provider_id: providerId },
      responsePayload: { error: "provider_id required" },
      httpStatus: 400,
      error: "provider_id required",
    });
    return badRequest("provider_id required");
  }

  const projectId = await resolveProjectIdBySlug(supabase, projectSlug);
  if (!projectId) {
    await recordOperationLog({
      route: "/api/provider-configs",
      method: "DELETE",
      category: "provider_config",
      requestPayload: { project_slug: projectSlug, provider_id: providerId },
      responsePayload: { error: `project not found: ${projectSlug}` },
      httpStatus: 404,
      error: `project not found: ${projectSlug}`,
    });
    return badRequest(`project not found: ${projectSlug}`, 404);
  }

  const { error } = await supabase
    .from("morpheus_provider_configs")
    .delete()
    .eq("project_id", projectId)
    .eq("provider_id", providerId);

  if (error) {
    await recordOperationLog({
      route: "/api/provider-configs",
      method: "DELETE",
      category: "provider_config",
      requestPayload: { project_slug: projectSlug, provider_id: providerId },
      responsePayload: { error: error.message },
      httpStatus: 500,
      error: error.message,
    });
    return badRequest(error.message, 500);
  }
  await recordOperationLog({
    route: "/api/provider-configs",
    method: "DELETE",
    category: "provider_config",
    requestPayload: { project_slug: projectSlug, provider_id: providerId },
    responsePayload: { ok: true },
    httpStatus: 200,
  });
  return Response.json({ ok: true });
}
