export default function DocsVerifier() {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "1rem" }}>
        <span className="badge badge-success">Security</span>
      </div>
      <h1>Attestation & Security</h1>

      <p>
        Remote attestation is the evidence layer for the Morpheus worker runtime. It lets operators and integrators
        verify that a response came from the expected Phala TEE environment and that the payload binding is internally
        consistent.
      </p>

      <h2>What Is Verified Today</h2>
      <ol>
        <li>The worker signs callback payloads, and contracts verify that signature on-chain.</li>
        <li>The worker can attach attestation metadata and quotes to responses.</li>
        <li>The Morpheus verifier tool checks attestation structure, report-data binding, app id, instance id, and compose hash off-chain.</li>
      </ol>

      <h2>Important Boundary</h2>
      <p>
        The current contracts do <strong>not</strong> perform full SGX quote verification on-chain. Attestation is
        exposed for external verification, operational assurance, and audit workflows, while the on-chain acceptance path
        relies on the configured Oracle verifier signature.
      </p>

      <h2>Verifier Tool</h2>
      <p>
        Use the Verifier page to load a demo attestation or paste a real worker response. The browser tool validates the
        attestation payload and expected output hash without requiring a chain transaction.
      </p>
    </>
  );
}
