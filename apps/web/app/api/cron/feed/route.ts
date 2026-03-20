import { appConfig } from '@/lib/config';
import { isAuthorizedControlPlaneRequest } from '@/lib/control-plane-auth';
import { dispatchToControlPlane, shouldDispatchToControlPlane } from '@/lib/control-plane';
import { parseFeedProviders, parseFeedSymbols } from '@/lib/feed-defaults';
import { runFeedSyncJob } from '@/lib/feed-sync';
import { recordOperationLog } from '@/lib/operation-logs';

function isAuthorized(request: Request) {
  const configured = process.env.CRON_SECRET || '';
  if (!configured) return false;
  const auth = request.headers.get('authorization') || '';
  return auth === `Bearer ${configured}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request) && !isAuthorizedControlPlaneRequest(request)) {
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
  const feedTickPayload = {
    target_chain: explicitTargetChain || 'neo_n3',
    project_slug: configuredProjectSlug || undefined,
    provider: configuredProvider || undefined,
    providers: configuredProviders,
    symbols,
  };

  if (shouldDispatchToControlPlane('/feeds/tick')) {
    return dispatchToControlPlane(
      '/feeds/tick',
      {
        method: 'POST',
        body: JSON.stringify(feedTickPayload),
      },
      {
        route: '/api/cron/feed',
        category: 'feed',
        requestPayload: feedTickPayload,
        metadata: {
          source: 'cron',
        },
      }
    );
  }

  const finalBody = await runFeedSyncJob(feedTickPayload);
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
      target_chains: ['neo_n3'],
    },
    responsePayload: finalBody,
    httpStatus: finalBody.ok ? 200 : 502,
  });
  return Response.json(finalBody, { status: finalBody.ok ? 200 : 502 });
}
