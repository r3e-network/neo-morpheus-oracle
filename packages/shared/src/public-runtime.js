function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  return structuredClone(value);
}

function readString(value) {
  const trimmed = trimString(value);
  return trimmed || null;
}

function getBodyDetail(body) {
  if (typeof body === 'string') {
    return readString(body);
  }
  if (!isPlainObject(body)) {
    return null;
  }
  return readString(body.error) || readString(body.detail) || readString(body.message);
}

function getHealthState(probe) {
  if (!probe?.ok) {
    return 'down';
  }

  const body = isPlainObject(probe.body) ? probe.body : {};
  const normalizedState = (readString(body.status) || readString(body.state) || '').toLowerCase();

  if (!normalizedState || ['ok', 'healthy', 'ready', 'operational'].includes(normalizedState)) {
    return 'ok';
  }
  if (['degraded', 'warning'].includes(normalizedState)) {
    return 'degraded';
  }
  if (['down', 'error', 'failed', 'unhealthy'].includes(normalizedState)) {
    return 'down';
  }

  return 'ok';
}

function summarizeRuntimeInfo(probe) {
  const body = isPlainObject(probe?.body) ? probe.body : {};
  const dstack = isPlainObject(body.dstack) ? body.dstack : {};

  return {
    ok: Boolean(probe?.ok),
    statusCode: Number(probe?.status || 0),
    appId: readString(dstack.app_id) || readString(body.app_id),
    composeHash: readString(dstack.compose_hash) || readString(body.compose_hash),
    clientKind: readString(dstack.client_kind) || readString(body.client_kind),
    version: readString(body.version) || readString(dstack.version),
    detail: getBodyDetail(probe?.body),
  };
}

function summarizeRuntimeHealth(probe) {
  return {
    ok: Boolean(probe?.ok),
    statusCode: Number(probe?.status || 0),
    state: getHealthState(probe),
    detail: getBodyDetail(probe?.body),
  };
}

export const PUBLIC_RUNTIME_DISCOVERY_LINKS = Object.freeze({
  catalog: '/api/runtime/catalog',
  workflows: '/api/workflows',
  policies: '/api/policies',
});

export function buildPublicRuntimeCatalogSummary(catalog) {
  const workflows = Array.isArray(catalog?.workflows) ? catalog.workflows : [];

  return {
    envelope: clone(catalog?.envelope || {}),
    topology: clone(catalog?.topology || {}),
    risk: clone(catalog?.risk || {}),
    automation: clone(catalog?.automation || {}),
    workflows: {
      count: workflows.length,
      ids: workflows.map((item) => item.id),
    },
    links: { ...PUBLIC_RUNTIME_DISCOVERY_LINKS },
  };
}

export function buildPublicRuntimeStatusSnapshot(input) {
  const health = summarizeRuntimeHealth(input?.health || {});
  const info = summarizeRuntimeInfo(input?.info || {});

  let status = 'operational';
  if (health.state === 'down') {
    status = 'down';
  } else if (health.state === 'degraded' || !info.ok) {
    status = 'degraded';
  }

  return {
    checkedAt: input?.checkedAt || new Date().toISOString(),
    catalog: buildPublicRuntimeCatalogSummary(input?.catalog || {}),
    runtime: {
      status,
      health,
      info,
    },
  };
}

export function getPublicRuntimeStatusNotes(snapshot) {
  const notes = [
    `Execution: ${snapshot.catalog.topology.executionPlane}`,
    `Risk: ${snapshot.catalog.topology.riskPlane}`,
    `Automation: ${snapshot.catalog.automation.triggerKinds.join(', ')}`,
  ];

  if (snapshot.runtime.info.appId) {
    notes.push(`App ID: ${snapshot.runtime.info.appId}`);
  }

  return notes;
}
