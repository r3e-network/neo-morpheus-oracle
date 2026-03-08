"use client";

import { useEffect, useState } from "react";
import { ProviderConfigPanel } from "./provider-config-panel";

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

  return (
    <div className="grid" style={{ gap: 24 }}>
      <section className="card" style={{ background: "radial-gradient(circle at top left, rgba(108,92,231,0.3), rgba(0,184,148,0.08) 45%, rgba(255,255,255,0.04))" }}>
        <small style={{ letterSpacing: 1.5, textTransform: "uppercase" }}>Truth Infrastructure for Neo</small>
        <h1 style={{ fontSize: 42, marginBottom: 12 }}>Morpheus Oracle / 墨菲斯网络</h1>
        <p style={{ fontSize: 18, lineHeight: 1.6 }}>
          A standalone privacy Oracle, privacy compute, and datafeed network for <code>Neo N3</code> and <code>Neo X</code>, powered by <code>Vercel</code>, <code>Supabase</code>, and <code>Phala TEE</code>.
        </p>
        <small>
          Morpheus gives Neo the truth pill. Morpheus Oracle gives Neo chains truth from encrypted data, heavy compute, and signed feed outputs.
        </small>
      </section>

      <section className="grid grid-3">
        <div className="card"><h3>Privacy Oracle</h3><small>Encrypted payloads, private fetches, scriptable result reduction, and callback-ready outputs.</small></div>
        <div className="card"><h3>Privacy Compute</h3><small>Built-in ZKP and FHE-oriented functions plus custom off-chain script execution in TEE.</small></div>
        <div className="card"><h3>Datafeed</h3><small>Signed market data, reference snapshots, and relay-ready feed publishing.</small></div>
      </section>

      <section className="grid grid-2">
        <div className="card">
          <h3>Network Registry</h3>
          <pre>{networkInfo ? JSON.stringify(networkInfo, null, 2) : "Loading network config..."}</pre>
        </div>
        <div className="card">
          <h3>Deployment Model</h3>
          <small>
            Frontend on Vercel, control-plane state in Supabase, trusted execution in Phala, settlement and callbacks on Neo N3 / Neo X.
          </small>
        </div>
      </section>

      <section className="grid grid-2">
        <div className="card">
          <h3>Oracle Public Key</h3>
          <small>Use this to encrypt secrets before they leave the client boundary. Provider selection supports built-in and custom-source flows.</small>
          <button onClick={async () => setOutput(await callJSON("/api/oracle/public-key", undefined, "GET"))}>Fetch Public Key</button>
        </div>

        <div className="card">
          <h3>Feed Quote</h3>
          <input value={symbol} onChange={(e) => setSymbol(e.target.value)} />
          <select value={provider} onChange={(e) => setProvider(e.target.value)}>
            {(providers.length ? providers : [{ id: provider }]).map((item) => (<option key={item.id} value={item.id}>{item.id}</option>))}
          </select>
          <button onClick={async () => setOutput(await callJSON(`/api/feeds/${encodeURIComponent(symbol)}?provider=${encodeURIComponent(provider)}`, undefined, "GET"))}>Get Price</button>
        </div>
      </section>

      <section className="card">
        <h3>Oracle Playground</h3>
        <small>Try fetch-only or fetch+compute flows. Paste an already encrypted payload if you want a private call.</small>
        <div className="grid grid-2">
          <input value={oracleUrl} onChange={(e) => setOracleUrl(e.target.value)} placeholder="https://api.example.com/private" />
          <select value={oracleTargetChain} onChange={(e) => setOracleTargetChain(e.target.value)}>
            <option value="neo_n3">neo_n3</option>
            <option value="neo_x">neo_x</option>
          </select>
        </div>
        <textarea value={oracleEncryptedPayload} onChange={(e) => setOracleEncryptedPayload(e.target.value)} placeholder="encrypted_payload (optional)" />
        <textarea value={oracleScript} onChange={(e) => setOracleScript(e.target.value)} placeholder="function process(data) { return data.ok; }" />
        <div className="grid grid-2">
          <button onClick={async () => setOutput(await callJSON("/api/oracle/query", {
            url: oracleUrl,
            encrypted_payload: oracleEncryptedPayload || undefined,
            provider,
            target_chain: oracleTargetChain,
          }))}>Query Oracle</button>
          <button onClick={async () => setOutput(await callJSON("/api/oracle/smart-fetch", {
            url: oracleUrl,
            encrypted_payload: oracleEncryptedPayload || undefined,
            script: oracleScript,
            provider,
            target_chain: oracleTargetChain,
          }))}>Smart Fetch</button>
        </div>
      </section>

      <section className="card">
        <h3>Built-in Compute</h3>
        <small>Direct-call heavy functions for ZKP planning, proof digests, FHE planning, hashes, Merkle roots, matrices, and vectors.</small>
        <select value={computeFunction} onChange={(e) => setComputeFunction(e.target.value)}>
          {(computeFunctions.length ? computeFunctions : [{ name: computeFunction }]).map((fn) => (
            <option key={fn.name} value={fn.name}>{fn.name}</option>
          ))}
        </select>
        <textarea value={computeInput} onChange={(e) => setComputeInput(e.target.value)} />
        <button onClick={async () => setOutput(await callJSON("/api/compute/execute", {
          mode: "builtin",
          function: computeFunction,
          input: JSON.parse(computeInput),
          target_chain: oracleTargetChain
        }))}>Execute Built-in</button>
      </section>

      <ProviderConfigPanel />

      <section className="card">
        <h3>Output</h3>
        <pre>{output || "No output yet."}</pre>
      </section>
    </div>
  );
}
