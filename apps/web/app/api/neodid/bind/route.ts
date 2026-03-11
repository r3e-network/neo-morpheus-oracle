import { proxyToPhala } from "@/lib/phala";

export async function POST(request: Request) {
  const body = await request.text();
  return proxyToPhala("/neodid/bind", {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
  }, {
    route: "/api/neodid/bind",
    category: "system",
    requestPayload: body,
  });
}
