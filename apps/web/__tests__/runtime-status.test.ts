import { describe, expect, it } from 'vitest';

describe('public runtime status snapshot', () => {
  it('reports an operational runtime when health and info probes are healthy', async () => {
    const { buildPublicRuntimeStatusSnapshot } = await import('../lib/runtime-status');

    const snapshot = buildPublicRuntimeStatusSnapshot({
      checkedAt: '2026-04-10T00:00:00.000Z',
      health: {
        ok: true,
        status: 200,
        body: { status: 'ok' },
      },
      info: {
        ok: true,
        status: 200,
        body: {
          version: '1.2.3',
          dstack: {
            app_id: 'app-123',
            compose_hash: 'compose-hash-123',
            client_kind: 'dstack',
          },
        },
      },
    });

    expect(snapshot.runtime.status).toBe('operational');
    expect(snapshot.runtime.health.state).toBe('ok');
    expect(snapshot.runtime.info.ok).toBe(true);
    expect(snapshot.runtime.info.appId).toBe('app-123');
    expect(snapshot.runtime.info.composeHash).toBe('compose-hash-123');
    expect(snapshot.catalog.topology.executionPlane).toBe('tee_runtime');
    expect(snapshot.catalog.automation.triggerKinds).toContain('interval');
  });

  it('reports a degraded runtime when info is unavailable but health is still ok', async () => {
    const { buildPublicRuntimeStatusSnapshot } = await import('../lib/runtime-status');

    const snapshot = buildPublicRuntimeStatusSnapshot({
      checkedAt: '2026-04-10T00:00:00.000Z',
      health: {
        ok: true,
        status: 200,
        body: { status: 'ok' },
      },
      info: {
        ok: false,
        status: 503,
        body: { error: 'runtime info unavailable' },
      },
    });

    expect(snapshot.runtime.status).toBe('degraded');
    expect(snapshot.runtime.info.ok).toBe(false);
    expect(snapshot.runtime.info.detail).toBe('runtime info unavailable');
  });

  it('reports runtime down when the health probe is unavailable', async () => {
    const { buildPublicRuntimeStatusSnapshot } = await import('../lib/runtime-status');

    const snapshot = buildPublicRuntimeStatusSnapshot({
      checkedAt: '2026-04-10T00:00:00.000Z',
      health: {
        ok: false,
        status: 503,
        body: { error: 'upstream unavailable' },
      },
      info: {
        ok: true,
        status: 200,
        body: {
          dstack: {
            app_id: 'app-123',
          },
        },
      },
    });

    expect(snapshot.runtime.status).toBe('down');
    expect(snapshot.runtime.health.state).toBe('down');
    expect(snapshot.runtime.health.detail).toBe('upstream unavailable');
  });

  it('builds public runtime notes for status surfaces', async () => {
    const { buildPublicRuntimeStatusSnapshot, getPublicRuntimeStatusNotes } = await import('../lib/runtime-status');

    const snapshot = buildPublicRuntimeStatusSnapshot({
      checkedAt: '2026-04-10T00:00:00.000Z',
      health: {
        ok: true,
        status: 200,
        body: { status: 'ok' },
      },
      info: {
        ok: true,
        status: 200,
        body: {
          dstack: {
            app_id: 'app-123',
          },
        },
      },
    });

    expect(getPublicRuntimeStatusNotes(snapshot)).toEqual([
      'Execution: tee_runtime',
      'Risk: independent_observer',
      'Automation: interval, threshold',
      'App ID: app-123',
    ]);
  });
});
