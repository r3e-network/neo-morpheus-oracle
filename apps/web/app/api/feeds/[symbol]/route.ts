import { parseJsonObjectParam, resolveProviderAwarePayload } from "@/lib/provider-configs";
import { proxyToPhala } from "@/lib/phala";

function badRequest(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function GET(request: Request, context: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await context.params;
  const url = new URL(request.url);

  let providerParams: Record<string, unknown> | undefined;
  try {
    providerParams = parseJsonObjectParam(url.searchParams.get("provider_params"));
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : String(error));
  }

  const payload: Record<string, unknown> = {
    ...Object.fromEntries(url.searchParams.entries()),
    symbol,
  };
  if (providerParams) payload.provider_params = providerParams;

  try {
    const resolved = await resolveProviderAwarePayload(payload, {
      projectSlug: url.searchParams.get("project_slug") || undefined,
      fallbackProviderId: String(url.searchParams.get("provider") || "twelvedata"),
    });

    return proxyToPhala("/feeds/price", {
      method: "POST",
      body: JSON.stringify(resolved.payload),
    });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : String(error));
  }
}
