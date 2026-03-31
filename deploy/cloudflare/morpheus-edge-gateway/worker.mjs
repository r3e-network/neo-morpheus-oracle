import { json, trimString, getClientIp } from '@neo-morpheus-oracle/shared/utils.js';
import { applyUpstashRateLimit } from '@neo-morpheus-oracle/shared/rate-limit.js';

const CACHE_RULES = [
  { match: (url, req) => req.method === 'GET' && url.pathname.endsWith('/health'), ttl: 15 },
  { match: (url, req) => req.method === 'GET' && url.pathname.endsWith('/providers'), ttl: 60 },
  {
    match: (url, req) => req.method === 'GET' && url.pathname.endsWith('/feeds/catalog'),
    ttl: 300,
  },
  {
    match: (url, req) => req.method === 'GET' && url.pathname.endsWith('/oracle/public-key'),
    ttl: 300,
  },
  {
    match: (url, req) => req.method === 'GET' && /\/feeds\/price(?:\/|$)/.test(url.pathname),
    ttl: 15,
  },
];

const TURNSTILE_PROTECTED_PATHS = [
  '/paymaster/authorize',
  '/relay/transaction',
  '/compute/execute',
  '/vrf/random',
];

const UPSTASH_ROUTE_LIMITS = {
  paymaster: { limit: 20, windowMs: 60_000 },
  relay: { limit: 20, windowMs: 60_000 },
  compute: { limit: 10, windowMs: 60_000 },
  vrf: { limit: 15, windowMs: 60_000 },
  'oracle-query': { limit: 30, windowMs: 60_000 },
};

function stripLeadingSlash(value) {
  return String(value || '').replace(/^\/+/, '');
}

function resolveNetworkRoute(url, env) {
  const path = url.pathname || '/';
  if (path === '/' || path === '') {
    return {
      network: 'testnet',
      forwardedPath: '/',
      routePrefix: '/',
      originBaseUrl: trimString(env.MORPHEUS_TESTNET_ORIGIN_URL || env.MORPHEUS_ORIGIN_URL).replace(
        /\/$/,
        ''
      ),
    };
  }

  const segments = stripLeadingSlash(path).split('/');
  const prefix = segments[0]?.toLowerCase();
  if (prefix === 'mainnet' || prefix === 'testnet') {
    const rest = segments.slice(1).join('/');
    const forwardedPath = `/${rest}`.replace(/\/+$/, '') || '/';
    const originBaseUrl =
      prefix === 'mainnet'
        ? trimString(env.MORPHEUS_MAINNET_ORIGIN_URL || env.MORPHEUS_ORIGIN_URL).replace(/\/$/, '')
        : trimString(env.MORPHEUS_TESTNET_ORIGIN_URL || env.MORPHEUS_ORIGIN_URL).replace(/\/$/, '');
    return {
      network: prefix,
      forwardedPath,
      routePrefix: `/${prefix}`,
      originBaseUrl,
    };
  }

  return {
    network: 'testnet',
    forwardedPath: path,
    routePrefix: '',
    originBaseUrl: trimString(env.MORPHEUS_TESTNET_ORIGIN_URL || env.MORPHEUS_ORIGIN_URL).replace(
      /\/$/,
      ''
    ),
  };
}

function shouldProtectWithTurnstile(pathname) {
  return TURNSTILE_PROTECTED_PATHS.some((path) => pathname.endsWith(path));
}

function extractTrustedAuthToken(request) {
  const authorization = trimString(request.headers.get('authorization'));
  if (authorization.toLowerCase().startsWith('bearer ')) {
    return trimString(authorization.slice(7));
  }
  return (
    trimString(request.headers.get('x-morpheus-runtime-token')) ||
    trimString(request.headers.get('x-api-key'))
  );
}

function isTrustedAutomationRequest(request, env) {
  const token = extractTrustedAuthToken(request);
  if (!token) return false;
  const trustedTokens = [
    env.MORPHEUS_RUNTIME_TOKEN,
    env.MORPHEUS_EDGE_RUNTIME_TOKEN,
    env.MORPHEUS_ORIGIN_TOKEN,
    env.PHALA_API_TOKEN,
    env.PHALA_SHARED_SECRET,
  ]
    .map(trimString)
    .filter(Boolean);
  return trustedTokens.includes(token);
}

function resolveCacheRule(url, request) {
  return CACHE_RULES.find((rule) => rule.match(url, request)) || null;
}

async function verifyTurnstile(request, env) {
  const secret = trimString(env.TURNSTILE_WORKER_SECRET || env.TURNSTILE_SECRET_KEY);
  if (!secret) return null;

  const url = new URL(request.url);
  if (!shouldProtectWithTurnstile(url.pathname)) return null;
  if (isTrustedAutomationRequest(request, env)) return null;

  const cloned = request.clone();
  const contentType = trimString(cloned.headers.get('content-type')).toLowerCase();
  let token =
    trimString(request.headers.get('cf-turnstile-token')) ||
    trimString(request.headers.get('x-turnstile-token'));

  if (!token && contentType.includes('application/json')) {
    const body = await cloned.json().catch(() => ({}));
    token = trimString(body.turnstile_token || body.turnstileToken);
  }

  if (!token) {
    return json(403, { error: 'turnstile_required' });
  }

  const formData = new URLSearchParams();
  formData.set('secret', secret);
  formData.set('response', token);
  formData.set('remoteip', getClientIp(request));

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: formData,
  });
  const payload = await response.json().catch(() => ({}));
  if (!payload.success) {
    return json(403, {
      error: 'turnstile_failed',
      details: payload['error-codes'] || [],
    });
  }
  return null;
}

