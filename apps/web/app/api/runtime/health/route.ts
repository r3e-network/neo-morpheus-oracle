import { proxyToNitro } from '@/lib/nitro';

export async function GET() {
  return proxyToNitro(
    '/health',
    { method: 'GET' },
    {
      route: '/api/runtime/health',
      category: 'runtime',
    }
  );
}
