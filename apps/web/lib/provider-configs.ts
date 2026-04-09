import {
  getServerSupabaseClient,
  loadProjectProviderConfig,
  resolveSupabaseNetwork,
} from './server-supabase';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeProviderId(value: unknown) {
  return trimString(value).toLowerCase();
}

function normalizeBoolean(value: unknown, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = trimString(value).toLowerCase();
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
  return fallback;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function parseJsonObjectParam(rawValue: string | null) {
  const value = trimString(rawValue);
  if (!value) return undefined;
  const parsed = JSON.parse(value);
  if (!isPlainObject(parsed)) {
    throw new Error('provider_params must be a JSON object');
  }
  return parsed;
}

function coerceObject(value: unknown) {
  if (isPlainObject(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (isPlainObject(parsed)) return parsed;
    } catch {
      return {};
    }
  }
  return {};
}

function resolveProviderPolicyPayload(
  payload: Record<string, unknown>,
  providerId: string,
  projectSlug: string,
  providerConfig: { config?: unknown }
) {
  const config = coerceObject(providerConfig.config);
  const requireAttestation = normalizeBoolean(
    payload.require_attestation ?? config.require_attestation,
    false
  );
  const existingPolicyDecision = coerceObject(payload.policy_decision);

  return {
    ...payload,
    provider_enabled: true,
    require_attestation: requireAttestation,
    policy_decision: {
      ...existingPolicyDecision,
      allow: true,
      decision: 'allow',
      reason: 'allowed',
      scope: 'provider',
      scope_id: providerId,
      provider_enabled: true,
      require_attestation: requireAttestation,
      project_slug: projectSlug,
    },
  };
}

export async function resolveProviderAwarePayload<T extends Record<string, unknown>>(
  payload: T,
  options: {
    projectSlug?: string;
    fallbackProviderId?: string;
    network?: string;
  } = {}
) {
  const projectSlug = trimString(payload.project_slug || options.projectSlug || '');
  const providerId = normalizeProviderId(
    payload.provider || payload.provider_id || payload.source || options.fallbackProviderId || ''
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

  const providerConfig = await loadProjectProviderConfig(
    supabase,
    projectSlug,
    providerId,
    resolveSupabaseNetwork(String(payload.network || options.network || ''))
  );
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
    payload: resolveProviderPolicyPayload(
      {
        ...payload,
        provider: String(payload.provider || providerId),
        project_slug: projectSlug,
        provider_params: {
          ...coerceObject(providerConfig.config),
          ...coerceObject(payload.provider_params),
        },
      },
      providerId,
      projectSlug,
      providerConfig
    ),
    providerConfig,
    projectSlug,
    providerId,
  };
}
