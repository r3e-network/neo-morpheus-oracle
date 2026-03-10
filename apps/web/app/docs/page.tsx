"use client";

import Link from "next/link";
import { ArrowRight, Shield, Cpu, Zap, Info, Terminal, BookOpen, Code2 } from "lucide-react";

export default function DocsIntroduction() {
  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.5rem' }}>
        <div className="status-dot"></div>
        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--neo-green)', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)' }}>DOCUMENTATION v1.0.2</span>
      </div>
      
      <h1>Infrastructure for Machine-Verified Truth</h1>
      
      <p className="lead" style={{ fontSize: '1.25rem', color: 'var(--text-primary)', marginBottom: '2.5rem' }}>
        Neo Morpheus Oracle is a decentralized privacy-preserving prover network. It utilizes hardware-based Trusted Execution Environments (TEE) to securely bridge sensitive off-chain data with Neo N3 and Neo X smart contracts.
      </p>

      <div className="grid grid-2" style={{ gap: '1.5rem', marginBottom: '4rem' }}>
        <div className="card-industrial" style={{ padding: '1.5rem' }}>
          <Shield size={20} color="var(--neo-green)" style={{ marginBottom: '1rem' }} />
          <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Confidentiality</h3>
          <p style={{ fontSize: '0.85rem', marginBottom: 0 }}>End-to-end encryption ensures secrets are only unsealed inside secure hardware memory.</p>
        </div>
        <div className="card-industrial" style={{ padding: '1.5rem' }}>
          <Cpu size={20} color="var(--accent-blue)" style={{ marginBottom: '1rem' }} />
          <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Verifiability</h3>
          <p style={{ fontSize: '0.85rem', marginBottom: 0 }}>Cryptographic proofs (Attestation) guarantee that execution happened exactly as programmed.</p>
        </div>
      </div>

      <h2>The Privacy Problem</h2>
      <p>
        Standard oracles broadcast sensitive data—such as API keys, private identity scores, or proprietary trading logic—directly onto public ledgers. This transparency prevents smart contracts from interacting with most of the world's high-value data.
      </p>
      
      <blockquote style={{ borderLeft: '2px solid var(--neo-green)', background: 'rgba(0, 255, 163, 0.02)', padding: '1.5rem', margin: '2rem 0' }}>
        <strong>The Morpheus Solution:</strong> By moving logic into Phala TEE enclaves, Morpheus creates a "Secure Sandbox" where data can be fetched, processed, and signed without ever being exposed to node operators or the underlying cloud provider.
      </blockquote>

      <h2>Core Architecture</h2>
      <p>
        The Morpheus ecosystem is composed of three primary layers designed for high availability and absolute integrity:
      </p>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', margin: '2.5rem 0' }}>
        {[
          { icon: Zap, title: "On-Chain Registry", desc: "Native contracts on Neo N3 and Neo X that handle request lifecycle and signature verification." },
          { icon: Terminal, title: "Asynchronous Relayer", desc: "A robust event-driven bridge that coordinates between the blockchain and the TEE worker." },
          { icon: Shield, title: "TEE Prover Network", desc: "Hardware-isolated workers that execute requests, manage RSA keys, and generate proofs." }
        ].map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: '1.5rem', padding: '1.25rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-dim)', borderRadius: '4px' }}>
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '4px', height: 'fit-content' }}>
              <item.icon size={18} color="var(--neo-green)" />
            </div>
            <div>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 800, marginBottom: '0.25rem', color: '#fff' }}>{item.title}</h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 0 }}>{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <h2>Next Steps</h2>
      <div className="grid grid-2" style={{ gap: '1.5rem' }}>
        <Link href="/docs/oracle" className="card-industrial" style={{ padding: '2rem', textDecoration: 'none', transition: 'border-color 0.2s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 800, fontSize: '1rem', color: '#fff' }}>INTEGRATION GUIDE</span>
            <ArrowRight size={18} color="var(--neo-green)" />
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '1rem', marginBottom: 0 }}>Learn how to call Morpheus from Solidity or C# contracts.</p>
        </Link>
        <Link href="/docs/architecture" className="card-industrial" style={{ padding: '2rem', textDecoration: 'none', transition: 'border-color 0.2s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 800, fontSize: '1rem', color: '#fff' }}>TECHNICAL SPEC</span>
            <ArrowRight size={18} color="var(--neo-green)" />
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '1rem', marginBottom: 0 }}>Deep dive into the TEE trust model and relayer logic.</p>
        </Link>
      </div>
    </div>
  );
}
