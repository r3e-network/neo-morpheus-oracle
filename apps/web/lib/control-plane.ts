import { appConfig } from './config';
import { recordOperationLog } from './operation-logs';

type ControlPlaneCategory =
  | 'oracle'
  | 'compute'
  | 'system'
  | 'feed'
  | 'relay'
  | 'signing'
  | 'runtime';

type DispatchOperation = {
  route: string;
  category: ControlPlaneCategory;
  requestPayload?: unknown;
  metadata?: Record<string, unknown>;
};

const DISPATCHABLE_PATHS = new Set([
  '/oracle/query',
  '/oracle/smart-fetch',
  '/compute/execute',
  '/neodid/bind',
  '/neodid/action-ticket',
  '/neodid/recovery-ticket',
  '/feeds/tick',
  '/callbacks/broadcast',
  '/automation/execute',
]);

function maybeParseJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function shouldDispatchToControlPlane(path: string) {
  return Boolean(appConfig.controlPlaneUrl) && DISPATCHABLE_PATHS.has(path);
}

export async function dispatchToControlPlane(
  path: string,
  init: RequestInit = {},
  operation?: DispatchOperation
) {
  if (!appConfig.controlPlaneUrl) {
    return Response.json({ error: 'MORPHEUS_CONTROL_PLANE_URL is not configured' }, { status: 500 });
  }

  const headers = new Headers(init.headers || {});
  headers.set('content-type', headers.get('content-type') || 'application/json');
  if (appConfig.controlPlaneApiKey) {
    headers.set('authorization', `Bearer ${appConfig.controlPlaneApiKey}`);
    headers.set('x-admin-api-key', appConfig.controlPlaneApiKey);
  }

  const controlPlaneUrl = `${appConfig.controlPlaneUrl.replace(/\/$/, '')}/${appConfig.selectedNetworkKey}${path}`;
  const response = await fetch(controlPlaneUrl, {
    ...init,
    headers,
    cache: 'no-store',
  });
  const text = await response.text();

  if (operation) {
    await recordOperationLog({
      route: operation.route,
      method: init.method || 'POST',
      category: operation.category,
      requestPayload: operation.requestPayload,
      responsePayload: maybeParseJson(text),
      httpStatus: response.status,
      error: response.ok ? null : text,
      metadata: {
        upstream_path: path,
        control_plane: true,
        control_plane_url: controlPlaneUrl,
        ...operation.metadata,
      },
    });
  }

  return new Response(text, {
    status: response.status,
    headers: { 'content-type': response.headers.get('content-type') || 'application/json' },
  });
}
