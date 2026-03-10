import { proxyToPhala } from "@/lib/phala";

export async function GET() {
  return proxyToPhala("/providers", { method: "GET" }, {
    route: "/api/providers",
    category: "oracle",
  });
}
