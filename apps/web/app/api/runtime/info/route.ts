import { proxyToPhala } from "@/lib/phala";

export async function GET() {
  return proxyToPhala("/info", { method: "GET" }, {
    route: "/api/runtime/info",
    category: "runtime",
  });
}
