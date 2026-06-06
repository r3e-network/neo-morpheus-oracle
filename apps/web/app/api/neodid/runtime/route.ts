import { proxyToNitro } from '@/lib/nitro';

export async function GET() {
  return proxyToNitro(
    '/neodid/runtime',
    { method: 'GET' },
    {
      route: '/api/neodid/runtime',
      category: 'system',
    }
  );
}
