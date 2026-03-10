"use client";

import { Globe, Copy, Check, ExternalLink } from "lucide-react";
import { useState } from "react";
import { NETWORKS } from "@/lib/onchain-data";

export default function DocsNetworks() {
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 2000);
  };

  const copyBtn = (text: string) => (
    <button 
      onClick={() => handleCopy(text)}
      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
      title="Copy address"
    >
      {copied === text ? <Check size={14} color="var(--neo-green)" /> : <Copy size={14} className="hover-white" />}
    </button>
  );

  return (
    <div className="fade-in">
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "1rem" }}>
        <Globe size={14} color="var(--neo-green)" />
        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)' }}>REGISTRY v1.0.2</span>
      </div>
      <h1>Networks & Contracts</h1>

      <p className="lead" style={{ fontSize: '1.15rem', color: 'var(--text-primary)', marginBottom: '3rem' }}>
        Official smart contract addresses for the Morpheus Privacy Oracle and Data Matrix across all supported Neo networks.
      </p>

      <h2>Neo N3 Mainnet</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
        Production-ready environment powered by decentralized Phala TEE workers.
      </p>

      <div style={{ border: '1px solid var(--border-dim)', borderRadius: '4px', overflow: 'hidden', marginBottom: '4rem' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-dim)' }}>
              <th style={{ padding: '1rem 1.5rem', color: '#fff', fontWeight: 800 }}>CONTRACT</th>
              <th style={{ padding: '1rem 1.5rem', color: '#fff', fontWeight: 800 }}>HASH</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid var(--border-dim)' }}>
              <td style={{ padding: '1.25rem 1.5rem', fontWeight: 700 }}>MorpheusOracle</td>
              <td style={{ padding: '1.25rem 1.5rem', fontFamily: 'var(--font-mono)', color: 'var(--neo-green)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  0x017520f068fd602082fe5572596185e62a4ad991 {copyBtn("0x017520f068fd602082fe5572596185e62a4ad991")}
                </div>
              </td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--border-dim)' }}>
              <td style={{ padding: '1.25rem 1.5rem', fontWeight: 700 }}>OracleCallbackConsumer</td>
              <td style={{ padding: '1.25rem 1.5rem', fontFamily: 'var(--font-mono)', color: 'var(--neo-green)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  0xe1226268f2fe08bea67fb29e1c8fda0d7c8e9844 {copyBtn("0xe1226268f2fe08bea67fb29e1c8fda0d7c8e9844")}
                </div>
              </td>
            </tr>
            <tr>
              <td style={{ padding: '1.25rem 1.5rem', fontWeight: 700 }}>MorpheusDatafeed</td>
              <td style={{ padding: '1.25rem 1.5rem', fontFamily: 'var(--font-mono)', color: 'var(--neo-green)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {NETWORKS.neo_n3.datafeed} {copyBtn(NETWORKS.neo_n3.datafeed)}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Neo X Mainnet</h2>
      <div className="card-industrial" style={{ padding: '2rem', borderLeft: '4px solid var(--accent-blue)', marginBottom: '2rem' }}>
        <h4 style={{ fontSize: '1rem', fontWeight: 800, margin: 0, color: '#fff', marginBottom: '0.5rem' }}>Deployment Pending</h4>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: 0 }}>
          Neo X EVM contracts are currently undergoing internal audit and will be published shortly.
        </p>
      </div>
      
      <style jsx>{`
        .hover-white:hover { color: #fff; }
      `}</style>
    </div>
  );
}
