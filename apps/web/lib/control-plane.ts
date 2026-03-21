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

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function shouldFailOpen(status: number, text: string, contentType: string) {
  const normalizedText = text.toLowerCase();
  const normalizedType = contentType.toLowerCase();
  if (status === 429 && normalizedText.includes('error code: 1027')) return true;
  if (status === 429 && normalizedText.includes('temporarily rate limited')) return true;
  if (status >= 500 && normalizedType.includes('text/html') && normalizedText.includes('cloudflare'))
    return true;
  return false;
}

export function shouldDispatchToControlPlane(path: string) {
  return Boolean(appConfig.controlPlaneUrl) && DISPATCHABLE_PATHS.has(path);
}

export function shouldUseControlPlaneFallback(response: Response) {
  return trimString(response.headers.get('x-morpheus-control-plane-fail-open')) === '1';
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
  let response: Response;
  let text: string;
  let contentType = 'application/json';
  let failOpen = false;

  try {
    response = await fetch(controlPlaneUrl, {
      ...init,
      headers,
      cache: 'no-store',
    });
    text = await response.text();
    contentType = response.headers.get('content-type') || 'application/json';
    failOpen = shouldFailOpen(response.status, text, contentType);
  } catch (error) {
    text = JSON.stringify({
      error: 'control_plane_unavailable',
      detail: error instanceof Error ? error.message : String(error),
    });
    contentType = 'application/json';
    failOpen = true;
    response = new Response(text, { status: 503, headers: { 'content-type': contentType } });
  }

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

  const responseHeaders = new Headers({
    'content-type': contentType,
  });
  if (failOpen) {
    responseHeaders.set('x-morpheus-control-plane-fail-open', '1');
    responseHeaders.set('x-morpheus-control-plane-url', controlPlaneUrl);
  }

  return new Response(text, {
    status: response.status,
    headers: responseHeaders,
  });
}
