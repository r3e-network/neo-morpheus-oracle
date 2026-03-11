"use client";

import { Shield, Lock, Zap, ArrowRight, FileCode } from "lucide-react";
import { CodeBlock } from "@/components/ui/CodeBlock";

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

      <h2>Data Sealing (Parameter Encryption)</h2>
      <p>
        To ensure API keys, authentication tokens, and private identifiers never leak on-chain, Morpheus provides a zero-knowledge parameter sealing mechanism. You encrypt the sensitive parts of your request locally. 
      </p>

      <div style={{ padding: '1.5rem', background: '#000', border: '1px solid var(--border-dim)', borderRadius: '4px', margin: '2rem 0' }}>
        <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>1. Structure your Confidential JSON</h4>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          The TEE expects specific keys (<code>headers</code>, <code>query</code>, <code>body</code>) which it will automatically inject into the outbound HTTP request before leaving the secure enclave.
        </p>
        <CodeBlock
          language="json"
          code={`{
  "headers": {
    "Authorization": "Bearer sk_live_123456789",
    "X-Project-ID": "proj_xyz"
  },
  "query": {
    "private_customer_id": "cust_999"
  }
}`}
        />
      </div>

      <div style={{ padding: '1.5rem', background: '#000', border: '1px solid var(--border-dim)', borderRadius: '4px', margin: '2rem 0' }}>
        <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>2. Encrypt Locally (RSA-OAEP)</h4>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          Fetch the Oracle's current public key and encrypt the JSON string. This operation happens entirely on the client side.
        </p>
        <CodeBlock
          language="javascript"
          code={`// 1. Fetch TEE Public Key
const { public_key_pem } = await fetch("/api/oracle/public-key").then(r => r.json());

// 2. Encrypt the Confidential JSON
const ciphertext = await encryptWithRsaOaep(JSON.stringify(secrets), public_key_pem);
// Returns a Base64 encoded encrypted blob: "vF9+kx..."`}
        />
      </div>

      <h2>Smart Contract Integration</h2>
      <p>
        Now, pass the encrypted blob alongside your public parameters when calling the Oracle contract. The relayer submits it to the TEE, which decrypts the blob using the hardware-sealed private key, makes the HTTP request with the combined parameters, and returns the strictly-defined result.
      </p>
      
      <div className="grid grid-2" style={{ gap: '1.5rem', margin: '2.5rem 0' }}>
        <div>
          <h3 style={{ fontSize: '1rem', marginTop: 0 }}>Neo N3 (C#)</h3>
          <CodeBlock
            language="csharp"
            code={`public static void RequestData() {
    object[] args = new object[] {
        "twelvedata", // Provider ID or custom URL
        "NEO-USD",    // Public Symbol or Path
        ciphertext,   // The encrypted Base64 blob
        "price"       // JSON path to extract, or custom JS script
    };
    Contract.Call(OracleHash, "request", CallFlags.All, args);
}`}
          />
        </div>
        <div>
          <h3 style={{ fontSize: '1rem', marginTop: 0 }}>Neo X (Solidity)</h3>
          <CodeBlock
            language="solidity"
            code={`function requestData() public payable {
    oracle.request{value: msg.value}(
        "twelvedata",
        "NEO-USD",
        ciphertext,
        "price",
        address(this),
        this.__morpheusCallback.selector
    );
}`}
          />
        </div>
      </div>

      <div className="card-industrial" style={{ marginTop: '4rem', padding: '2.5rem', borderLeft: '4px solid var(--neo-green)' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
          <Zap size={20} color="var(--neo-green)" />
          <h4 style={{ fontSize: '1rem', fontWeight: 800, margin: 0, color: '#fff' }}>Transformation Logic</h4>
        </div>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: 0 }}>
          Instead of just a JSON path like <code>"price"</code>, the 4th argument can be a full Javascript function (e.g. <code>function process(data) &#123; return data.price * 2; &#125;</code>) that executes securely inside the TEE after the HTTP fetch completes, returning only the precisely transformed result.
        </p>
      </div>
    </div>
  );
}
