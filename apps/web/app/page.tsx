import Link from "next/link";
import { Dashboard } from "../components/dashboard";

export default function HomePage() {
  return (
    <>
      <nav className="navbar glass-panel-nav">
        <Link href="/" className="nav-logo">
          <img src="/logo-morpheus.png" alt="Neo Morpheus Oracle" className="h-8 w-auto" style={{ height: '32px' }} />
          <span>Morpheus Oracle</span>
        </Link>
        <div className="nav-links">
          <a href="#oracle">Oracle</a>
          <a href="#compute">Compute</a>
          <a href="#datafeed">Datafeed</a>
          <Link href="/verifier" className="btn btn-outline btn-inline">
            Verifier
          </Link>
          <a
            href="https://github.com/r3e-network/neo-morpheus-oracle"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary btn-inline"
          >
            GitHub
          </a>
        </div>
      </nav>

      <main style={{ padding: 0, maxWidth: '100%' }}>
        <section className="hero-section">
          <div className="hero-bg-wrapper">
            <img src="/hero-bg.png" alt="Hero Background" className="hero-bg-img" />
            <div className="hero-overlay" />
          </div>
          <div className="hero-content">
            <span className="hero-badge">Verifiable Intelligence</span>
            <h1 className="hero-title text-gradient">The Decentralized Matrix<br />for On-Chain Truth</h1>
            <p className="hero-subtitle">
              A standalone privacy Oracle, confidential compute, and datafeed network for <strong>Neo N3</strong> and <strong>Neo X</strong>.
              Encrypt secrets locally, inspect live TEE identity, and verify attestation proofs.
            </p>
            <div className="hero-actions">
              <a href="#dashboard" className="btn btn-primary" style={{ padding: '16px 36px', fontSize: '1.1rem' }}>
                Launch Console
              </a>
              <a href="https://github.com/r3e-network/neo-morpheus-oracle/tree/main/docs" target="_blank" rel="noopener noreferrer" className="btn btn-outline" style={{ padding: '16px 36px', fontSize: '1.1rem' }}>
                Documentation
              </a>
            </div>
          </div>
        </section>

        <div id="dashboard" className="dashboard-container">
          <div className="dashboard-intro">
            <h2 className="text-gradient">Network Controls</h2>
            <p className="dashboard-subtitle">
              Interact with the Morpheus Oracle network directly. Encrypt private data in-browser, query live feeds, inspect TEE state, execute confidential compute, and monitor relayer operations.
            </p>
          </div>
          <Dashboard />
        </div>
      </main>

      <footer className="footer-section">
        <p>© {new Date().getFullYear()} Neo Morpheus Oracle. All rights reserved.</p>
        <div className="footer-links">
          <a href="https://github.com/r3e-network/neo-morpheus-oracle" target="_blank" rel="noopener noreferrer">Source Code</a>
          <a href="https://neo.org" target="_blank" rel="noopener noreferrer">Neo Protocol</a>
        </div>
      </footer>
    </>
  );
}
