"use client";

import { Shield, Lock, Zap, ArrowRight, FileCode } from "lucide-react";

export default function DocsOracle() {
  return (
    <div className="fade-in">
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "1rem" }}>
        <Shield size={14} color="var(--neo-green)" />
        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)' }}>CORE SERVICE v1.0.2</span>
      </div>
      <h1>Privacy Oracle</h1>

      <p>
        The Morpheus Privacy Oracle allows smart contracts to request off-chain data from any HTTP(S) source with end-to-end encryption. Unlike public oracles, Morpheus ensures that API keys, auth tokens, and sensitive parameters are never exposed on-chain or to the infrastructure operator.
      </p>

      <h2>Request Lifecycle</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', margin: '2.5rem 0' }}>
        {[
          { step: "1", title: "Parameter Sealing", desc: "User dApp encrypts secret parts of the request (e.g., API keys) locally using the Oracle RSA Public Key." },
          { step: "2", title: "On-Chain Submission", desc: "User contract calls request() on MorpheusOracle, attaching the encrypted blob and paying the fee." },
          { step: "3", title: "Enclave Execution", desc: "TEE worker picks up the task, unseals the data inside SGX, performs the fetch, and signs the result." },
          { step: "4", title: "Verified Callback", desc: "The Relayer submits the TEE-signed result back to the user's contract via a callback function." }
        ].map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: '1.5rem', padding: '1.25rem', background: '#000', border: '1px solid var(--border-dim)', borderRadius: '4px' }}>
            <div style={{ color: 'var(--neo-green)', fontWeight: 900, fontSize: '1rem', fontFamily: 'var(--font-mono)' }}>{item.step}</div>
            <div>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 800, marginBottom: '0.25rem', color: '#fff' }}>{item.title}</h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 0 }}>{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <h2>Data Sealing (Encryption)</h2>
      <p>
        To protect your secrets, you must use <strong>RSA-OAEP 2048</strong> encryption. You can fetch the active public key from the <code>/api/oracle/public-key</code> endpoint.
      </p>
      
      <pre><code>{`// Example: Encrypting a secret header locally
const { public_key_pem } = await fetch("/api/oracle/public-key").then(r => r.json());

const secrets = {
  headers: { "X-API-KEY": "secret_value_123" }
};

// Encrypt locally (no network trip required for the secret plaintext)
const encryptedParams = await encrypt(JSON.stringify(secrets), public_key_pem);`}</code></pre>

      <h2>Contract Integration</h2>
      <h3>Neo X (Solidity)</h3>
      <p>
        Inherit from <code>MorpheusConsumerX</code> and implement the <code>__morpheusCallback</code> function.
      </p>
      <pre><code>{`function requestMarketData(string memory pair) public payable {
    bytes memory encrypted = "..."; // Sealed parameters
    oracle.request{value: msg.value}(
        "twelvedata",
        pair,
        encrypted,
        "price",
        address(this),
        this.__morpheusCallback.selector
    );
}`}</code></pre>

      <h3>Neo N3 (C#)</h3>
      <p>
        Use the <code>MorpheusOracle</code> contract hash and trigger a request via the <code>request</code> method.
      </p>
      <pre><code>{`public static void RequestData() {
    object[] args = new object[] {
        "twelvedata", "NEO-USD", encryptedParams, "price"
    };
    Contract.Call(OracleHash, "request", CallFlags.All, args);
}`}</code></pre>

      <div className="card-industrial" style={{ marginTop: '4rem', padding: '2.5rem', borderLeft: '4px solid var(--neo-green)' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
          <Zap size={20} color="var(--neo-green)" />
          <h4 style={{ fontSize: '1rem', fontWeight: 800, margin: 0, color: '#fff' }}>Production Readiness</h4>
        </div>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: 0 }}>
          The Oracle service is currently live on Neo N3 Mainnet. Each request costs a flat fee of <strong>0.01 GAS</strong> to cover TEE computation and relayer overhead.
        </p>
      </div>
    </div>
  );
}
