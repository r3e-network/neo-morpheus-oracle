"use client";

import { CheckCircle, Shield, Cpu, Lock, Info } from "lucide-react";
import Link from "next/link";

export default function DocsVerifier() {
  return (
    <div className="fade-in">
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "1rem" }}>
        <CheckCircle size={14} color="var(--neo-green)" />
        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)' }}>SECURITY SPEC v1.0.3</span>
      </div>
      <h1>Attestation & Security</h1>

      <p>
        Remote Attestation is the cornerstone of Morpheus's trust model. It lets external observers validate that the response metadata came from the expected Phala TEE deployment and that the quote is bound to the reported output hash and on-chain <code>attestation_hash</code>.
      </p>

      <h2>The Evidence Layer</h2>
      <p>
        Every task executed by a Morpheus worker can be bundled with an <strong>Attestation Quote</strong>. The verifier focuses on the application-level fields that are available in the live result envelope:
      </p>
      <ul style={{ listStyleType: 'none', paddingLeft: 0, margin: '2rem 0' }}>
        <li style={{ marginBottom: '1.25rem', display: 'flex', gap: '0.75rem', padding: '1.25rem', background: '#000', border: '1px solid var(--border-dim)', borderRadius: '4px' }}>
          <span style={{ color: 'var(--neo-green)', fontWeight: 800 }}>✓</span>
          <div>
            <strong style={{ display: 'block', color: 'var(--text-primary)', marginBottom: '0.25rem', fontFamily: 'var(--font-mono)' }}>app_id / compose_hash</strong>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Stable identifiers that let you confirm the response came from the expected Morpheus Phala deployment and compose bundle.</span>
          </div>
        </li>
        <li style={{ marginBottom: '1.25rem', display: 'flex', gap: '0.75rem', padding: '1.25rem', background: '#000', border: '1px solid var(--border-dim)', borderRadius: '4px' }}>
          <span style={{ color: 'var(--neo-green)', fontWeight: 800 }}>✓</span>
          <div>
            <strong style={{ display: 'block', color: 'var(--text-primary)', marginBottom: '0.25rem', fontFamily: 'var(--font-mono)' }}>instance_id</strong>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Identifies the concrete worker instance that produced the quote, useful for operational forensics and replay analysis.</span>
          </div>
        </li>
        <li style={{ display: 'flex', gap: '0.75rem', padding: '1.25rem', background: '#000', border: '1px solid var(--border-dim)', borderRadius: '4px' }}>
          <span style={{ color: 'var(--neo-green)', fontWeight: 800 }}>✓</span>
          <div>
            <strong style={{ display: 'block', color: 'var(--text-primary)', marginBottom: '0.25rem', fontFamily: 'var(--font-mono)' }}>attestation_hash / report_data</strong>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Morpheus currently sets <code>attestation_hash == output_hash</code>. The verifier compares the first 32 bytes of TDX <code>report_data</code> against that hash.</span>
          </div>
        </li>
      </ul>

      <h2>Off-Chain Verification Flow</h2>
      <p>
        While on-chain contracts verify the worker signature, high-security applications should also perform off-chain verification:
      </p>
      <ol>
        <li>Fetch the callback envelope or worker response, then read <code>output_hash</code>, <code>attestation_hash</code>, and <code>tee_attestation.report_data</code>.</li>
        <li>Verify that <code>attestation_hash == output_hash</code>.</li>
        <li>Verify that the first 32 bytes of <code>report_data</code> match that same hash.</li>
        <li>Check <code>app_id</code> and <code>compose_hash</code> against the published Morpheus deployment metadata.</li>
        <li>If you need full quote-chain validation, perform an additional platform-specific verification pass outside the built-in web verifier.</li>
      </ol>

      <div style={{ margin: '2.5rem 0', padding: '1.5rem', background: '#000', border: '1px solid var(--border-dim)', borderRadius: '4px' }}>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 800, marginBottom: '1rem', fontFamily: 'var(--font-mono)' }}>VERIFIER TOOL</div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          Morpheus provides a built-in <strong>Attestation Verifier</strong> in the Matrix Explorer. You can paste any worker response to validate its hardware proof instantly.
        </p>
        <Link href="/verifier" className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }}>OPEN VERIFIER</Link>
      </div>

      <h2>Trust Boundaries</h2>
      <p>
        By combining hardware isolation with cryptographic proof, Morpheus shifts the security boundary from <strong>"Trust the Operator"</strong> to <strong>"Trust the Code"</strong>. 
      </p>
      
      <div style={{ marginTop: '4rem', padding: '2.5rem', background: '#000', borderTop: '1px solid var(--border-dim)', borderRight: '1px solid var(--border-dim)', borderBottom: '1px solid var(--border-dim)', borderLeft: '4px solid var(--neo-green)', borderRadius: '0 4px 4px 0' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
          <Shield size={20} color="var(--neo-green)" />
          <h4 style={{ fontSize: '1rem', fontWeight: 800, margin: 0, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Auditability</h4>
        </div>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: 0, lineHeight: 1.6 }}>
          The entire Morpheus worker runtime is open-source. Security auditors can independently verify the code paths that produce the reported output hash, transport encryption metadata, and callback envelope format.
        </p>
      </div>
    </div>
  );
}
