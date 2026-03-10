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
      <blockquote>
        The relayer does not have access to the request's sensitive data; it only moves encrypted blobs and TEE signatures.
      </blockquote>

      <h3>3. Phala TEE Runtime Plane</h3>
      <p>
        The "Brain" of the protocol. Running inside Intel SGX secure enclaves via Phala Network's dstack, this environment provides:
      </p>
      <ul>
        <li><strong>Confidentiality:</strong> Decryption happens only in hardware-protected memory.</li>
        <li><strong>Isolation:</strong> User scripts and WASM modules are time-bounded and sandboxed.</li>
        <li><strong>Attestation:</strong> Every response is cryptographically bound to the specific hardware instance and code hash.</li>
      </ul>

      <h2>Security & Verification Model</h2>
      <p>
        Morpheus operates on a <strong>Trust-but-Verify</strong> model. While on-chain contracts verify the Verifier Key signature for efficiency, the full attestation proof is available for high-value operations.
      </p>
      <ol>
        <li><strong>On-Chain:</strong> Contract checks <code>verify(result, signature, oracle_verifying_key)</code>.</li>
        <li><strong>Off-Chain:</strong> DApps can verify the <code>Remote Attestation Quote</code> to ensure the worker is running the correct Morpheus image on genuine SGX hardware.</li>
      </ol>

      <div className="card-industrial" style={{ marginTop: '4rem', padding: '2rem' }}>
        <h4 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '1rem', color: '#fff' }}>Developer Note</h4>
        <p style={{ fontSize: '0.9rem', marginBottom: 0, color: 'var(--text-secondary)' }}>
          To maintain high throughput, Morpheus uses a batching relayer. This means multiple Oracle callbacks may be compressed into a single transaction on Neo X, reducing overall network congestion.
        </p>
      </div>
    </div>
  );
}
