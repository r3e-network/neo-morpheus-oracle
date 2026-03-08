import { resolveProviderAwarePayload } from "@/lib/provider-configs";
import { proxyToPhala } from "@/lib/phala";

function badRequest(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!isPlainObject(body)) return badRequest("invalid JSON body");

  try {
    const resolved = await resolveProviderAwarePayload(body, {
      fallbackProviderId: !body.url && body.symbol ? "twelvedata" : undefined,
    });
    return proxyToPhala("/oracle/smart-fetch", {
      method: "POST",
      body: JSON.stringify(resolved.payload),
    });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : String(error));
  }
}
