import { proxyToNitro } from '@/lib/nitro';

export async function GET() {
  return proxyToNitro(
    '/compute/functions',
    { method: 'GET' },
    {
      route: '/api/compute/functions',
      category: 'compute',
    }
  );
}
