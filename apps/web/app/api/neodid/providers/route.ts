import { proxyToPhala } from "@/lib/phala";

export async function GET() {
  return proxyToPhala("/neodid/providers", { method: "GET" }, {
    route: "/api/neodid/providers",
    category: "system",
  });
}
