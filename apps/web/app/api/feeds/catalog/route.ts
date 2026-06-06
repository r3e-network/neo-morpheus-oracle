import { proxyToNitro } from '@/lib/nitro';

export async function GET() {
  return proxyToNitro(
    '/feeds/catalog',
    { method: 'GET' },
    {
      route: '/api/feeds/catalog',
      category: 'feed',
    }
  );
}
