import { getSelectedNetwork, networkRegistry } from '@/lib/networks';
import { recordOperationLog } from '@/lib/operation-logs';

export async function GET() {
  const body = {
    selected: getSelectedNetwork(),
    available: networkRegistry,
  };
  await recordOperationLog({
    route: '/api/networks',
    method: 'GET',
    category: 'network',
    responsePayload: body,
    httpStatus: 200,
  });
  return Response.json(body);
}
