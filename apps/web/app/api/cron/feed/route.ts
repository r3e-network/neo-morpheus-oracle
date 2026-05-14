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

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set('cache-control', 'no-store');
  return Response.json(body, { ...init, headers });
}

function isAuthorized(request: Request) {
  const runtimeEnv = process.env as Record<string, string | undefined>;
  const configured = runtimeEnv['MORPHEUS_CRON_SECRET'] || runtimeEnv['CRON_SECRET'] || '';
  if (!configured) return false;
  const bearer = request.headers.get('authorization') || '';
  const headerSecret =
    request.headers.get('x-morpheus-cron') || request.headers.get('x-cron-token') || '';
  return bearer === `Bearer ${configured}` || headerSecret === configured;
}

function isVercelCronRequest(request: Request) {
  const routeUrl = new URL(request.url);
  const userAgent = (request.headers.get('user-agent') || '').toLowerCase();
  return userAgent.includes('vercel-cron') && Array.from(routeUrl.searchParams.keys()).length === 0;
}

function getSafeAuthDiagnostics(request: Request) {
  const runtimeEnv = process.env as Record<string, string | undefined>;
  const configured = runtimeEnv['MORPHEUS_CRON_SECRET'] || runtimeEnv['CRON_SECRET'] || '';
  const routeUrl = new URL(request.url);
  const bearer = request.headers.get('authorization') || '';
  const headerSecret =
    request.headers.get('x-morpheus-cron') || request.headers.get('x-cron-token') || '';
  return {
    headerNames: Array.from(request.headers.keys()).sort(),
    hasAuthorizationHeader: Boolean(request.headers.get('authorization')),
    hasCronHeaderSecret: Boolean(headerSecret),
    hasVercelSecureComputeHeaders: Boolean(request.headers.get('x-vercel-sc-headers')),
    authMatchesConfigured: Boolean(configured && bearer === `Bearer ${configured}`),
    cronHeaderMatchesConfigured: Boolean(configured && headerSecret === configured),
    configuredSecretLength: configured.length,
    authHeaderLength: bearer.length,
    cronHeaderSecretLength: headerSecret.length,
    hasCronSecret: Boolean(runtimeEnv['CRON_SECRET']),
    hasMorpheusCronSecret: Boolean(runtimeEnv['MORPHEUS_CRON_SECRET']),
    searchParamCount: Array.from(routeUrl.searchParams.keys()).length,
    userAgent: request.headers.get('user-agent') || '',
  };
}

function isFeedControlPlaneEnabled() {
  const raw = String(process.env.MORPHEUS_CONTROL_PLANE_ENABLE_FEED || '')
    .trim()
    .toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return process.env.NODE_ENV === 'production';
}

function shouldFallbackFromFeedControlPlane(response: Response) {
  if (shouldUseControlPlaneFallback(response)) return true;
  if (![401, 403].includes(response.status)) return false;
  const raw = String(process.env.MORPHEUS_CONTROL_PLANE_FEED_FALLBACK_ON_AUTH || '')
    .trim()
    .toLowerCase();
  return !['0', 'false', 'no', 'off'].includes(raw);
}

export async function GET(request: Request) {
  if (
    !isAuthorized(request) &&
    !isAuthorizedControlPlaneRequest(request) &&
    !isVercelCronRequest(request)
  ) {
    const runtimeEnv = process.env as Record<string, string | undefined>;
    const routeUrl = new URL(request.url);
    console.warn('[morpheus-cron-feed] unauthorized request', {
      hasAuthorizationHeader: Boolean(request.headers.get('authorization')),
      hasCronHeaderSecret: Boolean(request.headers.get('x-morpheus-cron')),
      hasVercelSecureComputeHeaders: Boolean(request.headers.get('x-vercel-sc-headers')),
      hasCronSecret: Boolean(runtimeEnv['CRON_SECRET']),
      hasMorpheusCronSecret: Boolean(runtimeEnv['MORPHEUS_CRON_SECRET']),
      searchParamCount: Array.from(routeUrl.searchParams.keys()).length,
      userAgent: request.headers.get('user-agent') || '',
    });
    const body = { error: 'unauthorized' };
    await recordOperationLog({
      route: '/api/cron/feed',
      method: 'GET',
      category: 'feed',
      requestPayload: Object.fromEntries(new URL(request.url).searchParams.entries()),
      responsePayload: body,
      httpStatus: 401,
      error: 'unauthorized',
      metadata: {
        auth: getSafeAuthDiagnostics(request),
      },
    });
    return jsonNoStore(body, { status: 401 });
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
    return jsonNoStore(body, { status: 500 });
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
    return jsonNoStore(body, { status: 400 });
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
    if (!shouldFallbackFromFeedControlPlane(controlPlaneResponse)) {
      await sendHeartbeat(
        controlPlaneResponse.ok
          ? process.env.MORPHEUS_BETTERSTACK_CRON_FEED_HEARTBEAT_URL || ''
          : process.env.MORPHEUS_BETTERSTACK_CRON_FEED_FAILURE_URL || '',
        {
          route: '/api/cron/feed',
          ok: controlPlaneResponse.ok,
          target_chain: 'neo_n3',
          symbols: symbols.length,
          via: 'control_plane',
        }
      );
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
    await sendHeartbeat(
      process.env.MORPHEUS_BETTERSTACK_CRON_FEED_HEARTBEAT_URL || '',
      heartbeatPayload
    );
  } else {
    await sendHeartbeat(
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
  return jsonNoStore(finalBody, { status: finalBody.ok ? 200 : 502 });
}
