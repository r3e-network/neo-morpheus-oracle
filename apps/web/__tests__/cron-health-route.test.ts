import { describe, expect, it, vi } from 'vitest';

const sendHeartbeat = vi.fn(async () => true);
const recordOperationLog = vi.fn(
  () =>
    new Promise<void>(() => {
      // Keep pending to prove the health route does not wait on operation logging.
    })
);

vi.mock('@/lib/heartbeat', () => ({ sendHeartbeat }));
vi.mock('@/lib/operation-logs', () => ({ recordOperationLog }));

describe('cron health route', () => {
  it('waits for BetterStack heartbeat but does not block on operation logging', async () => {
    vi.stubEnv('MORPHEUS_BETTERSTACK_CRON_HEALTH_HEARTBEAT_URL', 'https://heartbeat.example');

    const { GET } = await import('../app/api/cron/health/route');
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      status: 'ok',
      service: 'morpheus-cron',
      heartbeat_sent: true,
    });
    expect(sendHeartbeat).toHaveBeenCalledWith('https://heartbeat.example', {
      status: 'ok',
      service: 'morpheus-cron',
    });
    expect(recordOperationLog).toHaveBeenCalledWith(
      expect.objectContaining({
        route: '/api/cron/health',
        method: 'GET',
        category: 'system',
        httpStatus: 200,
      })
    );
  });
});
