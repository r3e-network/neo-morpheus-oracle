import {
  json,
  normalizeBoolean,
  parseDurationMs,
  sha256Hex,
  stableStringify,
  trimString,
} from './core.js';
import {
  claimIdempotencyLock,
  incrementFixedWindowCounter,
  isUpstashEnabled,
  upstashDelete,
  upstashGetJson,
  upstashSetJson,
} from './upstash.js';

function firstTruthy(...values) {
  for (const value of values) {
    const trimmed = trimString(value);
    if (trimmed) return trimmed;
  }
  return '';
}

function resolveRouteName(path) {
  if (path.endsWith('/paymaster/authorize')) return 'paymaster_authorize';
  if (path.endsWith('/relay/transaction')) return 'relay_transaction';
  if (path.endsWith('/txproxy/invoke')) return 'txproxy_invoke';
  if (path.endsWith('/compute/execute')) return 'compute_execute';
  if (path.endsWith('/vrf/random')) return 'vrf_random';
  if (path.endsWith('/oracle/query')) return 'oracle_query';
  if (path.endsWith('/oracle/smart-fetch')) return 'oracle_smart_fetch';
  if (path.endsWith('/oracle/feed')) return 'oracle_feed';
  if (path.endsWith('/neodid/action-ticket')) return 'neodid_action_ticket';
  if (path.endsWith('/neodid/recovery-ticket')) return 'neodid_recovery_ticket';
  if (path.endsWith('/neodid/zklogin-ticket')) return 'neodid_zklogin_ticket';
  return '';
}

function routePolicy(name) {
  const enabled = normalizeBoolean(process.env.MORPHEUS_UPSTASH_GUARDS_ENABLED, false);
  if (!enabled || !name) return null;

  const defaults = {
    paymaster_authorize: { max: 20, window: '1m', idempotencyTtl: '15m', lockTtl: '30s' },
    relay_transaction: { max: 20, window: '1m', idempotencyTtl: '15m', lockTtl: '30s' },
    txproxy_invoke: { max: 30, window: '1m', idempotencyTtl: '5m', lockTtl: '15s' },
    compute_execute: { max: 10, window: '1m', idempotencyTtl: '10m', lockTtl: '30s' },
    vrf_random: { max: 15, window: '1m', idempotencyTtl: '10m', lockTtl: '30s' },
    oracle_query: { max: 30, window: '1m', idempotencyTtl: '30s', lockTtl: '10s' },
    oracle_smart_fetch: { max: 30, window: '1m', idempotencyTtl: '30s', lockTtl: '10s' },
    oracle_feed: { max: 20, window: '1m', idempotencyTtl: '2m', lockTtl: '15s' },
    neodid_action_ticket: { max: 12, window: '1m', idempotencyTtl: '5m', lockTtl: '15s' },
    neodid_recovery_ticket: { max: 6, window: '1m', idempotencyTtl: '5m', lockTtl: '15s' },
    neodid_zklogin_ticket: { max: 8, window: '1m', idempotencyTtl: '5m', lockTtl: '15s' },
  };

  const current = defaults[name];
  if (!current) return null;

  const upper = name.toUpperCase();
  return {
    name,
    max: Number(process.env[`MORPHEUS_RATE_LIMIT_${upper}_MAX`] || current.max),
    windowMs: parseDurationMs(
      process.env[`MORPHEUS_RATE_LIMIT_${upper}_WINDOW_MS`] || current.window,
      parseDurationMs(current.window, 60_000)
    ),
    idempotencyTtlMs: parseDurationMs(
      process.env[`MORPHEUS_IDEMPOTENCY_${upper}_TTL_MS`] || current.idempotencyTtl,
      parseDurationMs(current.idempotencyTtl, 60_000)
    ),
    lockTtlMs: parseDurationMs(
      process.env[`MORPHEUS_IDEMPOTENCY_${upper}_LOCK_TTL_MS`] || current.lockTtl,
      parseDurationMs(current.lockTtl, 15_000)
    ),
  };
}

function getClientIp(request) {
  const headers = request.headers;
  const forwarded = firstTruthy(
    headers.get('cf-connecting-ip'),
    headers.get('x-real-ip'),
    headers.get('x-client-ip')
  );
  if (forwarded) return forwarded;
  const xff = trimString(headers.get('x-forwarded-for'));
  if (xff) return trimString(xff.split(',')[0]);
  return 'unknown';
}

