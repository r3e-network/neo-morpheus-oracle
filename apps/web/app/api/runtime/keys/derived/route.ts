import { proxyToPhala } from '@/lib/phala';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const role = (url.searchParams.get('role') || 'worker').trim() || 'worker';
  return proxyToPhala(
    `/keys/derived?role=${encodeURIComponent(role)}`,
    { method: 'GET' },
    {
      route: '/api/runtime/keys/derived',
      category: 'runtime',
      requestPayload: { role },
    }
  );
}
