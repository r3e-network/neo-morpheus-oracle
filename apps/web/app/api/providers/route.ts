import { badRequest } from '@/lib/api-helpers';
import { isKnownNetworkKey } from '@/lib/networks';
import { proxyToNitro } from '@/lib/nitro';

function readNetwork(request: Request) {
  return new URL(request.url).searchParams.get('network');
}

export async function GET(request: Request) {
  const network = readNetwork(request);
  if (network && !isKnownNetworkKey(network)) {
    return badRequest(`unknown network "${network}"; expected "mainnet" or "testnet"`);
  }
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
