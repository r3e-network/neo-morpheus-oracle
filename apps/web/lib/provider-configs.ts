import { getServerSupabaseClient, loadProjectProviderConfig } from "./server-supabase";

function trimString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeProviderId(value: unknown) {
  return trimString(value).toLowerCase();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseJsonObjectParam(rawValue: string | null) {
  const value = trimString(rawValue);
  if (!value) return undefined;
  const parsed = JSON.parse(value);
  if (!isPlainObject(parsed)) {
    throw new Error("provider_params must be a JSON object");
  }
  return parsed;
}

function coerceObject(value: unknown) {
  if (isPlainObject(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (isPlainObject(parsed)) return parsed;
    } catch {
      return {};
    }
  }
  return {};
}

export async function resolveProviderAwarePayload<T extends Record<string, unknown>>(
  payload: T,
  options: {
    projectSlug?: string;
    fallbackProviderId?: string;
  } = {},
) {
  const projectSlug = trimString(payload.project_slug || options.projectSlug || "");
  const providerId = normalizeProviderId(
    payload.provider || payload.provider_id || payload.source || options.fallbackProviderId || "",
  );

  if (!projectSlug || !providerId) {
    return {
      payload,
      providerConfig: null,
      projectSlug: projectSlug || null,
      providerId: providerId || null,
    };
  }

  const supabase = getServerSupabaseClient();
  if (!supabase) {
    return {
      payload,
      providerConfig: null,
      projectSlug,
      providerId,
    };
  }

  const providerConfig = await loadProjectProviderConfig(supabase, projectSlug, providerId);
  if (!providerConfig) {
    return {
      payload: {
        ...payload,
        provider: String(payload.provider || providerId),
        project_slug: projectSlug,
      },
      providerConfig: null,
      projectSlug,
      providerId,
    };
  }

  if (!providerConfig.enabled) {
    throw new Error(`provider ${providerId} is disabled for project ${projectSlug}`);
  }

  return {
    payload: {
      ...payload,
      provider: String(payload.provider || providerId),
      project_slug: projectSlug,
      provider_params: {
        ...coerceObject(providerConfig.config),
        ...coerceObject(payload.provider_params),
      },
    },
    providerConfig,
    projectSlug,
    providerId,
  };
}
