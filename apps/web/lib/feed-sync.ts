import { appConfig } from './config';
import { parseFeedProviders, parseFeedSymbols } from './feed-defaults';
import { resolveProviderAwarePayload } from './provider-configs';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

type FeedSyncOptions = {
  target_chain?: string | null;
  project_slug?: string | null;
  provider?: string | null;
  providers?: string[] | null;
  symbols?: string[] | null;
};

export async function runFeedSyncJob(options: FeedSyncOptions = {}) {
  if (!appConfig.phalaApiUrl) {
    throw new Error('PHALA_API_URL is not configured');
  }

  const explicitTargetChain = trimString(options.target_chain || '');
  if (explicitTargetChain && explicitTargetChain !== 'neo_n3') {
    throw new Error('target_chain must be neo_n3');
  }

  const targetChains = ['neo_n3'];
  const configuredProjectSlug = trimString(options.project_slug || appConfig.feedProjectSlug || '');
  const configuredProvider = trimString(options.provider || appConfig.feedProvider || '');
  const configuredProviders =
    Array.isArray(options.providers) && options.providers.length > 0
      ? options.providers.map((entry) => trimString(entry)).filter(Boolean)
      : parseFeedProviders(process.env.MORPHEUS_FEED_PROVIDERS || '');
  const symbols =
    Array.isArray(options.symbols) && options.symbols.length > 0
      ? options.symbols.map((entry) => trimString(entry)).filter(Boolean)
      : parseFeedSymbols(process.env.MORPHEUS_FEED_SYMBOLS);

  const headers = new Headers({ 'content-type': 'application/json' });
  if (appConfig.phalaToken) {
    headers.set('authorization', `Bearer ${appConfig.phalaToken}`);
    headers.set('x-phala-token', appConfig.phalaToken);
  }

  const results = await Promise.all(
    targetChains.map(async (targetChain) => {
      try {
        const payload: Record<string, unknown> = {
          symbols,
          target_chain: targetChain,
          wait: false,
          project_slug: configuredProjectSlug || undefined,
        };
        if (configuredProvider) {
          payload.provider = configuredProvider;
        } else {
          payload.providers = configuredProviders;
        }

        const resolved = await resolveProviderAwarePayload(payload, {
          projectSlug: configuredProjectSlug || undefined,
          fallbackProviderId: configuredProvider || undefined,
        });

        const response = await fetch(`${appConfig.phalaApiUrl.replace(/\/$/, '')}/oracle/feed`, {
          method: 'POST',
          headers,
          body: JSON.stringify(resolved.payload),
          cache: 'no-store',
        });
        const text = await response.text();
        try {
          return { target_chain: targetChain, status: response.status, body: JSON.parse(text) };
        } catch {
          return { target_chain: targetChain, status: response.status, body: text };
        }
      } catch (error) {
        return {
          target_chain: targetChain,
          status: 400,
          body: { error: error instanceof Error ? error.message : String(error) },
        };
      }
    })
  );

  const ok = results.every((entry) => Number(entry.status || 500) < 400);
  return {
    ok,
    project_slug: configuredProjectSlug || null,
    provider: configuredProvider || null,
    providers: configuredProviders,
    symbols,
    results,
  };
}
