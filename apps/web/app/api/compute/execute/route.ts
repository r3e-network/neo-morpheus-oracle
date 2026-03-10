import { proxyToPhala } from "@/lib/phala";

export async function POST(request: Request) {
  const body = await request.text();
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = { raw_body: body };
  }
  return proxyToPhala("/compute/execute", { method: "POST", body }, {
    route: "/api/compute/execute",
    category: "compute",
    requestPayload: parsed,
  });
}
