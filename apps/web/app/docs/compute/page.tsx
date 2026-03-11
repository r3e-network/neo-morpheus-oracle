"use client";

import { Cpu, Terminal, Zap, FileCode, ShieldAlert } from "lucide-react";
import { CodeBlock } from "@/components/ui/CodeBlock";

export default function DocsCompute() {
  return (
    <div className="fade-in">
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "1rem" }}>
        <Cpu size={14} color="var(--accent-blue)" />
        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)' }}>EXTENDED SERVICE v1.0.2</span>
      </div>
      <h1>Enclave Compute</h1>

      <p>
        Morpheus Enclave Compute allows developers to execute complex, non-deterministic, or proprietary logic inside a Trusted Execution Environment. The network supports multiple runtimes, ensuring that inputs and intermediate states are never visible to the public blockchain.
      </p>

      <h2>Supported Runtimes</h2>
      <div className="grid grid-2" style={{ gap: '1.5rem', margin: '2.5rem 0' }}>
        <div className="card-industrial" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
            <Terminal size={16} color="var(--neo-green)" />
            <h4 style={{ fontSize: '0.9rem', fontWeight: 800, margin: 0 }}>Javascript (QuickJS)</h4>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 0 }}>High-level scripting for data aggregation, custom API parsing, and business logic.</p>
        </div>
        <div className="card-industrial" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
            <FileCode size={16} color="var(--accent-blue)" />
            <h4 style={{ fontSize: '0.9rem', fontWeight: 800, margin: 0 }}>WebAssembly (WASM)</h4>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 0 }}>Performance-critical tasks like ZKP witness generation or complex mathematical models.</p>
        </div>
      </div>

      <h2>Built-in Capabilities</h2>
      <p>
        The TEE environment provides a global <code>morpheus</code> object with optimized cryptographic and utility functions:
      </p>
      <ul>
        <li><strong>Hashing:</strong> SHA-256 and Keccak-256 for integrity checks.</li>
        <li><strong>Verification:</strong> High-performance RSA signature verification.</li>
        <li><strong>Randomness:</strong> Hardware-based VRF (Verifiable Random Function).</li>
        <li><strong>Linear Algebra:</strong> Optimized matrix and vector operations.</li>
      </ul>

      <h2>Handling Confidential Arguments</h2>
      <p>
        When you dispatch a compute job, the encrypted blob you sealed locally is decrypted by the TEE core. Once unsealed, its contents—along with any public arguments—are injected into your JavaScript context via the <code>data.args</code> object. This allows you to combine on-chain public state with off-chain private keys securely.
      </p>

      <CodeBlock
        language="javascript"
        title="Custom Aggregator Script"
        code={`async function process(data) {
    // data.args contains the unsealed JSON you encrypted earlier
    const apiKey1 = data.args.headers["X-API-KEY-1"];
    const apiKey2 = data.args.headers["X-API-KEY-2"];
    
    // 1. Fetch from private sources using the unsealed keys
    const res1 = await morpheus.http_request('https://api.source-a.com', { headers: { "Authorization": apiKey1 } });
    const res2 = await morpheus.http_request('https://api.source-b.com', { headers: { "Authorization": apiKey2 } });
    
    // 2. Compute average in-memory safely off-chain
    const avg = (res1.data.price + res2.data.price) / 2;
    
    // 3. Result is signed by TEE and sent back to Neo
    return { average: avg, timestamp: Date.now() };
}`}
      />

      <h2>Security Model</h2>
      <p>
        Compute tasks are strictly time-bounded (default 30s timeout) and executed in a stateless enclave instance. Any data required for the next execution cycle must be stored back on the blockchain via the callback mechanism.
      </p>

      <div className="card-industrial" style={{ marginTop: '4rem', padding: '2rem', border: '1px solid rgba(239, 68, 68, 0.15)', background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.02), transparent)' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
          <ShieldAlert size={20} color="#ef4444" />
          <h4 style={{ fontSize: '1rem', fontWeight: 800, margin: 0, color: '#fff' }}>Untrusted Scripts</h4>
        </div>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: 0 }}>
          Direct script execution is currently in <strong>Closed Beta</strong>. Production requests should use the <code>builtin</code> function catalog unless previously whitelisted by the network operators.
        </p>
      </div>
    </div>
  );
}
