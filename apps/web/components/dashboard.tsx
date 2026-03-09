"use client";

import { useEffect, useState } from "react";
import { ProviderConfigPanel } from "./provider-config-panel";
import { RelayerOpsPanel } from "./relayer-ops-panel";

async function callJSON(path: string, body?: unknown, method = "POST") {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export function Dashboard() {
  const [activeTab, setActiveTab] = useState("overview");

  const [symbol, setSymbol] = useState("NEO-USD");
  const [output, setOutput] = useState<string>("");
  const [computeFunction, setComputeFunction] = useState("zkp.public_signal_hash");
  const [computeFunctions, setComputeFunctions] = useState<Array<{ name: string; category?: string; description?: string }>>([]);
  const [computeInput, setComputeInput] = useState('{"signals":["1","2","3"]}');
  const [oracleUrl, setOracleUrl] = useState("https://api.example.com/private");
  const [oracleEncryptedPayload, setOracleEncryptedPayload] = useState("");
  const [oracleScript, setOracleScript] = useState("function process(data) { return data.ok === true; }");
  const [oracleTargetChain, setOracleTargetChain] = useState("neo_n3");
  const [provider, setProvider] = useState("twelvedata");
  const [providers, setProviders] = useState<Array<{ id: string; description?: string }>>([]);
  const [requestProjectSlug, setRequestProjectSlug] = useState("demo");
  const [networkInfo, setNetworkInfo] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const [functionsRes, networksRes, providersRes] = await Promise.all([
          fetch("/api/compute/functions"),
          fetch("/api/networks"),
          fetch("/api/providers"),
        ]);
        const functionsBody = await functionsRes.json();
        if (Array.isArray(functionsBody.functions)) setComputeFunctions(functionsBody.functions);
        const networksBody = await networksRes.json();
        setNetworkInfo(networksBody.selected || null);
        const providersBody = await providersRes.json();
        if (Array.isArray(providersBody.providers)) setProviders(providersBody.providers);
      } catch {
        // ignore
      }
    })();
  }, []);

  const tabs = [
    { id: "overview", label: "Network & Data", icon: "🌐" },
    { id: "oracle", label: "Privacy Oracle", icon: "🔮" },
    { id: "compute", label: "Privacy Compute", icon: "💻" },
    { id: "operations", label: "System Config", icon: "⚙️" }
  ];

  return (
    <div style={{ display: "flex", gap: "40px", alignItems: "flex-start" }}>
      {/* Dynamic Sidebar */}
      <div style={{
        position: "sticky", top: "120px", display: "flex", flexDirection: "column", gap: "16px",
        minWidth: "260px"
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              className="sidebar-tab"
              onClick={() => { setActiveTab(tab.id); setOutput(""); }}
              style={{
                background: activeTab === tab.id ? "rgba(0, 229, 153, 0.15)" : "rgba(18, 24, 43, 0.4)",
                color: activeTab === tab.id ? "var(--neo-green)" : "var(--text-secondary)",
                border: `1px solid ${activeTab === tab.id ? "rgba(0, 229, 153, 0.3)" : "rgba(255, 255, 255, 0.05)"}`,
                padding: "18px 24px", textAlign: "left", borderRadius: "16px",
                display: "flex", alignItems: "center", gap: "16px",
                fontSize: "1.1rem", fontWeight: activeTab === tab.id ? "700" : "500",
                backdropFilter: "blur(12px)", transition: "all 0.3s ease",
                boxShadow: activeTab === tab.id ? "0 0 25px rgba(0, 229, 153, 0.1)" : "none",
                cursor: "pointer"
              }}
            >
              <span style={{ fontSize: "1.3rem" }}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
        
        {/* Output Panel logically tied to sidebar so it never moves off-screen */}
        <div style={{ marginTop: "32px", padding: "20px" }} className="card">
          <h3 style={{ fontSize: "1.05rem", marginBottom: "12px", color: "var(--neo-green)", display: "flex", justifyContent: "space-between" }}>
            <span>Terminal Output</span>
            {output && <button onClick={() => setOutput("")} style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.8rem", padding: 0 }}>Clear</button>}
          </h3>
          <pre style={{ margin: 0, maxHeight: "380px", overflowY: "auto", fontSize: "0.85rem", padding: "16px", background: "rgba(0,0,0,0.4)" }}>
            {output || "Awaiting task execution..."}
          </pre>
        </div>
      </div>

      {/* Dynamic Content Panel */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "24px" }}>
        
        {activeTab === "overview" && (
          <div style={{ animation: "fadeIn 0.4s ease", display: "flex", flexDirection: "column", gap: "28px" }}>
            <section className="card" style={{ background: "radial-gradient(circle at top left, rgba(108,92,231,0.2), rgba(0,184,148,0.05) 60%, transparent)" }}>
              <small style={{ letterSpacing: 1.5, textTransform: "uppercase", color: "var(--neo-purple)", fontWeight: 700 }}>Infrastructure State</small>
              <h2 style={{ fontSize: '2.4rem', marginBottom: 12, marginTop: 12 }}>Morpheus Network Overview</h2>
              <p style={{ fontSize: '1.05rem', lineHeight: 1.6, color: "var(--text-secondary)" }}>
                A standalone privacy Oracle, privacy compute, and datafeed network. Control-plane on Vercel/Supabase, execution strictly confined in Phala TEE.
              </p>
            </section>

            <section className="grid grid-2">
              <div className="card">
                <h3>Network Registry</h3>
                <small style={{ marginBottom: 16 }}>Current deployed oracle smart contract configs.</small>
                <pre>{networkInfo ? JSON.stringify(networkInfo, null, 2) : "Loading config..."}</pre>
              </div>
              <div className="card">
                <h3>Live Feed Quote</h3>
                <small style={{ marginBottom: 20 }}>Query market prices directly from the TEE feeds.</small>
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div className="grid grid-2">
                    <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="symbol" />
                    <input value={requestProjectSlug} onChange={(e) => setRequestProjectSlug(e.target.value)} placeholder="project" />
                  </div>
                  <select value={provider} onChange={(e) => setProvider(e.target.value)}>
                    {(providers.length ? providers : [{ id: provider }]).map((item) => (<option key={item.id} value={item.id}>{item.id}</option>))}
                  </select>
                  <button className="btn btn-primary" onClick={async () => setOutput(await callJSON(`/api/feeds/${encodeURIComponent(symbol)}?provider=${encodeURIComponent(provider)}&project_slug=${encodeURIComponent(requestProjectSlug)}`, undefined, "GET"))}>Get Signed Price</button>
                </div>
              </div>
            </section>
          </div>
        )}

        {activeTab === "oracle" && (
          <div style={{ animation: "fadeIn 0.4s ease", display: "flex", flexDirection: "column", gap: "28px" }}>
             <section className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3>Oracle Public Key</h3>
                  <small>Fetch the TEE's public key to encrypt secrets locally (RSA-OAEP) before transmitting them to the Oracle.</small>
                </div>
                <button className="btn btn-primary" onClick={async () => setOutput(await callJSON("/api/oracle/public-key", undefined, "GET"))}>Fetch Key</button>
              </div>
            </section>

            <section className="card">
              <h3>Oracle Request Builder</h3>
              <small style={{ marginBottom: 20 }}>Compose fetch-only or smart-fetch private flows. Provide an encrypted payload patch for full confidentiality at runtime.</small>
              
              <div className="grid grid-2">
                <input value={oracleUrl} onChange={(e) => setOracleUrl(e.target.value)} placeholder="https://api.example.com/private" />
                <select value={oracleTargetChain} onChange={(e) => setOracleTargetChain(e.target.value)}>
                  <option value="neo_n3">neo_n3</option>
                  <option value="neo_x">neo_x</option>
                </select>
              </div>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "16px" }}>
                <input value={requestProjectSlug} onChange={(e) => setRequestProjectSlug(e.target.value)} placeholder="project slug" />
                <textarea value={oracleEncryptedPayload} onChange={(e) => setOracleEncryptedPayload(e.target.value)} placeholder="encrypted_payload (Paste ciphertext from your local encryption)" />
                <textarea value={oracleScript} onChange={(e) => setOracleScript(e.target.value)} placeholder="function process(data) { return data.ok; }" />
              </div>
              
              <div className="grid grid-2" style={{ marginTop: 24 }}>
                <button className="btn btn-primary" onClick={async () => setOutput(await callJSON("/api/oracle/query", {
                  url: oracleUrl,  encrypted_payload: oracleEncryptedPayload || undefined, provider, project_slug: requestProjectSlug || undefined, target_chain: oracleTargetChain
                }))}>Submit Base Request</button>
                
                <button className="btn btn-outline" onClick={async () => setOutput(await callJSON("/api/oracle/smart-fetch", {
                  url: oracleUrl, encrypted_payload: oracleEncryptedPayload || undefined, script: oracleScript, provider, project_slug: requestProjectSlug || undefined, target_chain: oracleTargetChain
                }))}>Submit Smart Fetch (TEEs)</button>
              </div>
            </section>
          </div>
        )}

        {activeTab === "compute" && (
          <div style={{ animation: "fadeIn 0.4s ease", display: "flex", flexDirection: "column", gap: "28px" }}>
            <section className="card">
              <h3>Built-in Compute Runtime</h3>
              <small style={{ marginBottom: 24 }}>Execute deterministic, zero-knowledge, or heavy cryptographic functions off-chain directly in the TEE.</small>
              <div className="grid grid-2">
                <select value={computeFunction} onChange={(e) => setComputeFunction(e.target.value)}>
                  {(computeFunctions.length ? computeFunctions : [{ name: computeFunction }]).map((fn) => (
                    <option key={fn.name} value={fn.name}>{fn.name}</option>
                  ))}
                </select>
                <select value={oracleTargetChain} onChange={(e) => setOracleTargetChain(e.target.value)}>
                  <option value="neo_n3">neo_n3</option>
                  <option value="neo_x">neo_x</option>
                </select>
              </div>
              <textarea value={computeInput} onChange={(e) => setComputeInput(e.target.value)} style={{ marginTop: 20 }} />
              <div style={{ marginTop: 24 }}>
                <button className="btn btn-primary" onClick={async () => setOutput(await callJSON("/api/compute/execute", {
                  mode: "builtin", function: computeFunction, input: JSON.parse(computeInput), target_chain: oracleTargetChain
                }))}>Trigger Execution</button>
              </div>
            </section>
          </div>
        )}

        {activeTab === "operations" && (
          <div style={{ animation: "fadeIn 0.4s ease", display: "flex", flexDirection: "column", gap: "28px" }}>
            <ProviderConfigPanel />
            <RelayerOpsPanel />
          </div>
        )}

      </div>
    </div>
  );
}
