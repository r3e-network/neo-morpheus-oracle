export default function DocsIntroduction() {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1rem' }}>
        <span className="badge badge-success">Overview</span>
      </div>
      <h1>Welcome to Morpheus Oracle</h1>
      
      <p>
        The <strong>Neo Morpheus Oracle</strong> is a standalone, decentralized privacy oracle, confidential compute platform, and datafeed network specifically built for the <strong>Neo N3</strong> and <strong>Neo X</strong> ecosystems.
      </p>

      <h2>What is Morpheus?</h2>
      <p>
        Traditional oracles operate in public. Every request, every API key, and every computation is visible on-chain. This limits smart contracts from interacting with sensitive Web2 data or performing operations that require intellectual property protection.
      </p>
      <p>
        Morpheus solves this by moving execution into <strong>Trusted Execution Environments (TEEs)</strong>—specifically, the Phala Network's dstack. Within these Secure Enclaves, node operators cannot see the data being processed, the API keys being used, or the algorithms being run.
      </p>

      <h2>Core Capabilities</h2>
      <ul>
        <li>
          <strong>Privacy Oracle:</strong> Smart contracts can request data from authenticated or private Web2 APIs. Users encrypt their requests locally using the TEE's RSA public key, ensuring the payload is only decrypted inside the enclave.
        </li>
        <li>
          <strong>Confidential Compute:</strong> Run intensive, deterministic, or zero-knowledge cryptographic functions off-chain and securely verify the results on Neo.
        </li>
        <li>
          <strong>Data Feeds:</strong> Operator-synchronized on-chain price records that user contracts read directly from chain state.
        </li>
        <li>
          <strong>Verification Layers:</strong> Contracts verify worker result signatures on-chain, while the verifier tool checks remote attestation data off-chain.
        </li>
      </ul>

      <h2>Developer Focus</h2>
      <p>
        Morpheus is built with developer experience in mind. It acts as the bridge between Web2 infrastructure and Neo's powerful smart contract capabilities, opening the door for DeFi platforms, confidential identity systems, and secure off-chain processing.
      </p>

      <div className="card" style={{ marginTop: '3rem', background: 'var(--bg-surface)' }}>
        <h3 style={{ marginTop: 0 }}>Ready to dive in?</h3>
        <p style={{ marginBottom: 0 }}>
          Explore the <strong>Architecture</strong> to see how the network is structured, or check out the <strong>Privacy Oracle</strong> to learn how to make your first secure request.
        </p>
      </div>
    </>
  );
}
