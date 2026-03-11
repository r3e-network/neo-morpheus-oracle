"use client";

import { Shield, Lock, Zap, FileCode, Database, Calculator, Activity } from "lucide-react";

export default function DocsUseCases() {
  return (
    <div className="fade-in">
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "1rem" }}>
        <Zap size={14} color="var(--neo-green)" />
        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)' }}>SOLUTIONS & SCENARIOS</span>
      </div>
      <h1>Use Cases</h1>

      <p className="lead" style={{ fontSize: '1.15rem', color: 'var(--text-primary)', marginBottom: '3rem', lineHeight: 1.6 }}>
        Discover how Morpheus's Privacy Oracle and Built-in Compute engine enable new classes of decentralized applications on Neo. These plug-and-play scenarios require zero WASM/Rust knowledge to implement.
      </p>

      <h2>1. Privacy Oracle Scenarios</h2>
      <p>
        Leverage <code>Data Sealing</code> to securely proxy HTTP requests without leaking credentials or sensitive user payloads on-chain.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', margin: '2.5rem 0' }}>
        <div style={{ padding: '2rem', background: '#000', border: '1px solid var(--border-dim)', borderRadius: '4px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.25rem' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '4px', background: 'rgba(0,255,163,0.05)', border: '1px solid rgba(0,255,163,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Shield size={20} color="var(--neo-green)" />
            </div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Premium Financial Feeds</h3>
          </div>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.7, flex: 1 }}>
            <strong>Problem:</strong> Smart contracts need high-accuracy FX or commodity API data (e.g., Bloomberg) that require paid API keys. Standard oracles leak these keys to node operators.<br/><br/>
            <strong>Solution:</strong> Encrypt the <code>Authorization: Bearer</code> token locally using the TEE's active X25519 public key. The keys are only ever unsealed inside the hardware enclave, enabling non-stop data fetching with zero structural leakage.
          </p>
        </div>

        <div style={{ padding: '2rem', background: '#000', border: '1px solid var(--border-dim)', borderRadius: '4px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.25rem' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '4px', background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Lock size={20} color="var(--accent-purple)" />
            </div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Zero-Knowledge KYC</h3>
          </div>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.7, flex: 1 }}>
            <strong>Problem:</strong> You want to airdrop to Twitter users with &gt;10k followers or Binance accounts holding specific assets, but users refuse to dox their exact profiles on-chain.<br/><br/>
            <strong>Solution:</strong> Users encrypt their OAuth tokens into the request. You provide a custom JS slice that fetches the profile, checks the condition, and returns <strong>only a boolean</strong> (<code>return data.followers_count &gt; 10000;</code>). Only the boolean is signed and published.
          </p>
        </div>
      </div>

      <h2>2. Built-in Compute Scenarios</h2>
      <p>
        Invoke pre-compiled, highly optimized C++/Rust routines inside the enclave simply by switching your request mode to <code>builtin</code>.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', margin: '2.5rem 0' }}>
        {[
          {
            icon: FileCode,
            title: "Regulated Asset Masking (privacy.mask)",
            problem: "Regulated Real World Asset (RWA) contracts require off-chain sensitive ID strings to be partially masked before on-chain storage or events.",
            solution: "Instantly process strings (e.g., '13812345678' -> '138****5678') with hardware-assured memory wiping, passing back only the redacted result.",
            payload: `{
  "mode": "builtin",
  "function": "privacy.mask",
  "input": { "value": "13812345678", "unmasked_left": 3, "unmasked_right": 4 }
}`
          },
          {
            icon: Database,
            title: "ZKP Public Signal Digest (zkp.public_signal_hash)",
            problem: "Verifying ZK-SNARKs on-chain often requires hashing hundreds of public signals into a single digest—costing astronomical GAS on EVM/N3.",
            solution: "Offload the massive array hashing into the TEE. It returns a lightweight digest signature that the smart contract can cheaply verify.",
            payload: `{
  "mode": "builtin",
  "function": "zkp.public_signal_hash",
  "input": { "circuit_id": "tornado_v1", "signals": ["123", "456", "..."] }
}`
          },
          {
            icon: Calculator,
            title: "Giant Number Arithmetic (math.modexp)",
            problem: "RSA signatures, Verifiable Delay Functions (VDFs), and advanced cryptography require big integer modular exponentiation, which lacks native opcodes and hits execution limits.",
            solution: "Submit the base, exponent, and modulus. The TEE completes the highly CPU-intensive math in milliseconds and returns the finalized artifact.",
            payload: `{
  "mode": "builtin",
  "function": "math.modexp",
  "input": { "base": "123456789", "exponent": "987654321", "modulus": "2147483647" }
}`
          },
          {
            icon: Activity,
            title: "Hidden AI Credit Score (matrix.multiply)",
            problem: "A protocol wants to use proprietary AI model weights (a heavy matrix) to score user loan risk. Releasing it on-chain exposes the IP; keeping it central destroys trust.",
            solution: "The protocol encrypts their weights. The user loads their public behavior vector. The TEE performs secure dense matrix multiplication and safely returns only the final 'Credit Score: 850'.",
            payload: `{
  "mode": "builtin",
  "function": "matrix.multiply",
  "input": { "left": [[...]], "right": [[...]] }
}`
          }
        ].map((item, i) => {
          const Icon = item.icon;
          return (
            <div key={i} style={{ padding: '2rem', background: '#000', border: '1px solid var(--border-dim)', borderRadius: '4px', borderLeft: '4px solid var(--neo-green)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1rem' }}>
                <Icon size={20} color="var(--neo-green)" />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.title}</h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem', paddingLeft: '2rem' }}>
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  <strong style={{ color: '#ef4444' }}>Problem:</strong> {item.problem}
                </p>
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  <strong style={{ color: 'var(--neo-green)' }}>Solution:</strong> {item.solution}
                </p>
              </div>
              <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-dim)', borderRadius: '4px' }}>
                <h4 style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 800, marginBottom: '0.5rem', fontFamily: 'var(--font-mono)' }}>REFERENCE PAYLOAD</h4>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{item.payload}</pre>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
