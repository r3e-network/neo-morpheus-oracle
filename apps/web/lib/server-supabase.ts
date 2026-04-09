import { createClient } from '@supabase/supabase-js';

export type ServerSupabaseClient = any;
export type MorpheusNetwork = 'mainnet' | 'testnet';

export type ProjectProviderConfigRecord = {
  provider_id: string;
  enabled: boolean;
  config: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type WorkflowExecutionStatus =
  | 'queued'
  | 'dispatched'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'paused';

export type PolicyDecisionStatus = 'allow' | 'deny' | 'review';
export type RiskEventStatus = 'open' | 'acknowledged' | 'resolved';

export type WorkflowExecutionRecord = {
  network: MorpheusNetwork;
  workflow_id: string;
  execution_id: string;
  ingress_route: string | null;
  status: WorkflowExecutionStatus;
  result_envelope_version: string;
  metadata: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
};

export type PolicyDecisionRecord = {
  network: MorpheusNetwork;
  workflow_id?: string | null;
  execution_id?: string | null;
  scope: string;
  decision: PolicyDecisionStatus;
  reason?: string | null;
  metadata: Record<string, unknown>;
  created_at?: string;
};

export type RiskEventRecord = {
  network: MorpheusNetwork;
  scope: string;
  scope_id: string;
  status: RiskEventStatus;
  action?: string | null;
  metadata: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const LOOKUP_CACHE_TTL_MS = 30_000;
let serverSupabaseClientCache: ServerSupabaseClient | null | undefined;
const projectIdCache = new Map<string, CacheEntry<string | null>>();
const providerConfigCache = new Map<string, CacheEntry<ProjectProviderConfigRecord | null>>();
const projectIdInFlight = new Map<string, Promise<string | null>>();
const providerConfigInFlight = new Map<string, Promise<ProjectProviderConfigRecord | null>>();

function resolveLookupCacheTtlMs() {
  const configured = Number(process.env.MORPHEUS_WEB_LOOKUP_CACHE_TTL_MS || '');
  if (!Number.isFinite(configured)) return LOOKUP_CACHE_TTL_MS;
  return Math.max(Math.trunc(configured), 0);
}

function getCachedValue<T>(cache: Map<string, CacheEntry<T>>, key: string) {
  const entry = cache.get(key);
  if (!entry) return { hit: false as const, value: undefined };
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return { hit: false as const, value: undefined };
  }
  return { hit: true as const, value: entry.value };
}

function setCachedValue<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T) {
  cache.set(key, {
    expiresAt: Date.now() + resolveLookupCacheTtlMs(),
    value,
  });
}

export function __resetServerSupabaseCachesForTests() {
  serverSupabaseClientCache = undefined;
  projectIdCache.clear();
  providerConfigCache.clear();
  projectIdInFlight.clear();
  providerConfigInFlight.clear();
}

function resolveAdminKeys(
  scope:
    | 'provider_config'
    | 'relayer_ops'
    | 'sign_payload'
    | 'relay_transaction' = 'provider_config'
) {
  const values =
    scope === 'provider_config'
      ? [process.env.MORPHEUS_PROVIDER_CONFIG_API_KEY, process.env.ADMIN_CONSOLE_API_KEY]
      : scope === 'relayer_ops'
        ? [
            process.env.MORPHEUS_RELAYER_ADMIN_API_KEY,
            process.env.MORPHEUS_OPERATOR_API_KEY,
            process.env.ADMIN_CONSOLE_API_KEY,
          ]
        : scope === 'sign_payload'
          ? [
              process.env.MORPHEUS_SIGNING_ADMIN_API_KEY,
              process.env.MORPHEUS_OPERATOR_API_KEY,
              process.env.ADMIN_CONSOLE_API_KEY,
            ]
          : [
              process.env.MORPHEUS_RELAY_ADMIN_API_KEY,
              process.env.MORPHEUS_OPERATOR_API_KEY,
              process.env.ADMIN_CONSOLE_API_KEY,
            ];
  return [...new Set(values.map((value) => (value || '').trim()).filter(Boolean))];
}

