import { fetchOnchainState } from "@/lib/onchain-state";
import { recordOperationLog } from "@/lib/operation-logs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") || "12");
  const state = await fetchOnchainState(limit);
  await recordOperationLog({
    route: "/api/onchain/state",
    method: "GET",
    category: "network",
    requestPayload: { limit },
    responsePayload: state,
    httpStatus: 200,
  });
  return Response.json(state);
}
