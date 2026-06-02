import { proxyToPhala } from '@/lib/phala';

function readNetwork(request: Request) {
  return new URL(request.url).searchParams.get('network');
}

export async function GET(request: Request) {
  const network = readNetwork(request);
  return proxyToPhala(
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
