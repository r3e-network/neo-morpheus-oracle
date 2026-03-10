export default function DocsCompute() {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "1rem" }}>
        <span className="badge badge-success">Service</span>
      </div>
      <h1>Privacy Compute</h1>

      <p>
        Morpheus Privacy Compute executes deterministic functions, scripts, and WASM modules inside the TEE and returns
        the result to a smart contract callback.
      </p>

      <h2>Supported Runtime Types</h2>
      <ul>
        <li>
          <strong>Built-in functions</strong> for hashing, RSA verification, modular arithmetic, matrix operations,
          Merkle roots, ZKP planning, FHE planning, and privacy helpers.
        </li>
        <li>
          <strong>User scripts</strong> when untrusted script execution is explicitly enabled by environment policy.
        </li>
        <li>
          <strong>WASM modules</strong> with configurable execution timeout. The default timeout is
          <code>30000ms</code>.
        </li>
      </ul>

      <h2>How Contracts Use It</h2>
      <p>
        In production, compute is still requested through the Oracle contract. The request type routes to the compute
        worker path, and the result comes back through the standard callback flow.
      </p>

      <pre><code>{`{
  "mode": "builtin",
  "function": "zkp.public_signal_hash",
  "input": { "signals": ["123", "456"] },
  "target_chain": "neo_n3"
}`}</code></pre>

      <h2>Confidential Inputs</h2>
      <p>
        Just like Oracle requests, compute requests can carry plaintext fields and encrypted fields together. Use
        <code>encrypted_input</code> or <code>encrypted_params</code> when the function name, script, WASM entry point,
        or part of the input must stay confidential until execution.
      </p>
      <p>
        Large confidential payloads should use the hybrid envelope <code>RSA-OAEP-AES-256-GCM</code>, while legacy raw
        RSA ciphertext is still accepted for small payloads.
      </p>

      <h2>Isolation Model</h2>
      <p>
        Compute execution is isolated from the Oracle fetch path. Built-ins stay deterministic. User scripts are gated
        by runtime policy. WASM execution is time-bounded and intended as the stronger programmable isolation model.
      </p>

      <blockquote>
        Built-ins are the preferred path for stable contract integrations. Use scripts or WASM only when you need custom
        logic that cannot be expressed by the built-in catalog.
      </blockquote>
    </>
  );
}
