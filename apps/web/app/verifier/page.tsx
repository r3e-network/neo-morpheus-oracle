"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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

function VerifierPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialLookupHash = searchParams.get("attestation_hash") || "";
  const [attestationJson, setAttestationJson] = useState("{}");
  const [expectedPayloadJson, setExpectedPayloadJson] = useState("{}");
  const [expectedOutputHash, setExpectedOutputHash] = useState("");
  const [expectedAttestationHash, setExpectedAttestationHash] = useState("");
  const [expectedComposeHash, setExpectedComposeHash] = useState("");
  const [expectedAppId, setExpectedAppId] = useState("");
  const [expectedInstanceId, setExpectedInstanceId] = useState("");
  const [result, setResult] = useState<string>("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [lookupHash, setLookupHash] = useState(initialLookupHash);
  const [isLookuping, setIsLookuping] = useState(false);

  const normalizedLookupHash = useMemo(() => lookupHash.trim(), [lookupHash]);

  const runVerification = useCallback(async (params: {
    attestation: unknown;
    expectedPayload?: unknown;
    expectedOutputHash?: string;
    expectedAttestationHash?: string;
    expectedComposeHash?: string;
    expectedAppId?: string;
    expectedInstanceId?: string;
  }) => {
    const body = await requestJSON("/api/attestation/verify", {
      envelope: params.attestation,
      attestation: params.attestation,
      expected_payload: params.expectedPayload,
      expected_output_hash: params.expectedOutputHash || undefined,
      expected_attestation_hash: params.expectedAttestationHash || undefined,
      expected_onchain_attestation_hash: params.expectedAttestationHash || undefined,
      expected_compose_hash: params.expectedComposeHash || undefined,
      expected_app_id: params.expectedAppId || undefined,
      expected_instance_id: params.expectedInstanceId || undefined,
    });
    return body;
  }, []);

  const lookupAttestation = useCallback(async (hash: string, updateUrl = true) => {
    const value = hash.trim();
    if (!value) return;

    if (updateUrl) {
      router.replace(`/verifier?attestation_hash=${encodeURIComponent(value)}`);
    }

    setIsLookuping(true);
    try {
      const body = await requestJSON(`/api/attestation/lookup?attestation_hash=${encodeURIComponent(value)}`);
      if ((body as { error?: string }).error && !(body as { found?: boolean }).found) {
        setResult(JSON.stringify(body, null, 2));
        return;
      }

      const verifierInput = (body as { verifier_input?: Record<string, unknown> | null }).verifier_input || null;
      if (!verifierInput) {
        setExpectedAttestationHash(value);
        setResult(JSON.stringify(body, null, 2));
        return;
      }

      setAttestationJson(JSON.stringify(verifierInput.envelope || verifierInput.attestation || {}, null, 2));
      setExpectedOutputHash(String(verifierInput.expected_output_hash || ""));
      setExpectedAttestationHash(String(verifierInput.expected_attestation_hash || value));
      setExpectedComposeHash(String(verifierInput.expected_compose_hash || ""));
      setExpectedAppId(String(verifierInput.expected_app_id || ""));
      setExpectedInstanceId(String(verifierInput.expected_instance_id || ""));

      const verification = await runVerification({
        attestation: verifierInput.envelope || verifierInput.attestation || {},
        expectedOutputHash: String(verifierInput.expected_output_hash || ""),
        expectedAttestationHash: String(verifierInput.expected_attestation_hash || value),
        expectedComposeHash: String(verifierInput.expected_compose_hash || ""),
        expectedAppId: String(verifierInput.expected_app_id || ""),
        expectedInstanceId: String(verifierInput.expected_instance_id || ""),
      });

      setResult(JSON.stringify({ lookup: body, verification }, null, 2));
    } catch (error) {
      setResult(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }, null, 2));
    } finally {
      setIsLookuping(false);
    }
  }, [router, runVerification]);

  useEffect(() => {
    if (!initialLookupHash) return;
    setLookupHash(initialLookupHash);
    void lookupAttestation(initialLookupHash, false);
  }, [initialLookupHash, lookupAttestation]);

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
              <h3>Lookup By Attestation Hash</h3>
              <small>Open this page with <code>?attestation_hash=0x...</code> or paste a hash below to auto-load the matching attestation record.</small>
            </div>
            <FileSearch size={22} color="var(--neo-green)" />
          </div>
          <div className="grid" style={{ gap: "16px" }}>
            <input
              value={lookupHash}
              onChange={(event) => setLookupHash(event.target.value)}
              placeholder="0x attestation hash"
            />
            <button
              className="btn btn-primary"
              disabled={isLookuping || !normalizedLookupHash}
              onClick={() => {
                void lookupAttestation(normalizedLookupHash, true);
              }}
            >
              {isLookuping ? "Querying..." : "Lookup Attestation"}
            </button>
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
                setExpectedComposeHash(String(verifierInput.expected_compose_hash || ""));
                setExpectedAppId(String(verifierInput.expected_app_id || ""));
                setExpectedInstanceId(String(verifierInput.expected_instance_id || ""));
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
                    const body = await runVerification({
                      attestation: parsedAttestation,
                      expectedPayload: parsedPayload,
                      expectedOutputHash,
                      expectedAttestationHash,
                      expectedComposeHash,
                      expectedAppId,
                      expectedInstanceId,
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

export default function VerifierPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ background: "var(--bg-primary)" }} />}>
      <VerifierPageClient />
    </Suspense>
  );
}
