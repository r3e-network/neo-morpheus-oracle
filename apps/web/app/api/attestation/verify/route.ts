import { verifyAttestation } from "@/lib/attestation";

function badRequest(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return badRequest("invalid JSON body");

  const result = verifyAttestation({
    attestation: body.attestation,
    expectedPayload: body.expected_payload,
    expectedOutputHash: typeof body.expected_output_hash === "string" ? body.expected_output_hash : undefined,
    expectedComposeHash: typeof body.expected_compose_hash === "string" ? body.expected_compose_hash : undefined,
    expectedAppId: typeof body.expected_app_id === "string" ? body.expected_app_id : undefined,
    expectedInstanceId: typeof body.expected_instance_id === "string" ? body.expected_instance_id : undefined,
  });

  return Response.json(result, { status: result.ok ? 200 : 400 });
}
