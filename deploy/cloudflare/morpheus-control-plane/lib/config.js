import { trimString, parseTimestampMs } from '@neo-morpheus-oracle/shared/utils';

const DEFAULT_REQUEUE_LIMIT = 50;
const DEFAULT_STALE_PROCESSING_MS = 10 * 60_000;

function resolveRequeueLimit(env) {
  const configured = Number(env.MORPHEUS_CONTROL_PLANE_REQUEUE_LIMIT || DEFAULT_REQUEUE_LIMIT);
  if (!Number.isFinite(configured)) return DEFAULT_REQUEUE_LIMIT;
  return Math.min(Math.max(Math.floor(configured), 1), 200);
}

function resolveStaleProcessingMs(env) {
  const configured = Number(
    env.MORPHEUS_CONTROL_PLANE_STALE_PROCESSING_MS || DEFAULT_STALE_PROCESSING_MS
  );
  if (!Number.isFinite(configured)) return DEFAULT_STALE_PROCESSING_MS;
  return Math.max(Math.floor(configured), 30_000);
}

function isStaleProcessing(job, nowMs, staleProcessingMs) {
  const startedMs = parseTimestampMs(job?.started_at);
  if (!startedMs) return false;
  return nowMs - startedMs >= staleProcessingMs;
}

function computeRetryDelaySeconds(attempt, env) {
  const baseSeconds = Math.max(Number(env.MORPHEUS_CONTROL_PLANE_RETRY_BASE_SECONDS || 5), 1);
  const maxSeconds = Math.max(
    Number(env.MORPHEUS_CONTROL_PLANE_RETRY_MAX_SECONDS || 300),
    baseSeconds
  );
  const exp = Math.min(Math.max(Number(attempt || 1) - 1, 0), 10);
  const delay = Math.min(maxSeconds, baseSeconds * 2 ** exp);
  const jittered = delay * (0.8 + Math.random() * 0.4);
  return Math.max(1, Math.round(jittered));
}

function resolveNetworkRoute(url) {
  const path = trimString(url.pathname || '/');
  const rawSegments = path.replace(/^\/+/, '').split('/');
  const segments =
    trimString(rawSegments[0]).toLowerCase() === 'control' ? rawSegments.slice(1) : rawSegments;
  const maybeNetwork = trimString(segments[0]).toLowerCase();
  const network = maybeNetwork === 'mainnet' ? 'mainnet' : 'testnet';
  const routePath =
    maybeNetwork === 'mainnet' || maybeNetwork === 'testnet'
      ? `/${segments.slice(1).join('/')}`.replace(/\/+$/, '') || '/'
      : path.replace(/\/+$/, '') || '/';
  return {
    network,
    routePath,
  };
}

function resolveJobMetadata(routePath, payload) {
  const body = payload && typeof payload === 'object' ? payload : {};
  return {
    target_chain: trimString(body.target_chain || '') || null,
    project_slug: trimString(body.project_slug || '') || null,
    request_id: trimString(body.request_id || body.oracle_request_id || '') || null,
    dedupe_key:
      trimString(body.dedupe_key || body.idempotency_key || body.request_id || '') || null,
  };
}

export {
  resolveRequeueLimit,
  resolveStaleProcessingMs,
  isStaleProcessing,
  computeRetryDelaySeconds,
  resolveNetworkRoute,
  resolveJobMetadata,
};
