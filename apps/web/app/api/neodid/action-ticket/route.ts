import { proxyToPhala } from '@/lib/phala';

export async function POST(request: Request) {
  const body = await request.text();
  return proxyToPhala(
    '/neodid/action-ticket',
    {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json' },
    },
    {
      route: '/api/neodid/action-ticket',
      category: 'system',
      requestPayload: body,
    }
  );
}
