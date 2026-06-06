import { proxyToNitro } from '@/lib/nitro';

export async function GET() {
  return proxyToNitro(
    '/info',
    { method: 'GET' },
    {
      route: '/api/runtime/info',
      category: 'runtime',
    }
  );
}
