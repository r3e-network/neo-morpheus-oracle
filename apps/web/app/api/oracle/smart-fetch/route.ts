import { resolveProviderAwarePayload } from "@/lib/provider-configs";
import { recordOperationLog } from "@/lib/operation-logs";
import { proxyToPhala } from "@/lib/phala";

function badRequest(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!isPlainObject(body)) {
    await recordOperationLog({
      route: "/api/oracle/smart-fetch",
      method: "POST",
      category: "oracle",
      requestPayload: body,
      responsePayload: { error: "invalid JSON body" },
      httpStatus: 400,
      error: "invalid JSON body",
    });
    return badRequest("invalid JSON body");
  }

  try {
    const resolved = await resolveProviderAwarePayload(body, {
      fallbackProviderId: !body.url && body.symbol ? "twelvedata" : undefined,
    });
    return proxyToPhala("/oracle/smart-fetch", {
      method: "POST",
      body: JSON.stringify(resolved.payload),
    }, {
      route: "/api/oracle/smart-fetch",
      category: "oracle",
      requestPayload: resolved.payload,
    });
  } catch (error) {
    await recordOperationLog({
      route: "/api/oracle/smart-fetch",
      method: "POST",
      category: "oracle",
      requestPayload: body,
      responsePayload: { error: error instanceof Error ? error.message : String(error) },
      httpStatus: 400,
      error: error instanceof Error ? error.message : String(error),
    });
    return badRequest(error instanceof Error ? error.message : String(error));
  }
}
