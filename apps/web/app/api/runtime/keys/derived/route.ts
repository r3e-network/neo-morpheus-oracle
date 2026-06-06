import { proxyToNitro } from '@/lib/nitro';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const role = (url.searchParams.get('role') || 'worker').trim() || 'worker';
  return proxyToNitro(
    `/keys/derived?role=${encodeURIComponent(role)}`,
    { method: 'GET' },
    {
      route: '/api/runtime/keys/derived',
      category: 'runtime',
      requestPayload: { role },
    }
  );
}
