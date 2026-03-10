import { proxyToPhala } from "@/lib/phala";

export async function GET() {
  return proxyToPhala("/oracle/public-key", { method: "GET" }, {
    route: "/api/oracle/public-key",
    category: "oracle",
  });
}
