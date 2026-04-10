import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const runtimeCatalog = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'apps', 'web', 'public', 'morpheus-runtime-catalog.json'), 'utf8')
);

function buildStatusSnapshot(catalog) {
  return {
    checkedAt: '2026-04-10T00:00:00.000Z',
    catalog: {
      envelope: catalog.envelope,
      topology: catalog.topology,
      risk: catalog.risk,
      automation: catalog.automation,
      workflows: {
        count: catalog.workflows.length,
        ids: catalog.workflows.map((item) => item.id),
      },
      links: {
        catalog: '/api/runtime/catalog',
        workflows: '/api/workflows',
        policies: '/api/policies',
      },
    },
    runtime: {
      status: 'operational',
      health: {
        ok: true,
        statusCode: 200,
        state: 'ok',
        detail: null,
      },
      info: {
        ok: true,
        statusCode: 200,
        appId: 'app-123',
        composeHash: 'compose-123',
        clientKind: 'dstack',
        version: '1.2.3',
        detail: null,
      },
    },
  };
}

test('validatePublicRuntimeApiContract accepts a valid runtime catalog and status pair', async () => {
  const { validatePublicRuntimeApiContract } = await import('./check-public-runtime-api.mjs');

  const summary = validatePublicRuntimeApiContract({
    catalog: runtimeCatalog,
    status: buildStatusSnapshot(runtimeCatalog),
  });

  assert.equal(summary.envelopeVersion, runtimeCatalog.envelope.version);
  assert.equal(summary.runtimeStatus, 'operational');
  assert.equal(summary.executionPlane, runtimeCatalog.topology.executionPlane);
  assert.equal(summary.workflowCount, runtimeCatalog.workflows.length);
});

test('validatePublicRuntimeApiContract rejects envelope drift between catalog and status', async () => {
  const { validatePublicRuntimeApiContract } = await import('./check-public-runtime-api.mjs');

  const status = buildStatusSnapshot(runtimeCatalog);
  status.catalog.envelope = { version: 'drifted-version' };

  assert.throws(
    () => validatePublicRuntimeApiContract({ catalog: runtimeCatalog, status }),
    /envelope version/i
  );
});

test('validatePublicRuntimeApiContract rejects catalogs missing automation.upkeep', async () => {
  const { validatePublicRuntimeApiContract } = await import('./check-public-runtime-api.mjs');

  const invalidCatalog = {
    ...runtimeCatalog,
    workflows: runtimeCatalog.workflows.filter((item) => item.id !== 'automation.upkeep'),
  };

  assert.throws(
    () => validatePublicRuntimeApiContract({ catalog: invalidCatalog, status: buildStatusSnapshot(runtimeCatalog) }),
    /automation\.upkeep/i
  );
});

test('validatePublicRuntimeApiContract rejects unknown runtime status values', async () => {
  const { validatePublicRuntimeApiContract } = await import('./check-public-runtime-api.mjs');

  const status = buildStatusSnapshot(runtimeCatalog);
  status.runtime.status = 'mystery';

  assert.throws(
    () => validatePublicRuntimeApiContract({ catalog: runtimeCatalog, status }),
    /runtime status/i
  );
});
