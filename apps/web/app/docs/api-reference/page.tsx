"use client";

import { Code2, ArrowRight } from "lucide-react";
import Link from "next/link";
import { BUILTIN_FUNCTIONS } from "@/lib/docs-data";

export default function DocsApiReference() {
  return (
    <div className="fade-in">
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "1rem" }}>
        <Code2 size={14} color="var(--neo-green)" />
        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)' }}>DEVELOPER REFERENCE</span>
      </div>
      <h1>API Reference</h1>

      <p className="lead" style={{ fontSize: '1.15rem', color: 'var(--text-primary)', marginBottom: '2.5rem' }}>
        Complete technical specifications for the Morpheus smart contracts and the Enclave Javascript SDK. 
      </p>

      <h2>1. Smart Contract Interface (Solidity)</h2>
      <p>
        To interact with the Morpheus Oracle on Neo X, you must interact with the main <code>MorpheusOracleX</code> contract.
      </p>
      
      <div className="card-industrial" style={{ padding: '0', overflow: 'hidden', marginBottom: '2.5rem' }}>
        <div style={{ padding: '1rem 1.5rem', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-dim)' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>IMorpheusOracleX.sol</span>
        </div>
        <pre style={{ margin: 0, border: 'none', background: 'transparent' }}><code>{`interface IMorpheusOracleX {
    /**
     * @dev Submit an Oracle request to the TEE Prover Network.
     * @param requestType Type of request ("provider", "url", "builtin").
     * @param target Target provider ID or URL endpoint.
     * @param encryptedParams RSA-OAEP encrypted JSON blob for sensitive data.
     * @param jsonPath JSONPath expression to extract from the response.
     * @param callbackAddress Address of the consumer contract to receive the callback.
     * @param callbackSelector Function selector of the callback method.
     * @return requestId The unique ID of the request.
     */
    function request(
        string memory requestType,
        string memory target,
        bytes memory encryptedParams,
        string memory jsonPath,
        address callbackAddress,
        bytes4 callbackSelector
    ) external payable returns (uint256 requestId);
}`}</code></pre>
      </div>

      <h2>2. Smart Contract Interface (C#)</h2>
      <p>
        To interact with the Morpheus Oracle on Neo N3, you will use the <code>Contract.Call</code> native method.
      </p>
      
      <div className="card-industrial" style={{ padding: '0', overflow: 'hidden', marginBottom: '2.5rem' }}>
        <div style={{ padding: '1rem 1.5rem', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-dim)' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>Oracle Call Pattern</span>
        </div>
        <pre style={{ margin: 0, border: 'none', background: 'transparent' }}><code>{`// Contract Script Hash: 0x017520f068fd602082fe5572596185e62a4ad991

object[] args = new object[] {
    "provider",          // request type
    "twelvedata",        // target provider
    encryptedParams,     // RSA-OAEP ciphertext
    "price",             // json path extraction
    "callbackFunction"   // callback method name on your contract
};

Contract.Call(MorpheusOracleHash, "request", CallFlags.All, args);`}</code></pre>
      </div>

      <h2>3. Enclave SDK (Javascript)</h2>
      <p>
        When writing custom compute scripts for the Morpheus TEE Worker, you have access to a globally injected <code>morpheus</code> object containing hardware-accelerated cryptographic primitives and secure network utilities.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {BUILTIN_FUNCTIONS.map(fn => (
          <div key={fn.name} className="card-industrial" style={{ padding: '1.5rem', borderLeft: '2px solid var(--accent-purple)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', alignItems: 'center' }}>
              <code style={{ color: 'var(--neo-green)', fontWeight: 800, fontSize: '0.95rem', fontFamily: 'var(--font-mono)' }}>{fn.name}</code>
              <span className="badge-outline" style={{ color: 'var(--accent-purple)', fontSize: '0.55rem', borderColor: 'var(--accent-purple)' }}>{fn.category}</span>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: 1.6 }}>{fn.desc}</p>
            <div style={{ background: '#000', padding: '1rem', borderRadius: '4px', border: '1px solid var(--border-dim)' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontFamily: 'var(--font-mono)' }}>// Parameters</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)', marginBottom: '1rem', fontFamily: 'var(--font-mono)' }}>{fn.params}</div>
              
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontFamily: 'var(--font-mono)' }}>// Example</div>
              <code style={{ fontSize: '0.75rem', color: '#fff', wordBreak: 'break-all', fontFamily: 'var(--font-mono)' }}>{fn.example}</code>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
