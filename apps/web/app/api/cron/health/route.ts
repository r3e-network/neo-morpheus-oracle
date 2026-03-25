import { sendHeartbeat } from '@/lib/heartbeat';
import { recordOperationLog } from '@/lib/operation-logs';

export async function GET() {
  const body = { status: 'ok', service: 'morpheus-cron' };
  void sendHeartbeat(process.env.MORPHEUS_BETTERSTACK_CRON_HEALTH_HEARTBEAT_URL || '', body);
  await recordOperationLog({
    route: '/api/cron/health',
    method: 'GET',
    category: 'system',
    responsePayload: body,
    httpStatus: 200,
  });
  return Response.json(body);
}
