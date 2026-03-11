"use client";

import { useState, useEffect } from "react";
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
  const [oracleConfidentialJson, setOracleConfidentialJson] = useState('{\n  "headers": {\n    "Authorization": "Bearer secret_token"\n  }\n}');
  const [oracleScript, setOracleScript] = useState("function process(response) {\n  // 'response' holds the HTTP JSON payload\n  return response.price;\n}");
  const [oracleTargetChain, setOracleTargetChain] = useState("neo_n3");
  const [provider, setProvider] = useState("twelvedata");
  const [oracleKeyMeta, setOracleKeyMeta] = useState<any>(null);
  const [isEncrypting, setIsEncrypting] = useState(false);

  useEffect(() => {
    loadOracleKey();
  }, []);

  async function loadOracleKey() {
    try {
      const response = await fetch("/api/oracle/public-key");
      const body = await response.json().catch(() => ({}));
      if (response.ok && body?.public_key_pem) {
        setOracleKeyMeta(body);
      }
    } catch (err) {
      console.error("Failed to load oracle public key", err);
    }
  }

  async function encryptConfidentialPatch() {
    setIsEncrypting(true);
    try {
      const keyMeta = oracleKeyMeta?.public_key_pem ? oracleKeyMeta : await (async () => {
        const response = await fetch("/api/oracle/public-key");
        const body = await response.json();
        setOracleKeyMeta(body);
        return body;
      })();

      if (!keyMeta?.public_key_pem) throw new Error("Public key not available");

      const ciphertext = await encryptJsonWithOraclePublicKey(keyMeta.public_key_pem, oracleConfidentialJson);
      setOracleEncryptedParams(ciphertext);
      setOutput(">> Data Encrypted via RSA-OAEP locally.\n>> No TEE interaction was required for this encryption step.\n>> Ciphertext generated and ready for secure transport.");
    } catch (err: any) {
      setOutput(`!! Encryption Error: ${err.message}`);
    } finally {
      setIsEncrypting(false);
    }
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
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid var(--border-dim)', paddingBottom: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.03em', marginBottom: '0.5rem' }}>Data Sealing</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Encrypt sensitive parameters locally using the TEE public key.</p>
        </div>
        {oracleKeyMeta && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>PUBLIC KEY</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--neo-green)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>RSA-2048 Loaded</div>
          </div>
        )}
      </div>

      <div className="grid grid-2" style={{ alignItems: 'start', gap: '2rem' }}>
        {/* Step 1: Encryption */}
        <div className="card-industrial stagger-1" style={{ padding: '0' }}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-dim)', background: 'rgba(255,255,255,0.02)' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
              <Lock className="text-neo" size={16} /> 1. Parameter Protection
            </h3>
          </div>
          
          <div style={{ padding: '1.5rem' }}>
            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Plaintext JSON</span>
                <span style={{ color: 'var(--accent-purple)' }}>Local Only</span>
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
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}>
                    <Lock size={32} color="var(--neo-green)" style={{ marginBottom: '0.5rem' }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--neo-green)', fontFamily: 'var(--font-mono)' }}>PAYLOAD SECURED</span>
                  </div>
                )}
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '1rem' }}>
              {!oracleEncryptedParams ? (
                <button className="btn-ata" style={{ flex: 1, justifyContent: 'center' }} onClick={encryptConfidentialPatch} disabled={isEncrypting || !oracleKeyMeta}>
                  {isEncrypting ? 'Encrypting...' : 'Encrypt & Lock'}
                </button>
              ) : (
                <button className="btn-secondary" style={{ flex: 1, padding: '0.75rem', fontSize: '0.8rem', fontWeight: 600, border: '1px solid var(--border-dim)' }} onClick={() => setOracleEncryptedParams("")}>
                  Unlock & Edit
                </button>
              )}
            </div>
            
            {oracleEncryptedParams && (
              <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#000', border: '1px solid var(--border-dim)', borderLeft: '2px solid var(--neo-green)' }}>
                 <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 800, marginBottom: '0.5rem', fontFamily: 'var(--font-mono)' }}>CIPHERTEXT (BASE64)</div>
                 <div style={{ fontSize: '0.75rem', color: 'var(--neo-green)', opacity: 0.8, wordBreak: 'break-all', fontFamily: 'var(--font-mono)' }}>
                    {oracleEncryptedParams.slice(0, 150)}...
                 </div>
              </div>
            )}
          </div>
        </div>

        {/* Step 2: Request Execution */}
        <div className="card-industrial stagger-2" style={{ padding: '0' }}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-dim)', background: 'rgba(255,255,255,0.02)' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
              <Cpu className="text-neo" size={16} /> 2. Secure Execution
            </h3>
          </div>
          
          <div style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '2rem' }}>
              <div className="form-group">
                 <label className="form-label">Data Source</label>
                 <select className="neo-select" value={requestMode} onChange={(e) => setRequestMode(e.target.value)}>
                    <option value="provider">Built-in Provider</option>
                    <option value="url">Custom API URL</option>
                 </select>
              </div>
              
              {requestMode === "provider" ? (
                <div className="grid grid-2" style={{ gap: '1rem' }}>
                  <div className="form-group">
                     <label className="form-label">Provider</label>
                     <select className="neo-select" value={provider} onChange={(e) => setProvider(e.target.value)}>
                        {providers.map(p => <option key={p.id} value={p.id}>{p.id}</option>)}
                     </select>
                  </div>
                  <div className="form-group">
                     <label className="form-label">Symbol</label>
                     <input className="neo-input" value={providerSymbol} onChange={(e) => setProviderSymbol(e.target.value)} placeholder="NEO-USD" />
                  </div>
                </div>
              ) : (
                <div className="form-group">
                   <label className="form-label">API Endpoint</label>
                   <input className="neo-input" value={oracleUrl} onChange={(e) => setOracleUrl(e.target.value)} placeholder="https://..." />
                </div>
              )}

              <div className="form-group">
                 <label className="form-label">Transformation Logic (JS)</label>
                 <textarea className="code-editor" value={oracleScript} onChange={(e) => setOracleScript(e.target.value)} style={{ minHeight: '80px' }} />
              </div>
            </div>

            <button className="btn-ata" style={{ width: '100%', justifyContent: 'center' }} onClick={async () => {
              setOutput(await callJSON("/api/oracle/smart-fetch", { ...buildOraclePayload(), script: oracleScript }));
            }}>
              Dispatch Secure Request
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
