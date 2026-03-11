"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, ClipboardList, FileSearch, Play, ShieldCheck } from "lucide-react";

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
    return { raw: text, status: response.status };
  }
}

export default function VerifierPage() {
  const [attestationJson, setAttestationJson] = useState("{}");
  const [expectedPayloadJson, setExpectedPayloadJson] = useState("{}");
  const [expectedOutputHash, setExpectedOutputHash] = useState("");
  const [expectedAttestationHash, setExpectedAttestationHash] = useState("");
  const [expectedComposeHash, setExpectedComposeHash] = useState("");
  const [expectedAppId, setExpectedAppId] = useState("");
  const [expectedInstanceId, setExpectedInstanceId] = useState("");
  const [result, setResult] = useState<string>("");
  const [isVerifying, setIsVerifying] = useState(false);

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="navbar">
        <Link href="/" className="nav-logo">
          <img src="/logo-morpheus.png" alt="Neo Morpheus Oracle" style={{ height: "36px", width: "auto" }} />
          <span className="text-gradient">Morpheus Oracle</span>
        </Link>
        <div className="nav-links">
          <Link href="/" className="btn btn-outline" style={{ padding: "6px 16px", borderRadius: "8px", fontSize: "0.85rem" }}>
            Back
          </Link>
          <a
            href="https://github.com/r3e-network/neo-morpheus-oracle/tree/main/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline"
            style={{ padding: "6px 16px", borderRadius: "8px", fontSize: "0.85rem" }}
          >
            Docs
          </a>
        </div>
      </nav>

      <main className="dashboard-container" style={{ paddingTop: "110px", paddingBottom: "80px" }}>
        <section className="card" style={{ marginBottom: "32px" }}>
          <div className="card-topline">
            <div>
              <span className="console-kicker">TEE Verification</span>
              <h1 className="font-outfit" style={{ fontSize: "2.6rem", marginBottom: "12px" }}>
                Attestation Verifier
              </h1>
              <small>
                Paste a worker response, on-chain callback envelope, or raw TEE attestation JSON and verify hash binding, report-data prefix, compose hash, app id, and instance id.
              </small>
            </div>
            <ShieldCheck size={34} color="var(--neo-green)" />
          </div>
        </section>

        <section className="card" style={{ marginBottom: "24px" }}>
          <div className="card-topline">
            <div>
              <h3>Demo Flow</h3>
              <small>Fetch a sample attested worker response and auto-fill the verifier.</small>
            </div>
            <button
              className="btn btn-inline"
              onClick={async () => {
                const body = await requestJSON("/api/attestation/demo");
                if ((body as { error?: string }).error) {
                  setResult(JSON.stringify(body, null, 2));
                  return;
                }

                const verifierInput = (body as { verifier_input?: Record<string, unknown> }).verifier_input || {};
                setAttestationJson(JSON.stringify(verifierInput.envelope || verifierInput.attestation || {}, null, 2));
                setExpectedPayloadJson(JSON.stringify(verifierInput.expected_payload || {}, null, 2));
                setExpectedOutputHash(String(verifierInput.expected_output_hash || ""));
                setExpectedAttestationHash(String(verifierInput.expected_attestation_hash || ""));
                setResult(JSON.stringify(body, null, 2));
              }}
            >
              <Play size={16} />
              Load Demo
            </button>
          </div>
        </section>

        <div className="grid grid-2">
          <section className="card">
            <div className="card-topline">
              <div>
                <h3>Worker / Callback / Attestation JSON</h3>
                <small>Paste a full worker response, compact callback envelope, or raw <code>tee_attestation</code> object.</small>
              </div>
              <ClipboardList size={22} color="var(--neo-green)" />
            </div>
            <textarea
              value={attestationJson}
              onChange={(event) => setAttestationJson(event.target.value)}
              style={{ minHeight: "360px" }}
              placeholder='{ "verification": { "attestation_hash": "...", "tee_attestation": { ... } } }'
            />
          </section>

          <section className="card">
            <div className="card-topline">
              <div>
                <h3>Verification Inputs</h3>
                <small>Optional expectations for stronger application-level verification.</small>
              </div>
              <FileSearch size={22} color="var(--neo-green)" />
            </div>

            <div className="grid" style={{ gap: "16px" }}>
              <textarea
                value={expectedPayloadJson}
                onChange={(event) => setExpectedPayloadJson(event.target.value)}
                style={{ minHeight: "120px" }}
                placeholder='{ "result": true }'
              />

              <input
                value={expectedOutputHash}
                onChange={(event) => setExpectedOutputHash(event.target.value)}
                placeholder="Expected output hash"
              />
              <input
                value={expectedAttestationHash}
                onChange={(event) => setExpectedAttestationHash(event.target.value)}
                placeholder="Expected / on-chain attestation hash"
              />
              <input
                value={expectedComposeHash}
                onChange={(event) => setExpectedComposeHash(event.target.value)}
                placeholder="Expected compose hash"
              />
              <input
                value={expectedAppId}
                onChange={(event) => setExpectedAppId(event.target.value)}
                placeholder="Expected app id"
              />
              <input
                value={expectedInstanceId}
                onChange={(event) => setExpectedInstanceId(event.target.value)}
                placeholder="Expected instance id"
              />

              <button
                className="btn btn-primary"
                disabled={isVerifying}
                onClick={async () => {
                  setIsVerifying(true);
                  try {
                    const parsedAttestation = JSON.parse(attestationJson);
                    const parsedPayload = expectedPayloadJson.trim() ? JSON.parse(expectedPayloadJson) : undefined;
                    const body = await requestJSON("/api/attestation/verify", {
                      envelope: parsedAttestation,
                      attestation: parsedAttestation,
                      expected_payload: parsedPayload,
                      expected_output_hash: expectedOutputHash || undefined,
                      expected_attestation_hash: expectedAttestationHash || undefined,
                      expected_onchain_attestation_hash: expectedAttestationHash || undefined,
                      expected_compose_hash: expectedComposeHash || undefined,
                      expected_app_id: expectedAppId || undefined,
                      expected_instance_id: expectedInstanceId || undefined,
                    });
                    setResult(JSON.stringify(body, null, 2));
                  } catch (error) {
                    setResult(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }, null, 2));
                  } finally {
                    setIsVerifying(false);
                  }
                }}
              >
                {isVerifying ? "Verifying..." : "Run Verification"}
              </button>
            </div>
          </section>
        </div>

        <section className="card" style={{ marginTop: "24px" }}>
            <div className="card-topline">
              <div>
                <h3>Verification Result</h3>
                <small>Application-level checks for `output_hash`, `attestation_hash`, and the first 32 bytes of TEE `report_data`.</small>
              </div>
              <CheckCircle2 size={22} color="var(--neo-green)" />
            </div>
          <pre>{result || "Awaiting verification input..."}</pre>
        </section>
      </main>
    </div>
  );
}
