import { proxyToPhala } from "@/lib/phala";
import { isAuthorizedAdminRequest } from "@/lib/server-supabase";

export async function POST(request: Request) {
  if (!isAuthorizedAdminRequest(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await request.text();
  return proxyToPhala("/sign/payload", { method: "POST", body });
}
