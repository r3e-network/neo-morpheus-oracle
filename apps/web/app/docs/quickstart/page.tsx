"use client";

import { Zap, ArrowRight, Code2, Terminal } from "lucide-react";
import Link from "next/link";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { NETWORKS } from "@/lib/onchain-data";

export default function DocsQuickstart() {
  return (
    <div className="fade-in">
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "1rem" }}>
        <Zap size={14} color="var(--neo-green)" />
        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)' }}>GETTING STARTED</span>
      </div>
      <h1>Quickstart</h1>

      <p className="lead" style={{ fontSize: '1.15rem', color: 'var(--text-primary)', marginBottom: '2.5rem' }}>
        Integrate the Morpheus Privacy Oracle into your Neo smart contracts in under 5 minutes. This guide covers the end-to-end flow from encrypting secrets to reading the TEE-verified result on-chain.
      </p>

      <h2>Step 1: Understand the Data Flow</h2>
      <p>
        The Morpheus network requires an asynchronous request-callback pattern. You must implement a callback function in your contract to receive the response.
      </p>

      <h2>Step 2: Seal Your Parameters (Off-Chain)</h2>
      <p>
        Before calling the Oracle contract, encrypt any sensitive API keys or parameters locally. The worker&apos;s active X25519 public key is exposed through the frontend proxy and also published on-chain in the Oracle registry metadata.
      </p>

      <CodeBlock 
        language="javascript" 
        title="Encrypt Parameters"
        code={`// 1. Fetch TEE Public Key
const res = await fetch("/api/oracle/public-key");
const { public_key } = await res.json();

// 2. Your confidential injection payload
const secrets = {
  "headers": { "Authorization": "Bearer YOUR_PRIVATE_API_KEY" }
};

// 3. Encrypt locally using X25519 + HKDF-SHA256 + AES-256-GCM
const encryptedBlob = await encryptWithOracleX25519(JSON.stringify(secrets), public_key);`} 
      />

      <h2>Step 3: Submit On-Chain Request</h2>
      <p>
        Build a JSON payload, then pass that payload bytestring to the Oracle contract. On Neo N3 the request currently costs <code>0.01 GAS</code> of prepaid credit; on Neo X the reference interface uses <code>requestFee()</code>.
      </p>

      <CodeBlock 
        language="csharp" 
        title="MyOracleConsumer.cs (Neo N3 Mainnet)"
        code={`// Mainnet Oracle: ${NETWORKS.neo_n3.oracle}
// NeoNS alias: ${NETWORKS.neo_n3.domains.oracle}

public static BigInteger FetchPrivateData(ByteString encryptedBlob)
{
    string payloadJson = "{\\"url\\":\\"https://api.secret.io\\","
        + "\\"encrypted_params\\":\\"" + (string)encryptedBlob + "\\","
        + "\\"json_path\\":\\"data.price\\","
        + "\\"target_chain\\":\\"neo_n3\\"}";

    return (BigInteger)Contract.Call(
        OracleHash,
        "request",
        CallFlags.All,
        "oracle",
        (ByteString)payloadJson,
        Runtime.ExecutingScriptHash,
        "onOracleResult"
    );
}

public static void OnOracleResult(BigInteger requestId, string requestType, bool success, ByteString result, string error)
{
    Storage.Put(Storage.CurrentContext, "last_result", result);
}`} 
      />

      <h2>Step 4: Await the Relayer Callback</h2>
      <p>
        Once the transaction is mined, the <strong>Morpheus Relayer</strong> detects the event, forwards the encrypted payload to the Phala TEE, and then submits a callback transaction back to your contract containing the signed result envelope. If the upstream fetch or compute fails, the request should still finalize with a failure callback instead of being silently dropped.
      </p>

      <div style={{ marginTop: '4rem', padding: '2.5rem', background: '#000', borderTop: '1px solid var(--border-dim)', borderRight: '1px solid var(--border-dim)', borderBottom: '1px solid var(--border-dim)', borderLeft: '4px solid var(--neo-green)', borderRadius: '0 4px 4px 0' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
          <Terminal size={20} color="var(--neo-green)" />
          <h4 style={{ fontSize: '1rem', fontWeight: 800, margin: 0, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Zero-Code Testing (Mainnet)</h4>
        </div>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
          You don&apos;t need to write or deploy your own Consumer contract to test Morpheus! We have deployed a universal <code>OracleCallbackConsumer</code> shell on Neo N3 mainnet at <code style={{ color: 'var(--neo-green)', background: 'rgba(0,255,163,0.05)', padding: '0.2rem 0.5rem', borderRadius: '4px', border: '1px solid rgba(0,255,163,0.2)', fontSize: '0.85rem', marginLeft: '0.5rem' }}>0x89b05cac00804648c666b47ecb1c57bc185821b7</code>.
        </p>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
          <strong>1. Submit Request:</strong> Generate your JSON payload using the <strong>Dashboard Oracle Builder</strong>. Then, invoke <code>request</code> on the MorpheusOracle (<code>&#123;NETWORKS.neo_n3.oracle&#125;</code>) directly using NeoLine or Neo-CLI:
        </p>
        <ul style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', paddingLeft: '1.5rem', lineHeight: 1.6 }}>
          <li>Arg 1 (String): <code>"privacy_oracle"</code> or <code>"compute"</code></li>
          <li>Arg 2 (ByteString): Your generated JSON payload string</li>
          <li>Arg 3 (Hash160): <code>0x89b05cac00804648c666b47ecb1c57bc185821b7</code></li>
          <li>Arg 4 (String): <code>"onOracleResult"</code></li>
          <li style={{ marginTop: '0.5rem' }}><strong style={{ color: '#fff' }}>Fee:</strong> Attach exactly <code>0.01 GAS</code> to the transaction invocation.</li>
        </ul>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: 0, lineHeight: 1.6 }}>
          <strong>2. Read Result:</strong> Check your transaction to get the <code>requestId</code>. Wait about 60 seconds, then perform a read-only invoke of <code>getCallback(requestId)</code> on the consumer script hash above to view your completely executed result envelope!
        </p>
      </div>

      <div className="grid grid-2" style={{ gap: '1.5rem', marginTop: '4rem' }}>
        <Link href="/docs/api-reference" className="card-industrial" style={{ padding: '2rem', textDecoration: 'none', transition: 'border-color 0.2s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 800, fontSize: '1rem', color: '#fff' }}>API REFERENCE</span>
            <ArrowRight size={18} color="var(--neo-green)" />
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '1rem', marginBottom: 0 }}>View complete smart contract interfaces and TEE SDK methods.</p>
        </Link>
        <Link href="/docs/compute" className="card-industrial" style={{ padding: '2rem', textDecoration: 'none', transition: 'border-color 0.2s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 800, fontSize: '1rem', color: '#fff' }}>ENCLAVE COMPUTE</span>
            <ArrowRight size={18} color="var(--neo-green)" />
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '1rem', marginBottom: 0 }}>Learn how to run custom JavaScript inside the hardware enclave.</p>
        </Link>
      </div>
    </div>
  );
}
