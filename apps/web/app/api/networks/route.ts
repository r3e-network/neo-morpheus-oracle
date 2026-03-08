import { getSelectedNetwork, networkRegistry } from "@/lib/networks";

export async function GET() {
  return Response.json({
    selected: getSelectedNetwork(),
    available: networkRegistry,
  });
}
