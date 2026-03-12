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

      <h2>1. Smart Contract Interface (Solidity Reference)</h2>
      <p>
        Neo X live contract publication is still pending, but the reference interface below matches the current repository contracts and examples.
      </p>
      
      <div style={{ padding: '0', overflow: 'hidden', marginBottom: '2.5rem', background: '#000', border: '1px solid var(--border-dim)', borderRadius: '4px' }}>
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-dim)', display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>IMorpheusOracleX.sol</span>
        </div>
        <div style={{ padding: '1.5rem', background: '#0a0a0a', overflowX: 'auto' }}>
          <pre style={{ margin: 0, border: 'none', background: 'transparent' }}>
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', lineHeight: 1.6, color: '#e5e5e5' }}>{`interface IMorpheusOracleX {
    /**
     * @dev Submit an Oracle request to the TEE prover network.
     * @param requestType Type of request ("privacy_oracle", "oracle", "compute", "automation_register", ...).
     * @param payload UTF-8 JSON payload bytes. Confidential fields stay inside encrypted_params / encrypted_payload.
     * @param callbackContract Address of the consumer contract to receive the callback.
     * @param callbackMethod String callback entrypoint on the consumer contract.
     * @return requestId The unique ID of the request.
     */
    function requestFee() external view returns (uint256);
    function request(
        string memory requestType,
        bytes memory payload,
        address callbackContract,
        string memory callbackMethod
    ) external payable returns (uint256 requestId);
}`}</code>
          </pre>
        </div>
      </div>

      <h2>2. Smart Contract Interface (C#)</h2>
      <p>
        To interact with the Morpheus Oracle on Neo N3 mainnet, use <code>Contract.Call</code> against <code>0x017520f068fd602082fe5572596185e62a4ad991</code> or NeoNS <code>oracle.morpheus.neo</code>.
      </p>
      
      <div style={{ padding: '0', overflow: 'hidden', marginBottom: '2.5rem', background: '#000', border: '1px solid var(--border-dim)', borderRadius: '4px' }}>
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-dim)', display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Oracle Call Pattern</span>
        </div>
        <div style={{ padding: '1.5rem', background: '#0a0a0a', overflowX: 'auto' }}>
          <pre style={{ margin: 0, border: 'none', background: 'transparent' }}>
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', lineHeight: 1.6, color: '#e5e5e5' }}>{`// Contract Script Hash: 0x017520f068fd602082fe5572596185e62a4ad991

string payloadJson = "{\"symbol\":\"TWELVEDATA:NEO-USD\",\"json_path\":\"price\",\"target_chain\":\"neo_n3\"}";

Contract.Call(
    MorpheusOracleHash,
    "request",
    CallFlags.All,
    "privacy_oracle",
    (ByteString)payloadJson,
    Runtime.ExecutingScriptHash,
    "onOracleResult"
);`}</code>
          </pre>
        </div>
      </div>

      <h2>3. Enclave SDK (Javascript)</h2>
      <p>
        When using built-in compute, Morpheus exposes a fixed catalog of functions. Custom JS compute receives <code>input</code> and <code>helpers</code>; Oracle custom JS receives <code>data</code>, <code>context</code>, and <code>helpers</code>.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
        {BUILTIN_FUNCTIONS.map(fn => (
          <div key={fn.name} style={{ background: '#000', border: '1px solid var(--border-dim)', borderRadius: '4px', padding: '1.5rem', borderTop: '3px solid var(--accent-purple)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', alignItems: 'flex-start' }}>
              <code style={{ color: 'var(--neo-green)', fontWeight: 800, fontSize: '0.95rem', fontFamily: 'var(--font-mono)' }}>{fn.name}</code>
              <span className="badge-outline" style={{ color: 'var(--accent-purple)', fontSize: '0.55rem', padding: '0.2rem 0.5rem', borderColor: 'var(--accent-purple)', textTransform: 'uppercase' }}>{fn.category}</span>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.6 }}>{fn.desc}</p>
            <div style={{ background: '#0a0a0a', padding: '1rem', borderRadius: '4px', border: '1px solid var(--border-dim)' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>// PARAMETERS</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)', marginBottom: '1.5rem', fontFamily: 'var(--font-mono)' }}>{fn.params}</div>
              
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>// EXAMPLE</div>
              <code style={{ display: 'block', fontSize: '0.75rem', color: '#fff', wordBreak: 'break-all', fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap' }}>{fn.example}</code>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
