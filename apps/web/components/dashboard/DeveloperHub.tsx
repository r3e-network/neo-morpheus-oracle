"use client";

import { useState } from "react";
import { 
  Code2, BookOpen, Terminal, Zap, Layers, FileCode, 
  Copy, Check, ShieldAlert, Cpu, Info, ChevronRight, 
  Workflow, Database, Fingerprint
} from "lucide-react";
import { CONTRACT_EXAMPLES, AUTOMATION_PATTERNS, BUILTIN_FUNCTIONS, SECURITY_CONCEPTS } from "@/lib/docs-data";

export function DeveloperHub() {
  const [activeLang, setActiveLang] = useState<"neo_x" | "neo_n3">("neo_x");
  const [copied, setCopied] = useState(false);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: "4rem" }}>
      {/* 1. Header & Architecture */}
      <section className="glass-card neo-card" style={{ padding: '3rem', textAlign: 'center', background: 'radial-gradient(circle at center, rgba(139, 92, 246, 0.05) 0%, transparent 70%)' }}>
        <h2 style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: '1rem' }}>Oracle Encyclopedia</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: '1.1rem', maxWidth: '700px', margin: '0 auto 2rem' }}>
          Master the Morpheus protocol. From confidential computation within secure enclaves to autonomous cross-chain execution.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--neo-green)' }}></div>
            <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>TEE-PROVEN</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--neo-purple)' }}></div>
            <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>ZERO-KNOWLEDGE FETCH</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--neo-blue)' }}></div>
            <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>MULTI-CHAIN ATTESTED</span>
          </div>
        </div>
      </section>

      {/* 2. Implementation & Code Examples */}
      <section className="stagger-1">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '2rem' }}>
          <Code2 className="text-neo" size={24} />
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Protocol Integration</h3>
        </div>
        <div className="glass-card" style={{ overflow: 'hidden' }}>
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid var(--border-subtle)' }}>
            <button 
              onClick={() => setActiveLang("neo_x")}
              style={{ padding: '1rem 2rem', background: activeLang === "neo_x" ? 'rgba(59, 130, 246, 0.1)' : 'transparent', border: 'none', color: activeLang === "neo_x" ? '#fff' : 'var(--text-dim)', fontWeight: 700, cursor: 'pointer', transition: 'all 0.3s' }}
            >
              Neo X (Solidity)
            </button>
            <button 
              onClick={() => setActiveLang("neo_n3")}
              style={{ padding: '1rem 2rem', background: activeLang === "neo_n3" ? 'rgba(0, 255, 163, 0.05)' : 'transparent', border: 'none', color: activeLang === "neo_n3" ? '#fff' : 'var(--text-dim)', fontWeight: 700, cursor: 'pointer', transition: 'all 0.3s' }}
            >
              Neo N3 (C#)
            </button>
          </div>
          <div style={{ position: 'relative' }}>
            <pre className="code-editor" style={{ borderRadius: 0, border: 'none', minHeight: '320px', fontSize: '0.85rem' }}>
              {CONTRACT_EXAMPLES[activeLang]}
            </pre>
            <button onClick={() => handleCopy(CONTRACT_EXAMPLES[activeLang])} style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '8px', cursor: 'pointer' }}>
              {copied === CONTRACT_EXAMPLES[activeLang] ? <Check size={16} className="text-neo" /> : <Copy size={16} className="text-muted" />}
            </button>
          </div>
        </div>
      </section>

      {/* 3. API Dictionary */}
      <section className="stagger-2">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '2rem' }}>
          <Terminal className="text-purple" size={24} />
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Enclave SDK (Javascript)</h3>
        </div>
        <div className="grid grid-2" style={{ gap: '1.5rem' }}>
          {BUILTIN_FUNCTIONS.map(fn => (
            <div key={fn.name} className="glass-card" style={{ padding: '1.75rem', borderLeft: '2px solid var(--neo-purple)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', alignItems: 'center' }}>
                <code style={{ color: 'var(--neo-green)', fontWeight: 800, fontSize: '0.95rem' }}>{fn.name}</code>
                <span className="badge-outline" style={{ color: 'var(--neo-purple)', fontSize: '0.6rem' }}>{fn.category}</span>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '1.25rem', lineHeight: 1.6 }}>{fn.desc}</p>
              <div style={{ background: '#000', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontFamily: 'monospace' }}>// Usage</div>
                <code style={{ fontSize: '0.75rem', color: '#fff', wordBreak: 'break-all' }}>{fn.example}</code>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4. Automation & Workflows */}
      <section className="stagger-3">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '2rem' }}>
          <Workflow className="text-neo-gradient" size={24} />
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Automation Blueprints</h3>
        </div>
        <div className="grid grid-2" style={{ gap: '2rem' }}>
          {AUTOMATION_PATTERNS.map(p => (
            <div key={p.title} className="glass-card" style={{ padding: '2rem' }}>
              <h4 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '1rem' }}>{p.title}</h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '1.5rem' }}>{p.desc}</p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
                {p.steps.map(step => (
                  <div key={step} style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    <ChevronRight size={12} className="text-neo" /> {step}
                  </div>
                ))}
              </div>

              <div style={{ background: '#000', border: '1px solid var(--border-subtle)', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{ padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.03)', fontSize: '0.6rem', fontWeight: 800, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>JSON CONFIG</div>
                <pre style={{ padding: '1rem', fontSize: '0.75rem', color: 'var(--neo-green)', opacity: 0.8 }}>
                  {JSON.stringify(p.config, null, 2)}
                </pre>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 5. Security & Trust Model */}
      <section style={{ marginBottom: '4rem' }}>
        <div className="glass-card" style={{ padding: '3rem', border: '1px solid rgba(239, 68, 68, 0.1)', background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.02), transparent)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '2rem' }}>
            <Fingerprint className="text-purple" size={24} />
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Trust & Security Model</h3>
          </div>
          <div className="grid grid-3" style={{ gap: '2rem' }}>
            {SECURITY_CONCEPTS.map(c => (
              <div key={c.title}>
                <h5 style={{ fontSize: '0.9rem', fontWeight: 800, marginBottom: '0.75rem', color: '#fff' }}>{c.title}</h5>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', lineHeight: 1.6 }}>{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
