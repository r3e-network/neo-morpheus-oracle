import { proxyToPhala } from '@/lib/phala';

export async function GET() {
  return proxyToPhala(
    '/health',
    { method: 'GET' },
    {
      route: '/api/runtime/health',
      category: 'runtime',
    }
  );
}
