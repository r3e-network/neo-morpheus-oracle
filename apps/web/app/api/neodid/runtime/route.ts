import { proxyToPhala } from "@/lib/phala";

export async function GET() {
  return proxyToPhala("/neodid/runtime", { method: "GET" }, {
    route: "/api/neodid/runtime",
    category: "system",
  });
}
