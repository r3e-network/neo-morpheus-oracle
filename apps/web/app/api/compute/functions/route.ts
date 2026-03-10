import { proxyToPhala } from "@/lib/phala";

export async function GET() {
  return proxyToPhala("/compute/functions", { method: "GET" }, {
    route: "/api/compute/functions",
    category: "compute",
  });
}
