import { proxyToPhala } from "@/lib/phala";
import { recordOperationLog } from "@/lib/operation-logs";
import { isAuthorizedAdminRequest } from "@/lib/server-supabase";

export async function POST(request: Request) {
  const body = await request.text();
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = { raw_body: body };
  }
  if (!isAuthorizedAdminRequest(request, "sign_payload")) {
    await recordOperationLog({
      route: "/api/sign/payload",
      method: "POST",
      category: "signing",
      requestPayload: parsed,
      responsePayload: { error: "unauthorized" },
      httpStatus: 401,
      error: "unauthorized",
    });
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return proxyToPhala("/sign/payload", { method: "POST", body }, {
    route: "/api/sign/payload",
    category: "signing",
    requestPayload: parsed,
  });
}
