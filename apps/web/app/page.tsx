import Link from "next/link";
import { Github, Shield, Cpu, Lock, ArrowRight, Zap, CheckCircle2, Boxes, Activity } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col relative">
      <div className="bg-grid"></div>
      <div className="bg-glow-top"></div>

      <nav className="navbar">
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none' }}>
          <div style={{ background: '#fff', width: '28px', height: '28px', borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Boxes size={18} color="#000" strokeWidth={2.5} />
          </div>
          <span style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem', letterSpacing: '0.1em' }}>MORPHEUS</span>
        </Link>
        <div className="nav-links">
          <Link href="/explorer" className="nav-link">Network</Link>
          <Link href="/docs/feed-status" className="nav-link">Feed Status</Link>
          <Link href="/docs" className="nav-link">Developers</Link>
          <a href="https://github.com/r3e-network/neo-morpheus-oracle" target="_blank" className="btn-secondary" style={{ padding: '0.5rem 1.25rem', fontSize: '0.8rem', fontWeight: 700, borderRadius: '2px', textDecoration: 'none', border: '1px solid var(--border-highlight)' }}>
            <Github size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'text-bottom' }} /> GITHUB
          </a>
        </div>
      </nav>

      <main style={{ flex: 1, zIndex: 1 }}>
        {/* HERO SECTION */}
        <section style={{ paddingTop: '22vh', paddingBottom: '15vh', textAlign: 'center' }}>
          <div className="container fade-in">
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '8px 24px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-highlight)', borderRadius: '2px', marginBottom: '3rem' }}>
              <div className="status-dot"></div>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.15em', fontFamily: 'var(--font-mono)' }}>PROOF OF MACHINE TRUST</span>
            </div>
            
            <h1 className="hero-title">
              Hardware-Secured <br />
              <span className="text-gradient">Privacy Matrix</span>
            </h1>
            
            <p style={{ maxWidth: '680px', margin: '0 auto 3.5rem', fontSize: '1.2rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              The decentralized prover network for confidential oracle callbacks, sealed compute, and high-integrity pricefeeds on Neo N3, with reference interfaces prepared for Neo X.
            </p>
            
            <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center' }}>
              <Link href="/launchpad" className="btn-secondary" style={{ padding: '0.75rem 2.5rem', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '0.1em', fontWeight: 700 }}>
                Launchpad
              </Link>
              <Link href="/explorer" className="btn-ata">
                Enter Network <ArrowRight size={16} />
              </Link>
              <Link href="/docs/feed-status" className="btn-secondary" style={{ padding: '0.75rem 2.5rem', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '0.1em', fontWeight: 700 }}>
                <Activity size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'text-bottom' }} />
                Feed Status
              </Link>
              <Link href="/docs" className="btn-secondary" style={{ padding: '0.75rem 2.5rem', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '0.1em', fontWeight: 700 }}>
                Documentation
              </Link>
            </div>
          </div>
        </section>

        {/* TRUST SECTION - Architecture */}
        <section style={{ padding: '120px 0', borderTop: '1px solid var(--border-dim)' }}>
          <div className="container">
            <div style={{ textAlign: 'center', marginBottom: '5rem' }} className="stagger-1">
              <h2 className="section-title">Silicon-Level Security</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', fontFamily: 'var(--font-mono)' }}>CRYPTOGRAPHY MEETS HARDWARE ISOLATION</p>
            </div>
            
            <div className="grid grid-3">
              <div className="glass-card stagger-2">
                <Shield size={24} color="var(--neo-green)" style={{ marginBottom: '1.5rem' }} />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Phala TEE Runtime</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.7 }}>
                  Data is processed inside attested confidential VM hardware. Operators and infrastructure do not receive the plaintext request contents.
                </p>
              </div>
              <div className="glass-card stagger-3">
                <Cpu size={24} color="var(--accent-blue)" style={{ marginBottom: '1.5rem' }} />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Verifiable Compute</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.7 }}>
                  Run complex JS/WASM logic on private data off-chain. The TEE signs the result, providing cryptographic proof of correct execution.
                </p>
              </div>
              <div className="glass-card stagger-4">
                <Lock size={24} color="var(--text-primary)" style={{ marginBottom: '1.5rem' }} />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Confidential Fetch</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.7 }}>
                  API keys, function arguments, and custom scripts can be sealed locally with X25519 + HKDF-SHA256 + AES-256-GCM before the on-chain request is submitted.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* DATAFEED SECTION */}
        <section style={{ padding: '120px 0', borderTop: '1px solid var(--border-dim)', background: 'radial-gradient(ellipse at center, rgba(0, 255, 163, 0.02) 0%, transparent 70%)' }}>
          <div className="container">
            <div className="grid grid-2" style={{ alignItems: 'center', gap: '6rem' }}>
              <div className="stagger-1">
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', marginBottom: '2rem' }}>
                  <Zap size={16} color="var(--neo-green)" />
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--neo-green)', letterSpacing: '0.15em', fontFamily: 'var(--font-mono)' }}>ON-CHAIN REALITY</span>
                </div>
                <h2 className="section-title">Decentralized Datafeeds</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', marginBottom: '2.5rem', lineHeight: 1.7 }}>
                  Access synchronized mainnet price pairs stored directly on Neo N3. Prices use a global <code>1 USD = 1,000,000</code> integer scale, and updates are scanned every 60 seconds and only published when movement versus the current quantized on-chain value exceeds 0.1%.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '3rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <CheckCircle2 size={18} color="var(--text-primary)" />
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', fontWeight: 500 }}>Native C# & Solidity Interfaces</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <CheckCircle2 size={18} color="var(--text-primary)" />
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', fontWeight: 500 }}>Phala app id, compose hash, and attestation metadata</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <CheckCircle2 size={18} color="var(--text-primary)" />
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', fontWeight: 500 }}>Oracle callback workflow with custom URL, encrypted params, and custom logic</span>
                  </div>
                </div>
                <Link href="/explorer" className="btn-ata">Explore Live Data <ArrowRight size={16} /></Link>
              </div>
              
              <div className="glass-card stagger-2" style={{ position: 'relative', padding: '0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-dim)', padding: '1.5rem', background: 'rgba(255,255,255,0.02)' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 700 }}>MorpheusFeed.cs</span>
                  <span className="badge-outline" style={{ color: 'var(--neo-green)', borderColor: 'var(--neo-green)' }}>SYNC_OK</span>
                </div>
                <pre className="text-neo-gradient" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', lineHeight: 1.7, padding: '2rem' }}>
{`// Read verified 1e6-scaled USD price data on Neo N3
public static void Execute() {
    object[] record = (object[])Contract.Call(
        DataFeedHash,
        "getLatest",
        CallFlags.ReadOnly,
        "TWELVEDATA:NEO-USD"
    );
    
    BigInteger priceUnits = (BigInteger)record[2];
    BigInteger timestamp = (BigInteger)record[3];
    
    // 1.000000 USD == 1_000_000 units
    Require(priceUnits > 1_000_000, "Price too low");
}`}
                </pre>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section style={{ padding: '150px 0', textAlign: 'center', borderTop: '1px solid var(--border-dim)' }}>
          <div className="container stagger-1">
            <h2 className="section-title" style={{ marginBottom: '1.5rem' }}>Initialize Connection</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '3.5rem', fontSize: '1.1rem' }}>Join the next generation of privacy-preserving decentralized infrastructure.</p>
            <Link href="/explorer" className="btn-ata" style={{ padding: '1rem 4rem', fontSize: '0.9rem' }}>
              Enter the Matrix
            </Link>
          </div>
        </section>
      </main>

      <footer style={{ padding: '40px 0', borderTop: '1px solid var(--border-dim)', background: '#000' }}>
        <div className="container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Boxes size={18} color="var(--text-muted)" />
              <span style={{ color: 'var(--text-muted)', fontWeight: 800, fontSize: '0.9rem', letterSpacing: '0.1em' }}>MORPHEUS</span>
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
              © 2026 NEO MORPHEUS NETWORK.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
