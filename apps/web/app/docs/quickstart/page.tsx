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
