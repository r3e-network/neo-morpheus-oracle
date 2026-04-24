import { appConfig } from '@/lib/config';
import { isAuthorizedControlPlaneRequest } from '@/lib/control-plane-auth';
import {
  dispatchToControlPlane,
  shouldDispatchToControlPlane,
  shouldUseControlPlaneFallback,
} from '@/lib/control-plane';
import { parseFeedProviders, parseFeedSymbols } from '@/lib/feed-defaults';
import { runFeedSyncJob } from '@/lib/feed-sync';
import { sendHeartbeat } from '@/lib/heartbeat';
import { recordOperationLog } from '@/lib/operation-logs';

function isAuthorized(request: Request) {
  const configured = process.env.CRON_SECRET || '';
  if (!configured) return false;
  const auth = request.headers.get('authorization') || '';
  return auth === `Bearer ${configured}`;
}

function isFeedControlPlaneEnabled() {
  const raw = String(process.env.MORPHEUS_CONTROL_PLANE_ENABLE_FEED || '')
    .trim()
    .toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return process.env.NODE_ENV === 'production';
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
    const body = { error: 'MORPHEUS_RUNTIME_URL is not configured' };
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

  if (isFeedControlPlaneEnabled() && shouldDispatchToControlPlane('/feeds/tick')) {
    const controlPlaneResponse = await dispatchToControlPlane(
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
    if (!shouldUseControlPlaneFallback(controlPlaneResponse)) {
      return controlPlaneResponse;
    }
  }

  const finalBody = await runFeedSyncJob(feedTickPayload);
  const heartbeatPayload = {
    route: '/api/cron/feed',
    ok: Boolean(finalBody.ok),
    target_chain: 'neo_n3',
    symbols: symbols.length,
  };
  if (finalBody.ok) {
    void sendHeartbeat(
      process.env.MORPHEUS_BETTERSTACK_CRON_FEED_HEARTBEAT_URL || '',
      heartbeatPayload
    );
  } else {
    void sendHeartbeat(
      process.env.MORPHEUS_BETTERSTACK_CRON_FEED_FAILURE_URL || '',
      heartbeatPayload
    );
  }
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
