import { json, timingSafeCompare, trimString, getClientIp } from '@neo-morpheus-oracle/shared/utils';
import { applyUpstashRateLimit } from '@neo-morpheus-oracle/shared/rate-limit';

const RATE_LIMITS = {
  oracle_request: { limit: 30, windowMs: 60_000 },
  feed_tick: { limit: 60, windowMs: 60_000 },
  callback_broadcast: { limit: 60, windowMs: 60_000 },
  automation_execute: { limit: 30, windowMs: 60_000 },
};

function resolveAcceptedKeys(env) {
  return [
    env.MORPHEUS_CONTROL_PLANE_API_KEY,
    env.MORPHEUS_OPERATOR_API_KEY,
    env.MORPHEUS_PROVIDER_CONFIG_API_KEY,
    env.PHALA_API_TOKEN,
  ]
    .map((v) => trimString(v))
    .filter(Boolean);
}

function validateAuth(request, env) {
  const keys = resolveAcceptedKeys(env);
  if (keys.length === 0) return null;
  const bearer = trimString(request.headers.get('authorization'));
  const admin = trimString(request.headers.get('x-admin-api-key'));
  for (const key of keys) {
    if (timingSafeCompare(bearer, `Bearer ${key}`)) return null;
    if (timingSafeCompare(admin, key)) return null;
  }
  return json(401, { error: 'unauthorized' });
}

async function applyRateLimit(request, env, queueName) {
  const config = RATE_LIMITS[queueName];
  if (!config) return null;

  const key = `morpheus:control-plane:${queueName}:${getClientIp(request)}`;
  const result = await applyUpstashRateLimit(env, key, {
    max: config.limit,
    windowMs: config.windowMs,
  });

  if (!result) return null;
  if (result.allowed === false) {
    return json(
      429,
      { error: 'rate_limit_exceeded', queue: queueName },
      { 'retry-after': String(result.retryAfter) }
    );
  }
  return json(503, { error: 'rate_limit_backend_unavailable' });
}

export { validateAuth, applyRateLimit };
