import { parseJsonObjectParam, resolveProviderAwarePayload } from '@/lib/provider-configs';
import { appConfig } from '@/lib/config';
import { recordOperationLog } from '@/lib/operation-logs';
import { proxyToPhala } from '@/lib/phala';
import { badRequest } from '@/lib/api-helpers';

function shouldServeFeedFallback(status: number) {
  return (
    status === 401 ||
    status === 403 ||
    status === 408 ||
    status === 409 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
}

function feedUnavailableResponse(symbol: string, provider: string | null, upstreamStatus: number) {
  return Response.json(
    {
      status: 'unavailable',
      degraded: true,
      symbol,
      provider: provider || null,
      error: 'feed_quote_unavailable',
      upstream_status: upstreamStatus,
    },
    {
      status: 200,
      headers: {
        'cache-control': 'no-store',
        'x-morpheus-upstream-status': String(upstreamStatus),
      },
    }
  );
}

export async function GET(request: Request, context: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await context.params;
  const url = new URL(request.url);

  let providerParams: Record<string, unknown> | undefined;
  try {
    providerParams = parseJsonObjectParam(url.searchParams.get('provider_params'));
  } catch (error) {
    await recordOperationLog({
      route: `/api/feeds/${symbol}`,
      method: 'GET',
      category: 'feed',
      requestPayload: Object.fromEntries(url.searchParams.entries()),
      responsePayload: { error: error instanceof Error ? error.message : String(error) },
      httpStatus: 400,
      error: error instanceof Error ? error.message : String(error),
    });
    return badRequest(error instanceof Error ? error.message : String(error));
  }

  const payload: Record<string, unknown> = {
    ...Object.fromEntries(url.searchParams.entries()),
    symbol,
  };
  if (providerParams) payload.provider_params = providerParams;

  try {
    const provider = url.searchParams.get('provider') || appConfig.feedProvider;
    const projectSlug =
      url.searchParams.get('project_slug') || appConfig.feedProjectSlug || undefined;
    const resolved = await resolveProviderAwarePayload(payload, {
      projectSlug,
      fallbackProviderId: provider ? String(provider) : undefined,
    });

    const response = await proxyToPhala(
      '/feeds/price',
      {
        method: 'POST',
        body: JSON.stringify(resolved.payload),
      },
      {
        route: `/api/feeds/${symbol}`,
        category: 'feed',
        requestPayload: resolved.payload,
      }
    );
    if (!response.ok && shouldServeFeedFallback(response.status)) {
      return feedUnavailableResponse(symbol, provider, response.status);
    }
    return response;
  } catch (error) {
    await recordOperationLog({
      route: `/api/feeds/${symbol}`,
      method: 'GET',
      category: 'feed',
      requestPayload: payload,
      responsePayload: { error: error instanceof Error ? error.message : String(error) },
      httpStatus: 400,
      error: error instanceof Error ? error.message : String(error),
    });
    return badRequest(error instanceof Error ? error.message : String(error));
  }
}
