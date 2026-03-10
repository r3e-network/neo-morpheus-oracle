export default function DocsOracle() {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "1rem" }}>
        <span className="badge badge-success">Service</span>
      </div>
      <h1>Privacy Oracle</h1>

      <p>
        Morpheus Privacy Oracle lets a Neo N3 or Neo X contract request external data and receive the result through a
        callback. The relayer watches the on-chain request event, forwards it to the TEE worker, and then fulfills the
        request back to the contract.
      </p>

      <h2>Production Flow</h2>
      <ol>
        <li>Your contract submits a request to <code>MorpheusOracle</code> or <code>MorpheusOracleX</code>.</li>
        <li>The request pays the configured fee, currently <code>0.01 GAS</code>-equivalent per request.</li>
        <li>The relayer picks up the request and calls the TEE worker.</li>
        <li>The worker fetches, decrypts, and optionally computes inside the enclave.</li>
        <li>The relayer fulfills the callback on-chain with either success or a terminal failure result.</li>
      </ol>

      <h2>Confidential Parameters</h2>
      <p>
        Sensitive fields are encrypted locally with the Oracle RSA public key and attached as
        <code>encrypted_params</code>. The decrypted JSON object is merged into the public request only inside the TEE.
      </p>
      <p>
        The recommended transport format is a hybrid envelope: <code>RSA-OAEP-AES-256-GCM</code>. Legacy small-payload
        raw RSA ciphertext remains supported for backward compatibility.
      </p>

      <pre><code>{`const publicKey = await fetch("/api/oracle/public-key").then((res) => res.json());

const confidentialPatch = {
  headers: { Authorization: "Bearer YOUR_SECRET" },
  json_path: "data.score"
};

const encryptedParams = encryptHybridEnvelope(JSON.stringify(confidentialPatch), publicKey.public_key_pem);`}</code></pre>

      <h2>Request Shapes</h2>
      <p>Morpheus supports two common Oracle styles:</p>
      <ul>
        <li>
          <strong>Built-in provider mode</strong>: use a managed provider such as
          <code>twelvedata</code>, <code>binance-spot</code>, or <code>coinbase-spot</code>.
        </li>
        <li>
          <strong>Custom URL mode</strong>: specify a URL, method, optional headers/body patch, and optional
          transform logic.
        </li>
      </ul>

      <h2>Programmable Execution</h2>
      <p>
        Oracle requests can also carry a built-in compute function, a user script, or a WASM module. Plaintext and
        encrypted fields can be mixed in the same request.
      </p>

      <h2>Developer Console vs On-Chain Requests</h2>
      <p>
        The web console and direct API routes are provided for development, operations, and payload debugging. End-user
        applications should use the on-chain contract request + callback path rather than relying on direct worker
        access.
      </p>
    </>
  );
}