export function isAuthorizedAdminRequest(
  request: Request,
  scope:
    | 'provider_config'
    | 'relayer_ops'
    | 'sign_payload'
    | 'relay_transaction' = 'provider_config'
) {
  const configured = resolveAdminKeys(scope);
  if (configured.length === 0) return false;

  const headerKey = (request.headers.get('x-admin-api-key') || '').trim();
  const bearer = (request.headers.get('authorization') || '').trim();
  return configured.includes(headerKey) || configured.some((value) => bearer === `Bearer ${value}`);
}

export function getServerSupabaseClient() {
  if (serverSupabaseClientCache !== undefined) {
    return serverSupabaseClientCache;
  }

  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.morpheus_SUPABASE_URL ||
    '';
  const serviceKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.morpheus_SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.morpheus_SUPABASE_SERVICE_ROLE_KEY ||
    '';
  if (!url || !serviceKey) {
    serverSupabaseClientCache = null;
    return serverSupabaseClientCache;
  }
  serverSupabaseClientCache = createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return serverSupabaseClientCache;
}

export function resolveSupabaseNetwork(value?: string | null): MorpheusNetwork {
  return String(
    value || process.env.MORPHEUS_NETWORK || process.env.NEXT_PUBLIC_MORPHEUS_NETWORK || 'mainnet'
  ).trim() === 'mainnet'
    ? 'mainnet'
    : 'testnet';
}

export async function resolveProjectIdBySlug(
  supabase: ServerSupabaseClient,
  projectSlug: string,
  network: MorpheusNetwork = resolveSupabaseNetwork()
) {
  const cacheKey = `${network}:${projectSlug}`;
  const cached = getCachedValue(projectIdCache, cacheKey);
  if (cached.hit) return cached.value;

  const existing = projectIdInFlight.get(cacheKey);
  if (existing) return existing;

  const request = supabase
    .from('morpheus_projects')
    .select('id, slug, network')
    .eq('slug', projectSlug)
    .eq('network', network)
    .maybeSingle()
    .then(({ data, error }: any) => {
      if (error) throw error;
      const value = data?.id || null;
      setCachedValue(projectIdCache, cacheKey, value);
      return value;
    })
    .finally(() => {
      projectIdInFlight.delete(cacheKey);
    });

  projectIdInFlight.set(cacheKey, request);
  return request;
}

export async function loadProjectProviderConfig(
  supabase: ServerSupabaseClient,
  projectSlug: string,
  providerId: string,
  network: MorpheusNetwork = resolveSupabaseNetwork()
): Promise<ProjectProviderConfigRecord | null> {
  const cacheKey = `${network}:${projectSlug}:${providerId}`;
  const cached = getCachedValue(providerConfigCache, cacheKey);
  if (cached.hit) return cached.value;

  const existing = providerConfigInFlight.get(cacheKey);
  if (existing) return existing;

  const request = (async () => {
    const projectId = await resolveProjectIdBySlug(supabase, projectSlug, network);
    if (!projectId) {
      setCachedValue(providerConfigCache, cacheKey, null);
      return null;
    }

    const { data, error } = await supabase
      .from('morpheus_provider_configs')
      .select('provider_id, enabled, config, created_at, updated_at')
      .eq('project_id', projectId)
      .eq('network', network)
      .eq('provider_id', providerId)
      .maybeSingle();

    if (error) throw error;
    const value = (data as ProjectProviderConfigRecord | null) ?? null;
    setCachedValue(providerConfigCache, cacheKey, value);
    return value;
  })().finally(() => {
    providerConfigInFlight.delete(cacheKey);
  });

  providerConfigInFlight.set(cacheKey, request);
  return request;
}
