"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Boxes, ArrowRight, Lock, Cpu, Shield } from "lucide-react";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { NETWORKS } from "@/lib/onchain-data";

const universalConsumer = "0x89b05cac00804648c666b47ecb1c57bc185821b7";

function escapeForCSharp(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export default function DocsStarterStudio() {
  const [flow, setFlow] = useState("oracle_provider");
  const [provider, setProvider] = useState("twelvedata");
  const [symbol, setSymbol] = useState("NEO-USD");
  const [customUrl, setCustomUrl] = useState("https://postman-echo.com/get?probe=morpheus");
  const [jsonPath, setJsonPath] = useState("price");
  const [targetChain, setTargetChain] = useState("neo_n3");
  const [useEncrypted, setUseEncrypted] = useState(true);
  const [useScript, setUseScript] = useState(false);
  const [script, setScript] = useState("function process(data) { return Number(data.price) > 0; }");

  const generated = useMemo(() => {
    const payload: Record<string, unknown> = { target_chain: targetChain };
    let requestType = "privacy_oracle";

    if (flow === "oracle_provider") {
      payload.provider = provider;
      payload.symbol = symbol;
      if (jsonPath.trim()) payload.json_path = jsonPath.trim();
      if (useEncrypted) payload.encrypted_payload = "<sealed confidential patch>";
      if (useScript && script.trim()) {
        payload.script = script.trim();
        payload.entry_point = "process";
      }
      requestType = useEncrypted ? "privacy_oracle" : "oracle";
    } else if (flow === "oracle_custom") {
      payload.url = customUrl;
      if (jsonPath.trim()) payload.json_path = jsonPath.trim();
      if (useEncrypted) {
        payload.encrypted_token = "<sealed bearer token>";
        payload.token_header = "Authorization";
      }
      if (useScript && script.trim()) {
        payload.script = script.trim();
        payload.entry_point = "process";
      }
      requestType = useEncrypted ? "privacy_oracle" : "oracle";
    } else if (flow === "compute_builtin") {
      payload.mode = "builtin";
      payload.function = "privacy.mask";
      payload.input = { value: "13812345678", unmasked_left: 3, unmasked_right: 4 };
      requestType = "compute";
      if (useEncrypted) {
        return {
          requestType,
          payload: {
            encrypted_payload: "<sealed {\"mode\":\"builtin\",\"function\":\"privacy.mask\",\"input\":{\"value\":\"13812345678\",\"unmasked_left\":3,\"unmasked_right\":4},\"target_chain\":\"neo_n3\"}>",
          },
        };
      }
    } else {
      payload.mode = "builtin";
      payload.function = "math.modexp";
      payload.input = { base: "2", exponent: "10", modulus: "17" };
      requestType = "compute";
      payload.encrypted_payload = "<sealed compute patch>";
    }

    return { requestType, payload };
  }, [customUrl, flow, jsonPath, provider, script, symbol, targetChain, useEncrypted, useScript]);

  const payloadJson = JSON.stringify(generated.payload, null, 2);
  const compactPayloadJson = JSON.stringify(generated.payload);
  const neoN3Snippet = `string payloadJson = "${escapeForCSharp(compactPayloadJson)}";

BigInteger requestId = (BigInteger)Contract.Call(
    OracleHash,
    "request",
    CallFlags.All,
    "${generated.requestType}",
    (ByteString)payloadJson,
    (UInt160)StdLib.Base58CheckDecode("${universalConsumer}"),
    "onOracleResult"
);`;

  return (
    <div className="fade-in">
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "1rem" }}>
        <Boxes size={14} color="var(--neo-green)" />
        <span style={{ fontSize: "0.7rem", fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "var(--font-mono)" }}>
          INTERACTIVE STARTER STUDIO
        </span>
      </div>
      <h1>Starter Studio</h1>

      <p className="lead" style={{ fontSize: "1.1rem", color: "var(--text-primary)", marginBottom: "2.5rem", lineHeight: 1.6 }}>
        Pick a user flow, choose a data source or built-in function, decide whether parameters stay encrypted,
        and Morpheus will generate the payload and Neo N3 request snippet you need next.
      </p>

      <div className="grid grid-2" style={{ gap: "2rem", alignItems: "start" }}>
        <div className="card-industrial" style={{ padding: "1.75rem" }}>
          <h3 style={{ marginTop: 0, marginBottom: "1rem" }}>1. Configure Flow</h3>

          <div style={{ display: "grid", gap: "1rem" }}>
            <label>
              <div style={{ marginBottom: "0.35rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>Flow</div>
              <select className="neo-select" value={flow} onChange={(event) => setFlow(event.target.value)}>
                <option value="oracle_provider">Oracle: Built-in Provider</option>
                <option value="oracle_custom">Oracle: Custom URL</option>
                <option value="compute_builtin">Compute: Built-in Function</option>
                <option value="compute_encrypted">Compute: Encrypted Built-in</option>
              </select>
            </label>

            <label>
              <div style={{ marginBottom: "0.35rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>Target Chain</div>
              <select className="neo-select" value={targetChain} onChange={(event) => setTargetChain(event.target.value)}>
                <option value="neo_n3">Neo N3</option>
                <option value="neo_x">Neo X</option>
              </select>
            </label>

            {(flow === "oracle_provider") && (
              <>
                <label>
                  <div style={{ marginBottom: "0.35rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>Provider</div>
                  <select className="neo-select" value={provider} onChange={(event) => setProvider(event.target.value)}>
                    <option value="twelvedata">twelvedata</option>
                    <option value="binance-spot">binance-spot</option>
                    <option value="coinbase-spot">coinbase-spot</option>
                  </select>
                </label>
                <label>
                  <div style={{ marginBottom: "0.35rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>Symbol</div>
                  <input className="neo-input" value={symbol} onChange={(event) => setSymbol(event.target.value)} />
                </label>
              </>
            )}

            {(flow === "oracle_custom") && (
              <label>
                <div style={{ marginBottom: "0.35rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>Custom URL</div>
                <input className="neo-input" value={customUrl} onChange={(event) => setCustomUrl(event.target.value)} />
              </label>
            )}

            {(flow === "oracle_provider" || flow === "oracle_custom") && (
              <>
                <label>
                  <div style={{ marginBottom: "0.35rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>JSON Path</div>
                  <input className="neo-input" value={jsonPath} onChange={(event) => setJsonPath(event.target.value)} />
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                  <input type="checkbox" checked={useScript} onChange={(event) => setUseScript(event.target.checked)} />
                  Enable custom JS reduction
                </label>
                {useScript && (
                  <textarea className="code-editor" value={script} onChange={(event) => setScript(event.target.value)} style={{ minHeight: "140px" }} />
                )}
              </>
            )}

            <label style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
              <input type="checkbox" checked={useEncrypted} onChange={(event) => setUseEncrypted(event.target.checked)} />
              Seal sensitive fields before submission
            </label>
          </div>
        </div>

        <div className="card-industrial" style={{ padding: "1.75rem" }}>
          <h3 style={{ marginTop: 0, marginBottom: "1rem" }}>2. Use The Output</h3>

          <div style={{ display: "grid", gap: "1rem" }}>
            <div style={{ padding: "1rem", background: "#000", border: "1px solid var(--border-dim)" }}>
              <div style={{ fontSize: "0.65rem", color: "var(--text-secondary)", fontWeight: 800, marginBottom: "0.35rem", fontFamily: "var(--font-mono)" }}>REQUEST TYPE</div>
              <div style={{ color: "#fff", fontFamily: "var(--font-mono)" }}>{generated.requestType}</div>
            </div>

            <CodeBlock language="json" title="Payload JSON" code={payloadJson} />
            <CodeBlock language="csharp" title="Neo N3 Request Snippet" code={neoN3Snippet} />

            <div style={{ padding: "1rem", background: "#000", borderLeft: "4px solid var(--neo-green)", borderTop: "1px solid var(--border-dim)", borderRight: "1px solid var(--border-dim)", borderBottom: "1px solid var(--border-dim)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "0.5rem" }}>
                {generated.requestType.includes("compute") ? <Cpu size={16} color="var(--neo-green)" /> : generated.requestType.includes("privacy") ? <Lock size={16} color="var(--neo-green)" /> : <Shield size={16} color="var(--neo-green)" />}
                <strong style={{ color: "#fff" }}>Production path</strong>
              </div>
              <p style={{ margin: 0, color: "var(--text-secondary)", lineHeight: 1.7 }}>
                Submit this through <code>{NETWORKS.neo_n3.oracle}</code> on Neo N3 mainnet, target callback consumer <code>{universalConsumer}</code>,
                callback method <code>onOracleResult</code>, and attach <code>0.01 GAS</code>.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-2" style={{ gap: "1.5rem", marginTop: "2.5rem" }}>
        <Link href="/docs/templates" className="card-industrial" style={{ padding: "1.75rem", textDecoration: "none" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 800, fontSize: "1rem", color: "#fff" }}>Static Templates</span>
            <ArrowRight size={18} color="var(--neo-green)" />
          </div>
          <p style={{ color: "var(--text-secondary)", marginTop: "0.85rem", marginBottom: 0 }}>
            Go back to the copy-ready template library if you just want canned payloads.
          </p>
        </Link>
        <Link href="/explorer" className="card-industrial" style={{ padding: "1.75rem", textDecoration: "none" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 800, fontSize: "1rem", color: "#fff" }}>Open Explorer</span>
            <ArrowRight size={18} color="var(--neo-green)" />
          </div>
          <p style={{ color: "var(--text-secondary)", marginTop: "0.85rem", marginBottom: 0 }}>
            Use the live Oracle Payload Builder and Enclave Sandbox after you choose a flow here.
          </p>
        </Link>
      </div>
    </div>
  );
}
