"use client";

import { useState } from "react";

async function requestJSON(path: string, body?: Record<string, unknown>) {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text || `unexpected response ${response.status}` };
  }
}

export default function VerifierPage() {
  const [attestationJson, setAttestationJson] = useState('{\n  "attestation": {}\n}');
  const [expectedPayloadJson, setExpectedPayloadJson] = useState('{\n  "result": true\n}');
  const [expectedOutputHash, setExpectedOutputHash] = useState("");
  const [expectedComposeHash, setExpectedComposeHash] = useState("");
  const [expectedAppId, setExpectedAppId] = useState("");
  const [expectedInstanceId, setExpectedInstanceId] = useState("");
  const [result, setResult] = useState<string>("");

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 24px 80px" }}>
      <h1>Attestation Verifier</h1>
      <p style={{ color: "var(--text-secondary)" }}>
        Verify Morpheus worker attestation objects by checking report-data binding, compose hash, app identity, and basic structural consistency.
      </p>

      <section className="card" style={{ marginBottom: 24 }}>
        <h3>Demo Flow</h3>
        <small>Fetch a sample attested worker response, auto-fill the verifier, then run application-level verification.</small>
        <button
          onClick={async () => {
            const body = await requestJSON("/api/attestation/demo");
            if (body.error) {
              setResult(JSON.stringify(body, null, 2));
              return;
            }
            setAttestationJson(JSON.stringify(body.verifier_input.attestation || {}, null, 2));
            setExpectedPayloadJson(JSON.stringify(body.verifier_input.expected_payload || {}, null, 2));
            setExpectedOutputHash(body.verifier_input.expected_output_hash || "");
            setResult(JSON.stringify(body, null, 2));
          }}
        >
          Load Demo Attestation
        </button>
      </section>

      <section className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="card">
          <h3>Attestation JSON</h3>
          <textarea value={attestationJson} onChange={(event) => setAttestationJson(event.target.value)} style={{ minHeight: 320 }} />
        </div>
        <div className="card">
          <h3>Expected Payload</h3>
          <textarea value={expectedPayloadJson} onChange={(event) => setExpectedPayloadJson(event.target.value)} style={{ minHeight: 180 }} />
          <input value={expectedOutputHash} onChange={(event) => setExpectedOutputHash(event.target.value)} placeholder="optional expected_output_hash (hex)" />
          <input value={expectedComposeHash} onChange={(event) => setExpectedComposeHash(event.target.value)} placeholder="optional expected compose hash" />
          <input value={expectedAppId} onChange={(event) => setExpectedAppId(event.target.value)} placeholder="optional expected app id" />
          <input value={expectedInstanceId} onChange={(event) => setExpectedInstanceId(event.target.value)} placeholder="optional expected instance id" />
          <button
            onClick={async () => {
              try {
                const parsedAttestation = JSON.parse(attestationJson);
                const parsedPayload = expectedPayloadJson.trim() ? JSON.parse(expectedPayloadJson) : undefined;
                const body = await requestJSON("/api/attestation/verify", {
                  attestation: parsedAttestation,
                  expected_payload: parsedPayload,
                  expected_output_hash: expectedOutputHash || undefined,
                  expected_compose_hash: expectedComposeHash || undefined,
                  expected_app_id: expectedAppId || undefined,
                  expected_instance_id: expectedInstanceId || undefined,
                });
                setResult(JSON.stringify(body, null, 2));
              } catch (error) {
                setResult(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }, null, 2));
              }
            }}
          >
            Verify Attestation
          </button>
        </div>
      </section>

      <section className="card" style={{ marginTop: 24 }}>
        <h3>Verification Result</h3>
        <pre>{result || "No verification result yet."}</pre>
      </section>
    </main>
  );
}
