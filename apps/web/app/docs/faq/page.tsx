"use client";

import { HelpCircle, AlertCircle, CheckCircle2, ChevronRight } from "lucide-react";

export default function DocsFAQ() {
  const faqs = [
    {
      q: "What is the request fee for the Privacy Oracle?",
      a: "The current fee is 0.01 GAS (or equivalent) per request. This covers the TEE computation time and the relayer's transaction costs for the on-chain callback."
    },
    {
      q: "Which networks are currently supported?",
      a: "Neo N3 Mainnet is fully supported. Neo X support is currently in internal testing and will be deployed to Mainnet soon."
    },
    {
      q: "Do I need to run my own relayer?",
      a: "No. The Morpheus Network operates a decentralized pool of relayers. However, for high-availability enterprise requirements, you can run a private relayer instance."
    },
    {
      q: "Is the TEE code open source?",
      a: "Yes. All code running inside the Phala SGX enclaves is open source and can be audited. The MR_ENCLAVE measurement can be verified against the official repository builds."
    }
  ];

  const errors = [
    {
      code: "0x01",
      name: "INVALID_SIGNATURE",
      desc: "The callback signature does not match the configured Oracle Verifier Key. Ensure your contract is pointing to the correct Morpheus registry."
    },
    {
      code: "0x02",
      name: "INSUFFICIENT_FEE",
      desc: "The attached GAS fee is lower than the required minimum. Check the 'request_fee' value in the contract."
    },
    {
      code: "0x03",
      name: "TEE_TIMEOUT",
      desc: "The request took longer than 30 seconds to execute inside the enclave. Simplify your Javascript/WASM logic or optimize network calls."
    }
  ];

  return (
    <div className="fade-in">
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "1rem" }}>
        <HelpCircle size={14} color="var(--neo-green)" />
        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)' }}>SUPPORT</span>
      </div>
      <h1>FAQ & Troubleshooting</h1>

      <p className="lead" style={{ fontSize: '1.15rem', color: 'var(--text-primary)', marginBottom: '3rem' }}>
        Common questions about integration, security, and network operations.
      </p>

      <h2>Frequently Asked Questions</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '4rem' }}>
        {faqs.map((faq, i) => (
          <div key={i} className="card-industrial" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', marginTop: 0, color: 'var(--neo-green)', marginBottom: '0.75rem' }}>Q: {faq.q}</h3>
            <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginBottom: 0 }}>{faq.a}</p>
          </div>
        ))}
      </div>

      <h2>Error Codes</h2>
      <p>If your callback receives a failure status, refer to the table below to diagnose the issue.</p>
      
      <div style={{ border: '1px solid var(--border-dim)', borderRadius: '4px', overflow: 'hidden', margin: '2rem 0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-dim)' }}>
              <th style={{ padding: '1rem', color: '#fff', fontWeight: 800 }}>CODE</th>
              <th style={{ padding: '1rem', color: '#fff', fontWeight: 800 }}>NAME</th>
              <th style={{ padding: '1rem', color: '#fff', fontWeight: 800 }}>DESCRIPTION</th>
            </tr>
          </thead>
          <tbody>
            {errors.map((err, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border-dim)' }}>
                <td style={{ padding: '1rem', fontFamily: 'var(--font-mono)', color: 'var(--neo-green)' }}>{err.code}</td>
                <td style={{ padding: '1rem', fontWeight: 700 }}>{err.name}</td>
                <td style={{ padding: '1rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>{err.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card-industrial" style={{ marginTop: '4rem', padding: '2rem', borderLeft: '4px solid var(--accent-blue)' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
          <AlertCircle size={20} color="var(--accent-blue)" />
          <h4 style={{ fontSize: '1rem', fontWeight: 800, margin: 0, color: '#fff' }}>Still having issues?</h4>
        </div>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
          If you encounter an error not listed here, please provide your <code>requestId</code> and <code>transactionHash</code> to our support team.
        </p>
        <button className="btn btn-secondary btn-sm">OPEN SUPPORT TICKET</button>
      </div>
    </div>
  );
}
