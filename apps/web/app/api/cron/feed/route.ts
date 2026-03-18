import { appConfig } from '@/lib/config';
import { parseFeedProviders, parseFeedSymbols } from '@/lib/feed-defaults';
import { recordOperationLog } from '@/lib/operation-logs';
import { resolveProviderAwarePayload } from '@/lib/provider-configs';

function isAuthorized(request: Request) {
  const configured = process.env.CRON_SECRET || '';
  if (!configured) return false;
  const auth = request.headers.get('authorization') || '';
  return auth === `Bearer ${configured}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    const body = { error: 'unauthorized' };
    await recordOperationLog({
      route: '/api/cron/feed',
      method: 'GET',
      category: 'feed',
      requestPayload: Object.fromEntries(new URL(request.url).searchParams.entries()),
      responsePayload: body,
      httpStatus: 401,
      error: 'unauthorized',
    });
    return Response.json(body, { status: 401 });
  }

  if (!appConfig.phalaApiUrl) {
    const body = { error: 'PHALA_API_URL is not configured' };
    await recordOperationLog({
      route: '/api/cron/feed',
      method: 'GET',
      category: 'feed',
      requestPayload: Object.fromEntries(new URL(request.url).searchParams.entries()),
      responsePayload: body,
      httpStatus: 500,
      error: body.error,
    });
    return Response.json(body, { status: 500 });
  }

  const routeUrl = new URL(request.url);
  const symbols = parseFeedSymbols(process.env.MORPHEUS_FEED_SYMBOLS);
  const explicitTargetChain = (routeUrl.searchParams.get('target_chain') || '').trim();
  if (explicitTargetChain && explicitTargetChain !== 'neo_n3') {
    const body = { error: 'target_chain must be neo_n3' };
    await recordOperationLog({
      route: '/api/cron/feed',
      method: 'GET',
      category: 'feed',
      requestPayload: Object.fromEntries(routeUrl.searchParams.entries()),
      responsePayload: body,
      httpStatus: 400,
      error: body.error,
    });
    return Response.json(body, { status: 400 });
  }
  const targetChains = ['neo_n3'];
  const configuredProjectSlug = (
    routeUrl.searchParams.get('project_slug') ||
    process.env.MORPHEUS_FEED_PROJECT_SLUG ||
    ''
  ).trim();
  const configuredProvider = (
    routeUrl.searchParams.get('provider') ||
    process.env.MORPHEUS_FEED_PROVIDER ||
    ''
  ).trim();
  const configuredProviders = parseFeedProviders(
    routeUrl.searchParams.get('providers') || process.env.MORPHEUS_FEED_PROVIDERS || ''
  );

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

  const finalBody = {
    ok: true,
    project_slug: configuredProjectSlug || null,
    provider: configuredProvider || null,
    providers: configuredProviders,
    results,
  };
  await recordOperationLog({
    route: '/api/cron/feed',
    method: 'GET',
    category: 'feed',
    requestPayload: {
      ...Object.fromEntries(routeUrl.searchParams.entries()),
      project_slug: configuredProjectSlug || undefined,
      provider: configuredProvider || undefined,
      providers: configuredProviders,
      symbols,
      target_chains: targetChains,
    },
    responsePayload: finalBody,
    httpStatus: 200,
  });
  return Response.json(finalBody);
}
