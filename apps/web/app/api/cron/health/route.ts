import { sendHeartbeat } from '@/lib/heartbeat';
import { recordOperationLog } from '@/lib/operation-logs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const heartbeatSent = await sendHeartbeat(
    process.env.MORPHEUS_BETTERSTACK_CRON_HEALTH_HEARTBEAT_URL || '',
    { status: 'ok', service: 'morpheus-cron' }
  );
  const body = { status: 'ok', service: 'morpheus-cron', heartbeat_sent: heartbeatSent };
  void recordOperationLog({
    route: '/api/cron/health',
    method: 'GET',
    category: 'system',
    responsePayload: body,
    httpStatus: 200,
  });
  return Response.json(body, { headers: { 'cache-control': 'no-store' } });
}