async function applyNativeRateLimit(request, env, routeKey) {
  if (isTrustedAutomationRequest(request, env)) return null;
  if (!env.MORPHEUS_RATE_LIMITER || typeof env.MORPHEUS_RATE_LIMITER.limit !== 'function') {
    return applyUpstashRateLimitImpl(request, env, routeKey);
  }
  const verdict = await env.MORPHEUS_RATE_LIMITER.limit({
    key: `${routeKey}:${getClientIp(request)}`,
  });
  if (verdict?.success) return null;
  const retryAfter = verdict?.retryAfter ?? 60;
  return json(
    429,
    { error: 'rate_limit_exceeded', route: routeKey },
    { 'retry-after': String(retryAfter) }
  );
}

function routeLimitConfig(routeKey, env) {
  const defaults = UPSTASH_ROUTE_LIMITS[routeKey];
  if (!defaults) return null;
  const upper = routeKey.toUpperCase().replace(/-/g, '_');
  return {
    limit: Number(env[`MORPHEUS_RATE_LIMIT_${upper}_MAX`] || defaults.limit),
    windowMs: Number(env[`MORPHEUS_RATE_LIMIT_${upper}_WINDOW_MS`] || defaults.windowMs),
  };
}

async function applyUpstashRateLimitImpl(request, env, routeKey) {
  if (isTrustedAutomationRequest(request, env)) return null;
  const config = routeLimitConfig(routeKey, env);
  if (!config) return null;

  const key = `morpheus:edge:ratelimit:${routeKey}:${getClientIp(request)}`;
  const result = await applyUpstashRateLimit(env, key, {
    max: config.limit,
    windowMs: config.windowMs,
  });

  if (!result) return null;
  if (result.allowed === false) {
    return json(
      429,
      { error: 'rate_limit_exceeded', route: routeKey },
      { 'retry-after': String(result.retryAfter) }
    );
  }
  return json(503, { error: 'rate_limit_backend_unavailable' });
}

function buildOriginRequest(request, env) {
  const incomingUrl = new URL(request.url);
  const routing = resolveNetworkRoute(incomingUrl, env);
  const originBaseUrl = routing.originBaseUrl;
  if (!originBaseUrl) {
    throw new Error(`origin URL is required for network ${routing.network}`);
  }

  const targetUrl = `${originBaseUrl}${routing.forwardedPath}${incomingUrl.search}`;
  const headers = new Headers(request.headers);
  headers.delete('host');
  if (!headers.has('authorization') && trimString(env.MORPHEUS_ORIGIN_TOKEN)) {
    headers.set('authorization', `Bearer ${trimString(env.MORPHEUS_ORIGIN_TOKEN)}`);
  }
  headers.set('x-forwarded-proto', 'https');
  headers.set('x-edge-route', incomingUrl.pathname);
  headers.set('x-morpheus-network', routing.network);

  return new Request(targetUrl, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'follow',
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const routing = resolveNetworkRoute(url, env);

    if (url.pathname === '/' || url.pathname === '') {
      return json(200, {
        service: 'morpheus-edge-gateway',
        domain: url.host,
        routes: {
          mainnet: `${url.origin}/mainnet/health`,
          testnet: `${url.origin}/testnet/health`,
        },
        default_network: routing.network,
      });
    }

    const turnstileRequest =
      routing.routePrefix && url.pathname.startsWith(routing.routePrefix)
        ? new Request(`${url.origin}${routing.forwardedPath}${url.search}`, request)
        : request;
    const turnstileFailure = await verifyTurnstile(turnstileRequest, env);
    if (turnstileFailure) return turnstileFailure;

    const routeKey = routing.forwardedPath.endsWith('/paymaster/authorize')
      ? 'paymaster'
      : routing.forwardedPath.endsWith('/relay/transaction')
        ? 'relay'
        : routing.forwardedPath.endsWith('/compute/execute')
          ? 'compute'
          : routing.forwardedPath.endsWith('/vrf/random')
            ? 'vrf'
            : routing.forwardedPath.endsWith('/oracle/query')
              ? 'oracle-query'
              : routing.forwardedPath.endsWith('/oracle/smart-fetch')
                ? 'oracle-query'
                : routing.forwardedPath.endsWith('/feeds/price') ||
                    /\/feeds\/price\//.test(routing.forwardedPath)
                  ? 'feeds-price'
                  : 'origin';

    const rateLimited = await applyNativeRateLimit(request, env, routeKey);
    if (rateLimited) return rateLimited;

    const cacheRule = resolveCacheRule(url, request);
    const cache = caches.default;
    if (cacheRule) {
      const cached = await cache.match(request);
      if (cached) return cached;
    }

    const originRequest = buildOriginRequest(request, env);
    let originResponse;
    try {
      originResponse = await fetch(originRequest);
    } catch (error) {
      return json(
        503,
        {
          error: 'origin_unavailable',
          network: routing.network,
          route: routeKey,
          message: error instanceof Error ? error.message : String(error),
        },
        { 'cache-control': 'no-store' }
      );
    }
    if (originResponse.status >= 520) {
      return json(
        503,
        {
          error: 'origin_unavailable',
          network: routing.network,
          route: routeKey,
          upstream_status: originResponse.status,
        },
        { 'cache-control': 'no-store' }
      );
    }
    const response = new Response(originResponse.body, originResponse);
    response.headers.set('x-morpheus-edge', 'cloudflare');
    response.headers.set('x-morpheus-route', routeKey);
    response.headers.set('x-morpheus-network', routing.network);

    if (cacheRule && originResponse.ok) {
      response.headers.set('cache-control', `public, max-age=${cacheRule.ttl}`);
      ctx.waitUntil(cache.put(request, response.clone()));
    } else {
      response.headers.set('cache-control', 'no-store');
    }

    return response;
  },
};
