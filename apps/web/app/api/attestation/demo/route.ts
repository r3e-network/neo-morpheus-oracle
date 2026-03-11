import { proxyToPhala } from "@/lib/phala";
import { recordOperationLog } from "@/lib/operation-logs";

export async function GET() {
  const payload = {
    mode: "builtin",
    function: "hash.sha256",
    input: {
      sample: true,
      message: "morpheus-attestation-demo",
      version: 1,
    },
    target_chain: "neo_n3",
    include_attestation: true,
  };

  const response = await proxyToPhala("/compute/execute", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }

  const finalBody = {
    demo_request: payload,
    worker_response: body,
    verifier_input: {
      envelope: body,
      attestation: body?.tee_attestation || body?.verification?.tee_attestation || null,
      expected_payload: {
        function: body?.function,
        result: body?.result,
        entry_point: body?.entry_point,
      },
      expected_output_hash: body?.verification?.output_hash || body?.output_hash || null,
      expected_attestation_hash: body?.verification?.attestation_hash || body?.attestation_hash || null,
    },
  };
  await recordOperationLog({
    route: "/api/attestation/demo",
    method: "GET",
    category: "attestation",
    requestPayload: payload,
    responsePayload: finalBody,
    httpStatus: response.status,
    metadata: { upstream_path: "/compute/execute" },
  });
  return Response.json(finalBody, { status: response.status });
}
