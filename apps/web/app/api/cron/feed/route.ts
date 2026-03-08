import { appConfig } from "@/lib/config";

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

  const symbols = String(process.env.MORPHEUS_FEED_SYMBOLS || "NEO-USD")
    .split(",")
    .map((symbol) => symbol.trim())
    .filter(Boolean);

  const headers = new Headers({ "content-type": "application/json" });
  if (appConfig.phalaToken) {
    headers.set("authorization", `Bearer ${appConfig.phalaToken}`);
    headers.set("x-phala-token", appConfig.phalaToken);
  }

  const results = await Promise.all(
    symbols.map(async (symbol) => {
      const response = await fetch(`${appConfig.phalaApiUrl.replace(/\/$/, "")}/oracle/feed`, {
        method: "POST",
        headers,
        body: JSON.stringify({ symbol, wait: false }),
        cache: "no-store",
      });
      const text = await response.text();
      try {
        return { symbol, status: response.status, body: JSON.parse(text) };
      } catch {
        return { symbol, status: response.status, body: text };
      }
    }),
  );

  return Response.json({ ok: true, results });
}
