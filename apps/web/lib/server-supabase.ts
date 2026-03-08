import { createClient } from "@supabase/supabase-js";

function resolveProviderConfigAdminKey() {
  return process.env.MORPHEUS_PROVIDER_CONFIG_API_KEY || process.env.ADMIN_CONSOLE_API_KEY || "";
}

export function isAuthorizedAdminRequest(request: Request) {
  const configured = resolveProviderConfigAdminKey();
  if (!configured) return true;

  const headerKey = (request.headers.get("x-admin-api-key") || "").trim();
  const bearer = (request.headers.get("authorization") || "").trim();
  return headerKey === configured || bearer === `Bearer ${configured}`;
}

export function getServerSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
