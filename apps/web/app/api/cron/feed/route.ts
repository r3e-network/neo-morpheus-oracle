import { appConfig } from "@/lib/config";
import { resolveProviderAwarePayload } from "@/lib/provider-configs";

function isAuthorized(request: Request) {
  const configured = process.env.CRON_SECRET || "";
  if (!configured) return false;
  const auth = request.headers.get("authorization") || "";
  return auth === `Bearer ${configured}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!appConfig.phalaApiUrl) {
    return Response.json({ error: "PHALA_API_URL is not configured" }, { status: 500 });
  }

  const routeUrl = new URL(request.url);
  const symbols = String(process.env.MORPHEUS_FEED_SYMBOLS || "NEO-USD")
    .split(",")
    .map((symbol) => symbol.trim())
    .filter(Boolean);
  const configuredProjectSlug = (routeUrl.searchParams.get("project_slug") || process.env.MORPHEUS_FEED_PROJECT_SLUG || "").trim();
  const configuredProvider = (routeUrl.searchParams.get("provider") || process.env.MORPHEUS_FEED_PROVIDER || "twelvedata").trim();

  const headers = new Headers({ "content-type": "application/json" });
  if (appConfig.phalaToken) {
    headers.set("authorization", `Bearer ${appConfig.phalaToken}`);
    headers.set("x-phala-token", appConfig.phalaToken);
  }

  const results = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const resolved = await resolveProviderAwarePayload(
          {
            symbol,
            wait: false,
            provider: configuredProvider,
            project_slug: configuredProjectSlug || undefined,
          },
          {
            projectSlug: configuredProjectSlug || undefined,
            fallbackProviderId: configuredProvider || "twelvedata",
          },
        );

        const response = await fetch(`${appConfig.phalaApiUrl.replace(/\/$/, "")}/oracle/feed`, {
          method: "POST",
          headers,
          body: JSON.stringify(resolved.payload),
          cache: "no-store",
        });
        const text = await response.text();
        try {
          return { symbol, status: response.status, body: JSON.parse(text) };
        } catch {
          return { symbol, status: response.status, body: text };
        }
      } catch (error) {
        return {
          symbol,
          status: 400,
          body: { error: error instanceof Error ? error.message : String(error) },
        };
      }
    }),
  );

  return Response.json({
    ok: true,
    project_slug: configuredProjectSlug || null,
    provider: configuredProvider || null,
    results,
  });
}
