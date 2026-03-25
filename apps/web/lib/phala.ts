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

function isRetryableStatus(status: number) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

const RUNTIME_URL_ERROR = 'MORPHEUS_RUNTIME_URL is not configured';

export async function proxyToPhala(
  path: string,
  init: RequestInit = {},
  operation?: ProxyOperation
) {
  const candidateUrls =
    Array.isArray(appConfig.phalaApiUrls) && appConfig.phalaApiUrls.length > 0
      ? appConfig.phalaApiUrls
      : appConfig.phalaApiUrl
        ? [appConfig.phalaApiUrl]
        : [];

  if (candidateUrls.length === 0) {
    if (operation) {
      try {
        await recordOperationLog({
          route: operation.route,
          method: init.method || 'GET',
          category: operation.category,
          requestPayload: operation.requestPayload,
          responsePayload: { error: RUNTIME_URL_ERROR },
          httpStatus: 500,
          error: RUNTIME_URL_ERROR,
          metadata: operation.metadata,
        });
      } catch {}
    }
    return Response.json({ error: RUNTIME_URL_ERROR }, { status: 500 });
  }

  const headers = new Headers(init.headers || {});
  headers.set('content-type', headers.get('content-type') || 'application/json');
  if (appConfig.phalaToken) {
    headers.set('authorization', `Bearer ${appConfig.phalaToken}`);
    headers.set('x-phala-token', appConfig.phalaToken);
  }

  let lastResponse: { status: number; text: string; contentType: string; url: string } | null =
    null;
  let lastError: string | null = null;

  for (const baseUrl of candidateUrls) {
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
        ...init,
        headers,
        cache: 'no-store',
      });
      const text = await response.text();
      lastResponse = {
        status: response.status,
        text,
        contentType: response.headers.get('content-type') || 'application/json',
        url: baseUrl,
      };
      if (response.ok || !isRetryableStatus(response.status)) {
        break;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  if (!lastResponse) {
    if (operation) {
      try {
        await recordOperationLog({
          route: operation.route,
          method: init.method || 'GET',
          category: operation.category,
          requestPayload: operation.requestPayload,
          responsePayload: { error: lastError || 'upstream unavailable' },
          httpStatus: 503,
          error: lastError || 'upstream unavailable',
          metadata: {
            upstream_path: path,
            upstream_candidates: candidateUrls,
            ...operation.metadata,
          },
        });
      } catch {}
    }
    return Response.json({ error: lastError || 'upstream unavailable' }, { status: 503 });
  }

  if (operation) {
    try {
      await recordOperationLog({
        route: operation.route,
        method: init.method || 'GET',
        category: operation.category,
        requestPayload: operation.requestPayload,
        responsePayload: maybeParseJson(lastResponse.text),
        httpStatus: lastResponse.status,
        error: lastResponse.status >= 400 ? lastResponse.text : null,
        metadata: {
          upstream_path: path,
          upstream_url: lastResponse.url,
          upstream_candidates: candidateUrls,
          ...operation.metadata,
        },
      });
    } catch {}
  }
  return new Response(lastResponse.text, {
    status: lastResponse.status,
    headers: { 'content-type': lastResponse.contentType },
  });
}
