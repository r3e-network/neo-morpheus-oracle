"use client";

import { Layers, Zap, Terminal, Shield, ArrowRight } from "lucide-react";

export default function DocsArchitecture() {
  return (
    <div className="fade-in">
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "1rem" }}>
        <Layers size={14} color="var(--neo-green)" />
        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)' }}>TECHNICAL SPEC v1.0.2</span>
      </div>
      <h1>System Architecture</h1>

      <p>
        The Morpheus protocol is designed as an asynchronous, high-integrity bridge between deterministic blockchain environments and the non-deterministic Web2 world. It utilizes a three-plane architecture to ensure that sensitive data remains confidential while results are cryptographically verifiable.
      </p>

      <div style={{ margin: '3rem 0', padding: '2rem', background: '#000', border: '1px solid var(--border-dim)', borderRadius: '4px', textAlign: 'center' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 800, marginBottom: '2rem', fontFamily: 'var(--font-mono)' }}>LOGICAL DATA FLOW</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
          <div style={{ padding: '1rem', border: '1px solid var(--neo-green)', borderRadius: '4px', fontSize: '0.8rem', width: '120px' }}>Neo N3/X Contracts</div>
          <ArrowRight size={16} color="var(--text-muted)" />
          <div style={{ padding: '1rem', border: '1px solid var(--accent-purple)', borderRadius: '4px', fontSize: '0.8rem', width: '120px' }}>Async Relayer</div>
          <ArrowRight size={16} color="var(--text-muted)" />
          <div style={{ padding: '1rem', border: '1px solid var(--neo-green)', background: 'var(--neo-green-dim)', borderRadius: '4px', fontSize: '0.8rem', width: '120px', fontWeight: 800 }}>Phala TEE Worker</div>
        </div>
      </div>

      <h2>The Three Core Planes</h2>
      
      <h3>1. On-Chain Control Plane</h3>
      <p>
        The entrance and exit points of the protocol. <code>MorpheusOracle</code> contracts on Neo handle request queuing, fee collection (in GAS), and final callback execution. 
      </p>
      <ul>
        <li><strong>N3 Implementation:</strong> C# contracts with native <code>Oracle</code> service integration.</li>
        <li><strong>Neo X Implementation:</strong> Solidity contracts with EVM-compatible callback interfaces.</li>
      </ul>

      <h3>2. Asynchronous Relayer Plane</h3>
      <p>
        A robust middleware layer responsible for event monitoring and transaction management. It ensures that every request is accounted for and that TEE-signed results are successfully delivered back to the source chain.
      </p>
      <div style={{ padding: '1.5rem', background: '#000', borderLeft: '3px solid var(--accent-purple)', margin: '2rem 0', borderRadius: '0 4px 4px 0' }}>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
          <strong>Zero-Knowledge Relaying:</strong> The relayer does not have access to the request's sensitive plaintext data. It strictly acts as a blind transport layer moving the <code>RSA-OAEP</code> encrypted blobs and TEE signatures between the blockchain and the enclave.
        </p>
      </div>

      <h3>3. Phala TEE Runtime Plane</h3>
      <p>
        The "Brain" of the protocol. Running inside Intel SGX secure enclaves via Phala Network's dstack, this environment provides:
      </p>
      <ul style={{ listStyleType: 'none', paddingLeft: 0 }}>
        <li style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem' }}><span style={{ color: 'var(--neo-green)' }}>✓</span><div><strong>Confidentiality:</strong> Decryption happens strictly in hardware-protected memory.</div></li>
        <li style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem' }}><span style={{ color: 'var(--neo-green)' }}>✓</span><div><strong>Isolation:</strong> User scripts and WASM modules are time-bounded and sandboxed.</div></li>
        <li style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem' }}><span style={{ color: 'var(--neo-green)' }}>✓</span><div><strong>Attestation:</strong> Every response is cryptographically bound to the hardware instance.</div></li>
      </ul>

      <h2>Security & Verification Model</h2>
      <p>
        Morpheus operates on a <strong>Trust-but-Verify</strong> model. While on-chain contracts verify the fast ECU signature for efficiency, the full hardware attestation proof is always available for high-value operations.
      </p>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '2rem' }}>
        <div style={{ padding: '1.5rem', background: '#000', border: '1px solid var(--border-dim)', borderRadius: '4px' }}>
          <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>1. Fast Verification (On-Chain)</h4>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: 0 }}>Contracts verify the lightweight signature using <code>verify(result, signature, oracle_verifying_key)</code>.</p>
        </div>
        <div style={{ padding: '1.5rem', background: '#000', border: '1px solid var(--border-dim)', borderRadius: '4px' }}>
          <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>2. High Assurance (Off-Chain)</h4>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: 0 }}>DApps can manually inspect the <code>Remote Attestation Quote</code> to guarantee the worker is running genuine SGX hardware.</p>
        </div>
      </div>

      <div style={{ marginTop: '4rem', padding: '2rem', background: '#000', borderTop: '1px solid var(--border-dim)' }}>
        <h4 style={{ fontSize: '0.9rem', fontWeight: 800, marginBottom: '0.75rem', color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Developer Note</h4>
        <p style={{ fontSize: '0.9rem', marginBottom: 0, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          To maintain high throughput and minimize costs, Morpheus uses a batching relayer. This means multiple Oracle callbacks may be compressed into a single aggregated transaction on Neo X, significantly reducing overall network congestion.
        </p>
      </div>
    </div>
  );
}
