export default function DocsArchitecture() {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "1rem" }}>
        <span className="badge badge-success">Deep Dive</span>
      </div>
      <h1>System Architecture</h1>

      <p>
        Morpheus connects Neo N3 and Neo X contracts to a Phala TEE worker through an asynchronous relayer. The core
        design goal is simple: sensitive request material is decrypted and executed only inside the enclave, while the
        chains receive signed callback results or synchronized feed records.
      </p>

      <h2>The Three Core Planes</h2>
      <h3>1. On-Chain Contracts</h3>
      <p>
        Morpheus Oracle contracts receive user requests, collect the request fee, emit request events, and accept the
        final callback. The callback contracts verify the worker result signature against the configured Oracle verifier
        key.
      </p>

      <h3>2. Relayer Plane</h3>
      <p>
        The relayer watches both chains, forwards requests to the worker, and submits the callback transaction. If a
        request fails upstream, times out, or exhausts retries, the relayer still finalizes the request with an
        on-chain failure callback instead of silently dropping it.
      </p>

      <h3>3. Phala TEE Worker</h3>
      <p>
        The worker exposes Oracle, compute, signing, and feed sync logic. It also serves the Oracle RSA public key for
        client-side encryption and can attach attestation metadata when requested.
      </p>

      <h2>Verification Model</h2>
      <ol>
        <li>Contracts verify the callback payload signature from the configured Oracle verifier key.</li>
        <li>Attestation objects can be attached by the worker for off-chain verification.</li>
        <li>The verifier page checks attestation structure and payload binding outside the chain runtime.</li>
      </ol>

      <p>
        Full SGX quote verification is <strong>not</strong> performed on-chain today. The chain-level security boundary
        is the worker result signature, while attestation is a separate off-chain verification layer.
      </p>

      <h2>Datafeed Path</h2>
      <p>
        Datafeeds are not a user callback workflow. They are operator-controlled sync jobs that publish normalized price
        records to dedicated datafeed contracts. User contracts read those records directly from chain state.
      </p>
    </>
  );
}
