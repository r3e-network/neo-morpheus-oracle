import { getPublicRuntimeCatalogSummary, type PublicRuntimeCatalogSummary } from './workflow-runtime';

export type RuntimeProbeSnapshotInput = {
  ok: boolean;
  status: number;
  body: unknown;
};

export type PublicRuntimeStatusSnapshot = {
  checkedAt: string;
  catalog: PublicRuntimeCatalogSummary;
  runtime: {
    status: 'operational' | 'degraded' | 'down';
    health: {
      ok: boolean;
      statusCode: number;
      state: 'ok' | 'degraded' | 'down';
      detail: string | null;
    };
    info: {
      ok: boolean;
      statusCode: number;
      appId: string | null;
      composeHash: string | null;
      clientKind: string | null;
      version: string | null;
      detail: string | null;
    };
  };
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function getBodyDetail(body: unknown): string | null {
  if (typeof body === 'string') {
    return readString(body);
  }
  if (!isPlainObject(body)) {
    return null;
  }
  return readString(body.error) || readString(body.detail) || readString(body.message);
}

function getHealthState(probe: RuntimeProbeSnapshotInput): 'ok' | 'degraded' | 'down' {
  if (!probe.ok) {
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

function summarizeRuntimeInfo(probe: RuntimeProbeSnapshotInput) {
  const body = isPlainObject(probe.body) ? probe.body : {};
  const dstack = isPlainObject(body.dstack) ? body.dstack : {};

  return {
    ok: probe.ok,
    statusCode: probe.status,
    appId: readString(dstack.app_id) || readString(body.app_id),
    composeHash: readString(dstack.compose_hash) || readString(body.compose_hash),
    clientKind: readString(dstack.client_kind) || readString(body.client_kind),
    version: readString(body.version) || readString(dstack.version),
    detail: getBodyDetail(probe.body),
  };
}

function summarizeRuntimeHealth(probe: RuntimeProbeSnapshotInput) {
  return {
    ok: probe.ok,
    statusCode: probe.status,
    state: getHealthState(probe),
    detail: getBodyDetail(probe.body),
  };
}

export function buildPublicRuntimeStatusSnapshot(input: {
  checkedAt?: string;
  health: RuntimeProbeSnapshotInput;
  info: RuntimeProbeSnapshotInput;
}): PublicRuntimeStatusSnapshot {
  const health = summarizeRuntimeHealth(input.health);
  const info = summarizeRuntimeInfo(input.info);

  let status: PublicRuntimeStatusSnapshot['runtime']['status'] = 'operational';
  if (health.state === 'down') {
    status = 'down';
  } else if (health.state === 'degraded' || !info.ok) {
    status = 'degraded';
  }

  return {
    checkedAt: input.checkedAt || new Date().toISOString(),
    catalog: getPublicRuntimeCatalogSummary(),
    runtime: {
      status,
      health,
      info,
    },
  };
}

export function getPublicRuntimeStatusNotes(snapshot: PublicRuntimeStatusSnapshot): string[] {
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
