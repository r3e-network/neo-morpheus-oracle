"use client";

import { Zap, ArrowRight, Code2, Terminal } from "lucide-react";
import Link from "next/link";
import { CodeBlock } from "@/components/ui/CodeBlock";

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
        Before calling the Oracle contract, you should encrypt any sensitive API keys or parameters. Create a JSON object specifying exactly what needs to be injected (e.g., <code>headers</code>), and encrypt it locally using the Morpheus TEE's active RSA public key.
      </p>

      <CodeBlock 
        language="javascript" 
        title="Encrypt Parameters"
        code={`// 1. Fetch TEE Public Key
const res = await fetch("https://morpheus.network/api/oracle/public-key");
const { public_key_pem } = await res.json();

// 2. Your confidential injection payload
const secrets = {
  "headers": { "Authorization": "Bearer YOUR_PRIVATE_API_KEY" }
};

// 3. Encrypt locally using standard RSA-OAEP
const encryptedBlob = await encryptWithRsaOaep(JSON.stringify(secrets), public_key_pem);`} 
      />

      <h2>Step 3: Submit On-Chain Request</h2>
      <p>
        Pass the <code>encryptedBlob</code> along with public routing parameters (like the URL) to the Morpheus Oracle contract. Ensure you attach the required GAS fee (0.01 GAS per request).
      </p>

      <CodeBlock 
        language="solidity" 
        title="MyOracleConsumer.sol (Neo X)"
        code={`// Import the Morpheus Consumer Base
import "./MorpheusConsumerX.sol";

contract MyOracleConsumer is MorpheusConsumerX {
    // Contract state to store the result
    int256 public latestData;

    constructor(address _oracle) MorpheusConsumerX(_oracle) {}

    // Initiate the request
    function fetchPrivateData(bytes memory encryptedBlob) public payable {
        // Send request with 0.01 GAS equivalent fee
        oracle.request{value: msg.value}(
            "url",                     // provider mode
            "https://api.secret.io",   // target url
            encryptedBlob,             // the sealed parameters
            "data.price",              // json extraction path
            address(this),             // callback target
            this.__morpheusCallback.selector // callback selector
        );
    }

    // This is called by the Morpheus Relayer
    function __morpheusCallback(uint256 requestId, int256 result, bytes memory attestation) external override onlyOracle {
        latestData = result;
    }
}`} 
      />

      <h2>Step 4: Await the Relayer Callback</h2>
      <p>
        Once the transaction is mined, the <strong>Morpheus Relayer</strong> detects the event, forwards the encrypted payload to the Phala TEE, and then submits a callback transaction back to your contract containing the signature and result.
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
