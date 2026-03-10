import Link from "next/link";
import { Github, Shield, Cpu, Lock, ArrowRight, Zap, Database, CheckCircle2, Globe, Command, Boxes } from "lucide-react";

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
          <Link href="/docs" className="nav-link">Developers</Link>
          <a href="https://github.com/r3e-network/neo-morpheus-oracle" target="_blank" className="btn btn-secondary" style={{ padding: '0.5rem 1.25rem' }}>
            <Github size={14} /> GitHub
          </a>
        </div>
      </nav>

      <main style={{ flex: 1, zIndex: 1 }}>
        {/* HERO SECTION */}
        <section style={{ paddingTop: '20vh', paddingBottom: '15vh', textAlign: 'center' }}>
          <div className="container fade-in">
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-highlight)', borderRadius: '2px', marginBottom: '2.5rem' }}>
              <div className="status-dot"></div>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.1em' }}>PROOF OF MACHINE TRUST</span>
            </div>
            
            <h1 className="hero-title">
              Hardware-Secured <br />
              <span className="text-gradient">Privacy Matrix</span>
            </h1>
            
            <p style={{ maxWidth: '650px', margin: '0 auto 3rem', fontSize: '1.15rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              The decentralized prover network utilizing TEE technology for confidential compute and high-integrity datafeeds on Neo N3 and Neo X.
            </p>
            
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <Link href="/explorer" className="btn btn-primary">
                Launch Explorer <ArrowRight size={16} />
              </Link>
              <Link href="/docs" className="btn btn-secondary">
                Read Documentation
              </Link>
            </div>
          </div>
        </section>

        {/* TRUST SECTION - Architecture */}
        <section style={{ padding: '120px 0', borderTop: '1px solid var(--border-dim)' }}>
          <div className="container">
            <div style={{ textAlign: 'center', marginBottom: '4rem' }} className="stagger-1">
              <h2 className="section-title">Silicon-Level Security</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>Cryptography meets hardware isolation.</p>
            </div>
            
            <div className="grid grid-3">
              <div className="card-industrial stagger-2">
                <Shield size={24} color="var(--neo-green)" style={{ marginBottom: '1.5rem' }} />
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>Intel SGX Enclaves</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                  Data is processed exclusively within secure hardware enclaves. Not even the node operator or hypervisor can inspect the memory state.
                </p>
              </div>
              <div className="card-industrial stagger-3">
                <Cpu size={24} color="var(--accent-blue)" style={{ marginBottom: '1.5rem' }} />
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>Verifiable Compute</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                  Run complex JS/WASM logic on private data off-chain. The TEE signs the result, providing cryptographic proof of correct execution.
                </p>
              </div>
              <div className="card-industrial stagger-4">
                <Lock size={24} color="var(--text-primary)" style={{ marginBottom: '1.5rem' }} />
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>Zero-Knowledge Fetch</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                  API keys are encrypted locally using RSA-2048. They remain encrypted during transport and are only unsealed inside the enclave.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* DATAFEED SECTION */}
        <section style={{ padding: '120px 0', borderTop: '1px solid var(--border-dim)', background: 'radial-gradient(ellipse at center, rgba(0, 255, 163, 0.02) 0%, transparent 70%)' }}>
          <div className="container">
            <div className="grid grid-2" style={{ alignItems: 'center', gap: '4rem' }}>
              <div className="stagger-1">
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '1.5rem' }}>
                  <Zap size={16} color="var(--neo-green)" />
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--neo-green)', letterSpacing: '0.1em' }}>ON-CHAIN REALITY</span>
                </div>
                <h2 className="section-title">Decentralized Datafeeds</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', marginBottom: '2rem', lineHeight: 1.6 }}>
                  Access 14+ high-fidelity price pairs synchronized directly from the prover network to Neo N3 and Neo X smart contracts.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <CheckCircle2 size={18} color="var(--text-primary)" />
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Native C# & Solidity Interfaces</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <CheckCircle2 size={18} color="var(--text-primary)" />
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Sub-second TEE Attestation</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <CheckCircle2 size={18} color="var(--text-primary)" />
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Custom URL & Authorization Support</span>
                  </div>
                </div>
                <Link href="/explorer" className="btn btn-secondary">Explore Live Data</Link>
              </div>
              
              <div className="card-industrial stagger-2" style={{ position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem', borderBottom: '1px solid var(--border-dim)', paddingBottom: '1rem' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>MorpheusFeed.cs</span>
                  <span className="badge-outline" style={{ color: 'var(--neo-green)' }}>SYNC_OK</span>
                </div>
                <pre className="text-neo-gradient" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', lineHeight: 1.7 }}>
{`// Fetching verified data on Neo N3
public static void Execute() {
    var result = (Map)Oracle.GetLatestPrice("NEO-USD");
    
    BigInteger price = (BigInteger)result["price"];
    uint timestamp = (uint)result["timestamp"];
    
    Require(price > 1000, "Price too low");
}`}
                </pre>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section style={{ padding: '120px 0', textAlign: 'center', borderTop: '1px solid var(--border-dim)' }}>
          <div className="container stagger-1">
            <h2 className="section-title" style={{ marginBottom: '1.5rem' }}>Initialize Connection</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '3rem', fontSize: '1.1rem' }}>Join the next generation of privacy-preserving decentralized infrastructure.</p>
            <Link href="/explorer" className="btn btn-primary" style={{ padding: '1rem 3rem', fontSize: '1rem' }}>
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
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
              © 2026 Neo Morpheus Network.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}