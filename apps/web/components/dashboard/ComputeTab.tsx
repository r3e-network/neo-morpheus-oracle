"use client";

import { useState } from "react";
import { Cpu, Play, FileCode, Clock, ShieldCheck, Database, Zap, Code } from "lucide-react";

interface ComputeTabProps {
  computeFunctions: any[];
  callJSON: (path: string, body?: any, method?: string) => Promise<string>;
  setOutput: (output: string) => void;
}

export function ComputeTab({ computeFunctions, callJSON, setOutput }: ComputeTabProps) {
  const [selectedFunc, setSelectedFunc] = useState<string>("");
  const [computeInput, setComputeInput] = useState('{"args": [1, 2, 3]}');
  const [isExecuting, setIsExecuting] = useState(false);

  const handleExecute = async () => {
    setIsExecuting(true);
    try {
      const res = await callJSON("/api/compute/execute", {
        name: selectedFunc,
        input: JSON.parse(computeInput),
      });
      setOutput(res);
    } catch (err) {
      setOutput(JSON.stringify({ error: "Invalid JSON input or execution failed" }, null, 2));
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
      <div className="glass-card neo-card" style={{ padding: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '1.5rem' }}>
          <div style={{ background: 'var(--neo-purple-glow)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
            <Cpu className="text-purple" size={24} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 900 }}>Confidential Compute</h2>
            <p style={{ color: 'var(--text-dim)', fontSize: '1rem', marginTop: '0.25rem' }}>Deploy and execute stateless logic within a verified Secure Enclave.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-2" style={{ alignItems: 'start', gap: '2.5rem' }}>
        <div className="glass-card stagger-1" style={{ padding: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2rem' }}>
            <Database size={18} className="text-neo" />
            <h3 style={{ fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Function Registry</h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {computeFunctions.length > 0 ? computeFunctions.map((f) => (
              <button
                key={f.name}
                onClick={() => setSelectedFunc(f.name)}
                style={{
                  width: '100%',
                  padding: '1.25rem',
                  borderRadius: '12px',
                  border: '1px solid',
                  borderColor: selectedFunc === f.name ? 'var(--neo-purple)' : 'var(--border-subtle)',
                  background: selectedFunc === f.name ? 'var(--neo-purple-glow)' : 'rgba(255,255,255,0.02)',
                  color: selectedFunc === f.name ? '#fff' : 'var(--text-dim)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Code size={16} className={selectedFunc === f.name ? "text-purple" : "text-muted"} />
                  <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{f.name}</span>
                </div>
                <span className="badge" style={{ fontSize: '0.6rem', background: 'rgba(255,255,255,0.05)' }}>{f.runtime || 'JS'}</span>
              </button>
            )) : (
              <div style={{ padding: '3rem', textAlign: 'center', border: '1px dashed var(--border-subtle)', borderRadius: '12px', color: 'var(--text-muted)' }}>
                No functions deployed yet.
              </div>
            )}
          </div>
        </div>

        <div className="glass-card stagger-2" style={{ padding: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2rem' }}>
            <FileCode size={18} className="text-neo" />
            <h3 style={{ fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Execution Payload</h3>
          </div>

          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label className="form-label" style={{ fontSize: '0.7rem' }}>JSON Arguments</label>
            <textarea
              className="code-editor"
              value={computeInput}
              onChange={(e) => setComputeInput(e.target.value)}
              style={{ minHeight: '180px' }}
            />
          </div>

          <button
            className="btn btn-primary"
            style={{ width: '100%', padding: '1.25rem' }}
            disabled={!selectedFunc || isExecuting}
            onClick={handleExecute}
          >
            {isExecuting ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '16px', height: '16px', border: '2px solid rgba(0,0,0,0.1)', borderTopColor: '#000', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                Executing in TEE...
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Play size={18} fill="currentColor" /> Trigger Compute
              </div>
            )}
          </button>

          <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center', padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
            <ShieldCheck size={20} className="text-neo" />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
              Result will be signed by TEE <strong>Instance Key</strong> for on-chain verification.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
