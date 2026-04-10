import test from 'node:test';
import assert from 'node:assert/strict';

import runtimeCatalog from '../../../apps/web/public/morpheus-runtime-catalog.json' with { type: 'json' };
import {
  buildPublicRuntimeCatalogSummary,
  buildPublicRuntimeStatusSnapshot,
} from './public-runtime.js';

test('buildPublicRuntimeCatalogSummary preserves canonical discovery links and workflow ids', () => {
  const summary = buildPublicRuntimeCatalogSummary(runtimeCatalog);

  assert.equal(summary.envelope.version, runtimeCatalog.envelope.version);
  assert.equal(summary.topology.executionPlane, 'tee_runtime');
  assert.equal(summary.risk.observer, 'independent_observer');
  assert.equal(summary.workflows.count, runtimeCatalog.workflows.length);
  assert.ok(summary.workflows.ids.includes('automation.upkeep'));
  assert.deepEqual(summary.links, {
    catalog: '/api/runtime/catalog',
    workflows: '/api/workflows',
    policies: '/api/policies',
  });
});

test('buildPublicRuntimeStatusSnapshot combines origin probes into an operational public snapshot', () => {
  const snapshot = buildPublicRuntimeStatusSnapshot({
    catalog: runtimeCatalog,
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

  assert.equal(snapshot.catalog.envelope.version, runtimeCatalog.envelope.version);
  assert.equal(snapshot.catalog.workflows.count, runtimeCatalog.workflows.length);
  assert.equal(snapshot.catalog.links.catalog, '/api/runtime/catalog');
  assert.equal(snapshot.runtime.status, 'operational');
  assert.equal(snapshot.runtime.health.state, 'ok');
  assert.equal(snapshot.runtime.info.appId, 'app-123');
  assert.equal(snapshot.runtime.info.composeHash, 'compose-hash-123');
});
