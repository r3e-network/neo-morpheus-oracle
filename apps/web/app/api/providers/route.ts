import { proxyToPhala } from "@/lib/phala";

export async function GET() {
  return proxyToPhala("/providers", { method: "GET" });
}
