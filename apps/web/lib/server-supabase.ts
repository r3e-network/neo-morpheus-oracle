import { createClient } from "@supabase/supabase-js";

export type ServerSupabaseClient = NonNullable<ReturnType<typeof getServerSupabaseClient>>;

export type ProjectProviderConfigRecord = {
  provider_id: string;
  enabled: boolean;
  config: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

function resolveProviderConfigAdminKey() {
  return process.env.MORPHEUS_PROVIDER_CONFIG_API_KEY || process.env.ADMIN_CONSOLE_API_KEY || "";
}

export function isAuthorizedAdminRequest(request: Request) {
  const configured = resolveProviderConfigAdminKey();
  if (!configured) return false;

  const headerKey = (request.headers.get("x-admin-api-key") || "").trim();
  const bearer = (request.headers.get("authorization") || "").trim();
  return headerKey === configured || bearer === `Bearer ${configured}`;
}

export function getServerSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.morpheus_SUPABASE_URL || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.morpheus_SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function resolveProjectIdBySlug(supabase: ServerSupabaseClient, projectSlug: string) {
  const { data, error } = await supabase
    .from("morpheus_projects")
    .select("id, slug")
    .eq("slug", projectSlug)
    .maybeSingle();
  if (error) throw error;
  return data?.id || null;
}

export async function loadProjectProviderConfig(
  supabase: ServerSupabaseClient,
  projectSlug: string,
  providerId: string,
): Promise<ProjectProviderConfigRecord | null> {
  const projectId = await resolveProjectIdBySlug(supabase, projectSlug);
  if (!projectId) return null;

  const { data, error } = await supabase
    .from("morpheus_provider_configs")
    .select("provider_id, enabled, config, created_at, updated_at")
    .eq("project_id", projectId)
    .eq("provider_id", providerId)
    .maybeSingle();

  if (error) throw error;
  return (data as ProjectProviderConfigRecord | null) ?? null;
}
