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
  private_key?: string | null;
  wif?: string | null;
};

export async function runFeedSyncJob(options: FeedSyncOptions = {}) {
  const candidateUrls =
    Array.isArray(appConfig.phalaApiUrls) && appConfig.phalaApiUrls.length > 0
      ? appConfig.phalaApiUrls
      : appConfig.phalaApiUrl
        ? [appConfig.phalaApiUrl]
        : [];
  if (candidateUrls.length === 0) {
    throw new Error('MORPHEUS_RUNTIME_URL is not configured');
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
          private_key: trimString(options.private_key || '') || undefined,
          wif: trimString(options.wif || '') || undefined,
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

        let lastStatus = 503;
        let lastBody: unknown = { error: 'upstream unavailable' };
        for (const apiBaseUrl of candidateUrls) {
          const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/oracle/feed`, {
            method: 'POST',
            headers,
            body: JSON.stringify(resolved.payload),
            cache: 'no-store',
          });
          const text = await response.text();
          let body: unknown = text;
          try {
            body = text ? JSON.parse(text) : {};
          } catch {}
          lastStatus = response.status;
          lastBody = body;
          if (
            response.ok ||
            (response.status !== 408 &&
              response.status !== 409 &&
              response.status !== 425 &&
              response.status !== 429 &&
              response.status < 500)
          ) {
            break;
          }
        }
        return { target_chain: targetChain, status: lastStatus, body: lastBody };
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
