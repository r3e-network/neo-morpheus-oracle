import { proxyToPhala } from "@/lib/phala";

export async function GET() {
  return proxyToPhala("/oracle/public-key", { method: "GET" });
}
