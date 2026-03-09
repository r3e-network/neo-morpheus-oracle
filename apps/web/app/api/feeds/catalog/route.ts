import { proxyToPhala } from '@/lib/phala';

export async function GET() {
  return proxyToPhala('/feeds/catalog', { method: 'GET' });
}
