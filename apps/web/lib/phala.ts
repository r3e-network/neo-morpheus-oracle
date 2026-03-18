import { appConfig } from './config';
import { recordOperationLog } from './operation-logs';

type ProxyOperation = {
  route: string;
  category:
    | 'oracle'
    | 'compute'
    | 'feed'
    | 'runtime'
    | 'signing'
    | 'relay'
    | 'attestation'
    | 'system';
  requestPayload?: unknown;
  metadata?: Record<string, unknown>;
};

function maybeParseJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function proxyToPhala(
  path: string,
  init: RequestInit = {},
  operation?: ProxyOperation
) {
  if (!appConfig.phalaApiUrl) {
    if (operation) {
      await recordOperationLog({
        route: operation.route,
        method: init.method || 'GET',
        category: operation.category,
        requestPayload: operation.requestPayload,
        responsePayload: { error: 'PHALA_API_URL is not configured' },
        httpStatus: 500,
        error: 'PHALA_API_URL is not configured',
        metadata: operation.metadata,
      });
    }
    return Response.json({ error: 'PHALA_API_URL is not configured' }, { status: 500 });
  }

  const headers = new Headers(init.headers || {});
  headers.set('content-type', headers.get('content-type') || 'application/json');
  if (appConfig.phalaToken) {
    headers.set('authorization', `Bearer ${appConfig.phalaToken}`);
    headers.set('x-phala-token', appConfig.phalaToken);
  }

  const response = await fetch(`${appConfig.phalaApiUrl.replace(/\/$/, '')}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });

  const text = await response.text();
  if (operation) {
    await recordOperationLog({
      route: operation.route,
      method: init.method || 'GET',
      category: operation.category,
      requestPayload: operation.requestPayload,
      responsePayload: maybeParseJson(text),
      httpStatus: response.status,
      error: response.ok ? null : text,
      metadata: {
        upstream_path: path,
        ...operation.metadata,
      },
    });
  }
  return new Response(text, {
    status: response.status,
    headers: { 'content-type': response.headers.get('content-type') || 'application/json' },
  });
}
