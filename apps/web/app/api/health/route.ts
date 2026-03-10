import { recordOperationLog } from "@/lib/operation-logs";

export async function GET() {
  const body = { status: "ok", service: "morpheus-web" };
  await recordOperationLog({
    route: "/api/health",
    method: "GET",
    category: "system",
    responsePayload: body,
    httpStatus: 200,
  });
  return Response.json(body);
}
