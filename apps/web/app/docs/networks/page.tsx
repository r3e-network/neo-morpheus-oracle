"use client";

import { Globe, Copy, Check, ExternalLink } from "lucide-react";
import { useState } from "react";
import { NETWORKS } from "@/lib/onchain-data";

export default function DocsNetworks() {
  const [copied, setCopied] = useState<string | null>(null);
  const oracleDomain = NETWORKS.neo_n3.domains.oracle || "unassigned";
  const datafeedDomain = NETWORKS.neo_n3.domains.datafeed || "unassigned";
  const aaDomain = NETWORKS.neo_n3.domains.aa || "unassigned";
  const neodidDomain = NETWORKS.neo_n3.domains.neodid || "unassigned";
  const callbackConsumer = NETWORKS.neo_n3.callbackConsumer || "unpublished";
  const exampleConsumer = NETWORKS.neo_n3.exampleConsumer || callbackConsumer;

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
        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)' }}>REGISTRY v1.0.3</span>
      </div>
      <h1>Networks & Contracts</h1>

      <p className="lead" style={{ fontSize: '1.15rem', color: 'var(--text-primary)', marginBottom: '3rem' }}>
        Official publication status for the Morpheus Privacy Oracle, validation consumers, and Data Matrix contracts.
      </p>

      <div style={{ padding: '1.5rem', marginBottom: '2rem', borderLeft: '4px solid var(--neo-green)', background: '#000', borderTop: '1px solid var(--border-dim)', borderRight: '1px solid var(--border-dim)', borderBottom: '1px solid var(--border-dim)', borderRadius: '0 4px 4px 0' }}>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: 1.7 }}>
          Selected environment: <code>{NETWORKS.selected.key}</code>. Canonical registries live in <code>config/networks/mainnet.json</code> and <code>config/networks/testnet.json</code>, while Phala descriptors live in <code>phala.mainnet.toml</code> and <code>phala.testnet.toml</code>.
          Current Phala CVM: <code>{NETWORKS.neo_n3.phalaCvmId || "unassigned"}</code>. Current public worker endpoint: <code>{NETWORKS.neo_n3.phalaApiUrl || "unassigned"}</code>.
        </p>
      </div>

      <h2>{NETWORKS.neo_n3.name}</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
        Active environment resolved from <code>NEXT_PUBLIC_MORPHEUS_NETWORK</code> / <code>MORPHEUS_NETWORK</code>.
      </p>

      <div style={{ border: '1px solid var(--border-dim)', borderRadius: '4px', overflow: 'hidden', marginBottom: '4rem', background: '#000' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-dim)' }}>
              <th style={{ padding: '1rem 1.5rem', color: '#fff', fontWeight: 800 }}>CONTRACT</th>
              <th style={{ padding: '1rem 1.5rem', color: '#fff', fontWeight: 800 }}>HASH</th>
              <th style={{ padding: '1rem 1.5rem', color: '#fff', fontWeight: 800 }}>NNS</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid var(--border-dim)' }}>
              <td style={{ padding: '1.25rem 1.5rem', fontWeight: 700 }}>MorpheusOracle</td>
              <td style={{ padding: '1.25rem 1.5rem', fontFamily: 'var(--font-mono)', color: 'var(--neo-green)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {NETWORKS.neo_n3.oracle} {copyBtn(NETWORKS.neo_n3.oracle)}
                </div>
              </td>
              <td style={{ padding: '1.25rem 1.5rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {oracleDomain} {copyBtn(oracleDomain)}
                </div>
              </td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--border-dim)' }}>
              <td style={{ padding: '1.25rem 1.5rem', fontWeight: 700 }}>OracleCallbackConsumer</td>
              <td style={{ padding: '1.25rem 1.5rem', fontFamily: 'var(--font-mono)', color: 'var(--neo-green)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {callbackConsumer} {copyBtn(callbackConsumer)}
                </div>
              </td>
              <td style={{ padding: '1.25rem 1.5rem', color: 'var(--text-muted)' }}>
                <span style={{ fontSize: '0.75rem' }}>No NNS alias</span>
              </td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--border-dim)' }}>
              <td style={{ padding: '1.25rem 1.5rem', fontWeight: 700 }}>ExampleConsumer ({NETWORKS.neo_n3.environmentLabel.toLowerCase()} validation)</td>
              <td style={{ padding: '1.25rem 1.5rem', fontFamily: 'var(--font-mono)', color: 'var(--neo-green)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {exampleConsumer} {copyBtn(exampleConsumer)}
                </div>
              </td>
              <td style={{ padding: '1.25rem 1.5rem', color: 'var(--text-muted)' }}>
                <span style={{ fontSize: '0.75rem' }}>Used in the selected-network validation flows</span>
              </td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--border-dim)' }}>
              <td style={{ padding: '1.25rem 1.5rem', fontWeight: 700 }}>AbstractAccount</td>
              <td style={{ padding: '1.25rem 1.5rem', fontFamily: 'var(--font-mono)', color: 'var(--neo-green)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {NETWORKS.neo_n3.aa} {copyBtn(NETWORKS.neo_n3.aa)}
                </div>
              </td>
              <td style={{ padding: '1.25rem 1.5rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {aaDomain} {copyBtn(aaDomain)}
                </div>
              </td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--border-dim)' }}>
              <td style={{ padding: '1.25rem 1.5rem', fontWeight: 700 }}>NeoDIDRegistry</td>
              <td style={{ padding: '1.25rem 1.5rem', fontFamily: 'var(--font-mono)', color: 'var(--neo-green)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {NETWORKS.neo_n3.neodid} {copyBtn(NETWORKS.neo_n3.neodid)}
                </div>
              </td>
              <td style={{ padding: '1.25rem 1.5rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {neodidDomain} {copyBtn(neodidDomain)}
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
              <td style={{ padding: '1.25rem 1.5rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {datafeedDomain} {copyBtn(datafeedDomain)}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ padding: '1.5rem', marginTop: '-2rem', marginBottom: '4rem', borderLeft: '4px solid var(--accent-blue)', background: '#000', borderTop: '1px solid var(--border-dim)', borderRight: '1px solid var(--border-dim)', borderBottom: '1px solid var(--border-dim)', borderRadius: '0 4px 4px 0' }}>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
          Neo N3 aliases are published as NeoNS <code>TEXT</code> records when assigned and resolve directly to the contract script hashes. The live request fee is <code>0.01 GAS</code> on Neo N3, the active confidential payload algorithm is <code>X25519-HKDF-SHA256-AES-256-GCM</code>, and the public NeoDID service DID is <code>did:morpheus:neo_n3:service:neodid</code>.
        </p>
      </div>

      <h2>Neo X Mainnet</h2>
      <div className="card-industrial" style={{ padding: '2rem', borderLeft: '4px solid var(--accent-blue)', marginBottom: '2rem' }}>
        <h4 style={{ fontSize: '1rem', fontWeight: 800, margin: 0, color: '#fff', marginBottom: '0.5rem' }}>Reference Contracts Ready, Live Publication Pending</h4>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: 0 }}>
          The repository includes Neo X contract code, examples, and interfaces, but live mainnet contract hashes have not been published in the registry yet.
        </p>
      </div>
      
      <style jsx>{`
        .hover-white:hover { color: #fff; }
      `}</style>
    </div>
  );
}
