import { proxyToNitro } from '@/lib/nitro';

function readNetwork(request: Request) {
  return new URL(request.url).searchParams.get('network');
}

export async function GET(request: Request) {
  const network = readNetwork(request);
  return proxyToNitro(
    '/providers',
    { method: 'GET' },
    {
      route: '/api/providers',
      category: 'oracle',
      network,
      metadata: { network },
    }
  );
}
