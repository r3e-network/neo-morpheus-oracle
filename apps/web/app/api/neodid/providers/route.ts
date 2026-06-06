import { proxyToNitro } from '@/lib/nitro';

export async function GET() {
  return proxyToNitro(
    '/neodid/providers',
    { method: 'GET' },
    {
      route: '/api/neodid/providers',
      category: 'system',
    }
  );
}
