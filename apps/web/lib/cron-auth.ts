import { timingSafeCompare } from '@neo-morpheus-oracle/shared/utils';
import { isAuthorizedControlPlaneRequest } from './control-plane-auth';

// Mirrors the /api/cron/feed guard so every cron route demands the same
// credentials before doing cron-only work (e.g. BetterStack heartbeats):
// a public hit that fires the heartbeat would keep the cron-liveness monitor
// green even after the cron schedule breaks.

export function isAuthorizedCronSecretRequest(request: Request) {
  const runtimeEnv = process.env as Record<string, string | undefined>;
  const configured = runtimeEnv['MORPHEUS_CRON_SECRET'] || runtimeEnv['CRON_SECRET'] || '';
  if (!configured) return false;
  const bearer = request.headers.get('authorization') || '';
  const headerSecret =
    request.headers.get('x-morpheus-cron') || request.headers.get('x-cron-token') || '';
  return (
    timingSafeCompare(bearer, `Bearer ${configured}`) || timingSafeCompare(headerSecret, configured)
  );
}

export function isVercelCronUserAgentRequest(request: Request) {
  // The `vercel-cron` User-Agent is trivially spoofable, so it is only an
  // acceptable fallback in non-production environments. In production a real
  // shared secret (MORPHEUS_CRON_SECRET/CRON_SECRET) or an authorized
  // control-plane request is required.
  if (process.env.NODE_ENV === 'production') return false;
  const routeUrl = new URL(request.url);
  const userAgent = (request.headers.get('user-agent') || '').toLowerCase();
  return userAgent.includes('vercel-cron') && Array.from(routeUrl.searchParams.keys()).length === 0;
}

export function isAuthorizedCronRequest(request: Request) {
  return (
    isAuthorizedCronSecretRequest(request) ||
    isAuthorizedControlPlaneRequest(request) ||
    isVercelCronUserAgentRequest(request)
  );
}
