import { appConfig } from "./config";

export async function proxyToPhala(path: string, init: RequestInit = {}) {
  if (!appConfig.phalaApiUrl) {
    return Response.json({ error: "PHALA_API_URL is not configured" }, { status: 500 });
  }

  const headers = new Headers(init.headers || {});
  headers.set("content-type", headers.get("content-type") || "application/json");
  if (appConfig.phalaToken) {
    headers.set("authorization", `Bearer ${appConfig.phalaToken}`);
    headers.set("x-phala-token", appConfig.phalaToken);
  }

  const response = await fetch(`${appConfig.phalaApiUrl.replace(/\/$/, "")}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  const text = await response.text();
  return new Response(text, {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") || "application/json" },
  });
}
