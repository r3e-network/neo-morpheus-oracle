import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('control-plane fail-open behavior', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv('MORPHEUS_CONTROL_PLANE_URL', 'https://control.meshmini.app');
    vi.stubEnv('MORPHEUS_NETWORK', 'mainnet');
    vi.stubEnv('MORPHEUS_CONTROL_PLANE_API_KEY', 'control-plane-key');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('marks Cloudflare 1027 responses as fail-open', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('error code: 1027', {
          status: 429,
          headers: { 'content-type': 'text/html; charset=UTF-8' },
        })
      )
    );

    const { dispatchToControlPlane, shouldUseControlPlaneFallback } = await import('../lib/control-plane');
    const response = await dispatchToControlPlane('/oracle/query', {
      method: 'POST',
      body: JSON.stringify({ symbol: 'TWELVEDATA:NEO-USD' }),
    });

    expect(response.status).toBe(429);
    expect(shouldUseControlPlaneFallback(response)).toBe(true);
    expect(response.headers.get('x-morpheus-control-plane-url')).toBe(
      'https://control.meshmini.app/mainnet/oracle/query'
    );
  });

  it('marks fetch exceptions as fail-open', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('socket hang up');
      })
    );

    const { dispatchToControlPlane, shouldUseControlPlaneFallback } = await import('../lib/control-plane');
    const response = await dispatchToControlPlane('/compute/execute', {
      method: 'POST',
      body: JSON.stringify({ script: 'return 1;' }),
    });

    expect(response.status).toBe(503);
    expect(shouldUseControlPlaneFallback(response)).toBe(true);
    expect(await response.json()).toEqual({
      error: 'control_plane_unavailable',
      detail: 'socket hang up',
    });
  });

  it('does not fail-open healthy control-plane responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ id: 'job-1', status: 'dispatched' }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        })
      )
    );

    const { dispatchToControlPlane, shouldUseControlPlaneFallback } = await import('../lib/control-plane');
    const response = await dispatchToControlPlane('/oracle/smart-fetch', {
      method: 'POST',
      body: JSON.stringify({ symbol: 'TWELVEDATA:NEO-USD' }),
    });

    expect(response.status).toBe(202);
    expect(shouldUseControlPlaneFallback(response)).toBe(false);
    expect(await response.json()).toEqual({ id: 'job-1', status: 'dispatched' });
  });
});
