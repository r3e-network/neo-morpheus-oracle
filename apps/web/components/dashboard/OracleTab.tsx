"use client";

import { useState } from "react";
import { Key, Send, FileCode, Zap, ShieldCheck, Globe, Lock, Cpu, Play, CheckCircle2, Circle } from "lucide-react";
import { encryptJsonWithOraclePublicKey } from "@/lib/browser-encryption";

interface OracleTabProps {
  providers: any[];
  callJSON: (path: string, body?: any, method?: string) => Promise<string>;
  setOutput: (output: string) => void;
}

export function OracleTab({ providers, callJSON, setOutput }: OracleTabProps) {
  const [requestMode, setRequestMode] = useState("provider");
  const [oracleUrl, setOracleUrl] = useState("https://postman-echo.com/get?probe=morpheus");
  const [providerSymbol, setProviderSymbol] = useState("NEO-USD");
  const [httpMethod, setHttpMethod] = useState("GET");
  const [oracleEncryptedParams, setOracleEncryptedParams] = useState("");
  const [oracleConfidentialJson, setOracleConfidentialJson] = useState('{"headers":{"Authorization":"Bearer secret_token"}}');
  const [oracleScript, setOracleScript] = useState("function process(data) { return data.price; }");
  const [oracleTargetChain, setOracleTargetChain] = useState("neo_n3");
  const [provider, setProvider] = useState("twelvedata");
  const [oracleKeyMeta, setOracleKeyMeta] = useState<any>(null);
  const [currentStep, setCurrentStep] = useState(1);

  async function loadOracleKey() {
    const response = await fetch("/api/oracle/public-key");
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body?.public_key_pem) throw new Error(body?.error || "Failed to load key");
    setOracleKeyMeta(body);
    setCurrentStep(2);
    return body;
  }

  async function encryptConfidentialPatch() {
    const keyMeta = oracleKeyMeta?.public_key_pem ? oracleKeyMeta : await loadOracleKey();
    const ciphertext = await encryptJsonWithOraclePublicKey(keyMeta.public_key_pem, oracleConfidentialJson);
    setOracleEncryptedParams(ciphertext);
    setCurrentStep(3);
    setOutput(">> RSA-OAEP encryption complete.\n>> Payload is now safe for transport.");
  }

  function buildOraclePayload() {
    const base: Record<string, unknown> = {
      target_chain: oracleTargetChain,
      encrypted_params: oracleEncryptedParams || undefined,
    };
    if (requestMode === "provider") return { ...base, provider, symbol: providerSymbol };
    return { ...base, url: oracleUrl, method: httpMethod };
  }

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      <div className="grid grid-2" style={{ gridTemplateColumns: '300px 1fr', gap: '3rem' }}>
        {/* Step Progress Sidebar */}
        <div className="glass-card stagger-1" style={{ padding: '2rem' }}>
          <h4 style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '2rem' }}>Workflow</h4>
          <div className="step-tracker">
            <div className={`step-item ${currentStep >= 1 ? 'active' : ''}`}>
              <div className="step-node">{currentStep > 1 ? <CheckCircle2 size={14} className="text-neo" /> : <Circle size={10} />}</div>
              <div className="step-content">
                <div className="step-title">Identity Discovery</div>
                <div className="step-desc">Fetch TEE Public Key</div>
              </div>
            </div>
            <div className={`step-item ${currentStep >= 2 ? 'active' : ''}`}>
              <div className="step-node">{currentStep > 2 ? <CheckCircle2 size={14} className="text-neo" /> : <Circle size={10} />}</div>
              <div className="step-content">
                <div className="step-title">Local Encryption</div>
                <div className="step-desc">Protect sensitive params</div>
              </div>
            </div>
            <div className={`step-item ${currentStep >= 3 ? 'active' : ''}`}>
              <div className="step-node">{currentStep >= 3 ? <CheckCircle2 size={14} className="text-neo" /> : <Circle size={10} />}</div>
              <div className="step-content">
                <div className="step-title">Secure Execution</div>
                <div className="step-desc">Run confidential query</div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Interface */}
        <div className="stagger-2" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {currentStep === 1 && (
            <div className="glass-card fade-in" style={{ padding: '3rem', textAlign: 'center' }}>
              <div style={{ background: 'var(--neo-green-glow)', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 2rem' }}>
                <Lock className="text-neo" size={32} />
              </div>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '1rem' }}>Initiate Secure Handshake</h3>
              <p style={{ color: 'var(--text-dim)', marginBottom: '2rem', maxWidth: '400px', margin: '0 auto 2rem' }}>To protect your data, we first need to establish a trust relationship with the remote Secure Enclave.</p>
              <button className="btn btn-primary" onClick={loadOracleKey}>
                Establish Trust & Fetch Key
              </button>
            </div>
          )}

          {currentStep === 2 && (
            <div className="glass-card fade-in" style={{ padding: '2.5rem' }}>
               <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <ShieldCheck className="text-neo" size={20} /> Parameter Protection
               </h3>
               <div className="grid grid-2" style={{ marginBottom: '2rem' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Confidential JSON (Plaintext)</span>
                      <span style={{ color: 'var(--neo-purple)', fontSize: '0.65rem' }}>RSA-OAEP 2048</span>
                    </label>
                    <div style={{ position: 'relative' }}>
                      <textarea 
                        className="code-editor"
                        value={oracleConfidentialJson} 
                        onChange={(e) => setOracleConfidentialJson(e.target.value)} 
                        style={{ minHeight: '160px', opacity: oracleEncryptedParams ? 0.3 : 1 }}
                        disabled={!!oracleEncryptedParams}
                      />
                      {oracleEncryptedParams && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', borderRadius: '0.75rem', backdropFilter: 'blur(2px)' }}>
                          <Lock size={32} className="text-neo" style={{ marginBottom: '0.5rem' }} />
                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--neo-green)' }}>PAYLOAD SECURED</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                       Enter your private headers or API keys. These will be encrypted locally using the TEE's public key. The ciphertext can <strong>only</strong> be decrypted inside the hardware enclave.
                    </p>
                    {!oracleEncryptedParams ? (
                      <button className="btn btn-primary" onClick={encryptConfidentialPatch} style={{ padding: '1rem' }}>
                         <Lock size={16} /> Encrypt & Lock Parameters
                      </button>
                    ) : (
                      <button className="btn btn-secondary" onClick={() => { setOracleEncryptedParams(""); setCurrentStep(2); }} style={{ padding: '1rem' }}>
                         Unlock & Edit
                      </button>
                    )}
                  </div>
               </div>
            </div>
          )}

          {currentStep >= 3 && (
            <div className="glass-card fade-in" style={{ padding: '2.5rem', border: '1px solid var(--border-neo)' }}>
              <div className="scan-effect"></div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Cpu className="text-neo" size={20} /> Execution Engine
              </h3>
              
              <div className="grid grid-2" style={{ gap: '2.5rem', marginBottom: '2.5rem' }}>
                <div className="form-group">
                   <label className="form-label">Target Data</label>
                   <div style={{ display: 'flex', gap: '10px' }}>
                      <select className="neo-select" value={provider} onChange={(e) => setProvider(e.target.value)} style={{ flex: 1 }}>
                        {providers.map(p => <option key={p.id} value={p.id}>{p.id}</option>)}
                      </select>
                      <input className="neo-input" value={providerSymbol} onChange={(e) => setProviderSymbol(e.target.value)} style={{ flex: 1 }} placeholder="NEO-USD" />
                   </div>
                </div>
                <div className="form-group">
                   <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                     <span>Compute Logic</span>
                     <span style={{ color: 'var(--text-dim)', fontSize: '0.6rem' }}>Javascript (QuickJS)</span>
                   </label>
                   <textarea className="code-editor" value={oracleScript} onChange={(e) => setOracleScript(e.target.value)} style={{ minHeight: '80px' }} />
                </div>
              </div>

              <div style={{ padding: '1.5rem', background: '#000', borderRadius: '12px', border: '1px solid var(--border-subtle)', marginBottom: '2.5rem', position: 'relative', overflow: 'hidden' }}>
                 <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: '4px', background: 'var(--neo-green)' }}></div>
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                   <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase' }}>Encrypted Payload Header (Base64)</div>
                   <div className="badge-outline" style={{ color: 'var(--neo-green)' }}>READY FOR TRANSPORT</div>
                 </div>
                 <div style={{ fontSize: '0.75rem', color: 'var(--neo-green)', opacity: 0.7, wordBreak: 'break-all', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.5 }}>
                    {oracleEncryptedParams.slice(0, 150)}...
                 </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                 <button className="btn btn-primary" style={{ flex: 1, padding: '1.25rem', fontSize: '1rem' }} onClick={async () => {
                    setOutput(await callJSON("/api/oracle/smart-fetch", { ...buildOraclePayload(), script: oracleScript }));
                 }}>
                    <Play size={20} fill="currentColor" /> Dispatch to TEE
                 </button>
                 <button className="btn btn-secondary" style={{ padding: '1.25rem' }} onClick={() => { setCurrentStep(1); setOracleEncryptedParams(""); }}>
                    Reset
                 </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
