import { proxyToPhala } from "@/lib/phala";

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

  return Response.json({
    demo_request: payload,
    worker_response: body,
    verifier_input: {
      attestation: body?.tee_attestation || body?.verification?.tee_attestation || null,
      expected_payload: {
        function: body?.function,
        result: body?.result,
        entry_point: body?.entry_point,
      },
      expected_output_hash: body?.verification?.output_hash || body?.output_hash || null,
    },
  }, { status: response.status });
}
