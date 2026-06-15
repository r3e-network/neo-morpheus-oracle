import { fetchBoxHealth } from '@/lib/runtime-health';

// Re-homed (2026-06): probe the attested in-TEE enclave /health directly instead of
// proxying the retired runtime gateway. Returns the box health body verbatim.
export async function GET() {
  const health = await fetchBoxHealth();
  return Response.json(health.body, {
    status: health.ok ? 200 : 503,
    headers: { 'cache-control': 'no-store' },
  });
}
