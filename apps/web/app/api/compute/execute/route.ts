import { proxyToPhala } from "@/lib/phala";

export async function POST(request: Request) {
  const body = await request.text();
  return proxyToPhala("/compute/execute", { method: "POST", body });
}
