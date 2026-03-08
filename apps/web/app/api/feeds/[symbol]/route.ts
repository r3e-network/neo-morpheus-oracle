import { proxyToPhala } from "@/lib/phala";

export async function GET(_: Request, context: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await context.params;
  return proxyToPhala(`/feeds/price/${encodeURIComponent(symbol)}`, { method: "GET" });
}