function payloadIdentity(payload = {}) {
  const paymaster =
    payload?.paymaster && typeof payload.paymaster === 'object' ? payload.paymaster : {};
  const metaInvocation =
    payload?.metaInvocation && typeof payload.metaInvocation === 'object'
      ? payload.metaInvocation
      : {};
  const firstArg = Array.isArray(metaInvocation.args) ? metaInvocation.args[0] : null;
  return {
    accountId: firstTruthy(
      payload.account_id,
      payload.accountId,
      paymaster.account_id,
      paymaster.accountId,
      firstArg?.value
    ).toLowerCase(),
    dappId: firstTruthy(
      payload.dapp_id,
      payload.dappId,
      paymaster.dapp_id,
      paymaster.dappId
    ).toLowerCase(),
    operationHash: firstTruthy(
      payload.operation_hash,
      payload.operationHash,
      payload.request_id,
      payload.requestId,
      payload.idempotency_key,
      paymaster.operation_hash,
      paymaster.operationHash
    ).toLowerCase(),
  };
}

function deriveIdempotencyKey(routeName, payload = {}, request) {
  const explicit = firstTruthy(
    request.headers.get('idempotency-key'),
    request.headers.get('x-idempotency-key'),
    payload.idempotency_key,
    payload.idempotencyKey
  );
  if (explicit) return explicit;

  const identity = payloadIdentity(payload);
  if (identity.operationHash) return identity.operationHash;

  if (routeName === 'oracle_query' || routeName === 'oracle_smart_fetch') {
    return sha256Hex({
      routeName,
      provider: payload.provider,
      symbol: payload.symbol,
      url: payload.url,
      method: payload.method,
      json_path: payload.json_path,
      headers: payload.headers,
      body: payload.body,
      encrypted_token_ref: payload.encrypted_token_ref,
      project_slug: payload.project_slug,
    });
  }

  return '';
}

function buildRateLimitKey(routeName, request, payload = {}) {
  const clientIp = getClientIp(request);
  const identity = payloadIdentity(payload);
  return [
    'morpheus',
    'ratelimit',
    routeName,
    clientIp || 'unknown',
    identity.accountId || 'anon',
    identity.dappId || 'none',
  ].join(':');
}

function buildResponseCacheKey(routeName, idempotencyKey) {
  return `morpheus:idem:response:${routeName}:${sha256Hex(idempotencyKey)}`;
}

function buildLockKey(routeName, idempotencyKey) {
  return `morpheus:idem:lock:${routeName}:${sha256Hex(idempotencyKey)}`;
}

export async function applyRequestGuards({ request, path, payload }) {
  const routeName = resolveRouteName(path);
  const policy = routePolicy(routeName);
  if (!policy || !isUpstashEnabled()) {
    return { ok: true, routeName };
  }

  const rateLimit = await incrementFixedWindowCounter(
    buildRateLimitKey(routeName, request, payload),
    {
      max: policy.max,
      windowMs: policy.windowMs,
    }
  );
  if (!rateLimit.allowed) {
    return {
      ok: false,
      routeName,
      response: json(
        429,
        {
          error: 'rate_limit_exceeded',
          route: routeName,
          retry_after: rateLimit.retryAfter,
        },
        { 'retry-after': String(rateLimit.retryAfter) }
      ),
    };
  }

  const idempotencyKey = deriveIdempotencyKey(routeName, payload, request);
  if (!idempotencyKey) {
    return { ok: true, routeName };
  }

  const responseCacheKey = buildResponseCacheKey(routeName, idempotencyKey);
  const cached = await upstashGetJson(responseCacheKey);
  if (cached?.status && cached.body !== undefined) {
    return {
      ok: false,
      routeName,
      response: json(cached.status, cached.body, cached.headers || {}),
      cached: true,
    };
  }

  const lockKey = buildLockKey(routeName, idempotencyKey);
  const claimed = await claimIdempotencyLock(lockKey, policy.lockTtlMs);
  if (!claimed) {
    return {
      ok: false,
      routeName,
      response: json(
        409,
        {
          error: 'request_in_progress',
          route: routeName,
        },
        { 'retry-after': String(Math.max(Math.ceil(policy.lockTtlMs / 1000), 1)) }
      ),
    };
  }

  return {
    ok: true,
    routeName,
    idempotency: {
      responseCacheKey,
      lockKey,
      ttlMs: policy.idempotencyTtlMs,
    },
  };
}

export async function persistGuardResult(guard, response) {
  if (!guard?.idempotency || !response) return;
  try {
    const cloned = response.clone();
    const bodyText = await cloned.text();
    const body = bodyText ? JSON.parse(bodyText) : null;
    if (response.status < 500) {
      await upstashSetJson(
        guard.idempotency.responseCacheKey,
        {
          status: response.status,
          headers: {
            'content-type': response.headers.get('content-type') || 'application/json',
          },
          body,
        },
        { ttlMs: guard.idempotency.ttlMs }
      );
    }
  } catch {
    // Best-effort cache population only.
  } finally {
    await upstashDelete(guard.idempotency.lockKey).catch(() => {});
  }
}
