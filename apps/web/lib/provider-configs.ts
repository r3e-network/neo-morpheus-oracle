import {
  getServerSupabaseClient,
  loadProjectProviderConfig,
  resolveSupabaseNetwork,
} from './server-supabase';
import { trimString } from './strings';

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
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('provider_params must be valid JSON');
  }
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

function describeLookupError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (isPlainObject(error)) {
    const message = trimString(error.message || error.error || error.details || '');
    if (message) return message;
    try {
      return JSON.stringify(error);
    } catch {
      return 'provider config lookup failed';
    }
  }
  return trimString(error) || 'provider config lookup failed';
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

  let providerConfig;
  try {
    providerConfig = await loadProjectProviderConfig(
      supabase,
      projectSlug,
      providerId,
      resolveSupabaseNetwork(String(payload.network || options.network || ''))
    );
  } catch (error) {
    console.warn('[morpheus-provider-config] lookup failed, using default payload', {
      projectSlug,
      providerId,
      error: describeLookupError(error),
    });
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
