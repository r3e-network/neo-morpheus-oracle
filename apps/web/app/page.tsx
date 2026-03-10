import Link from "next/link";
import { Dashboard } from "../components/dashboard";
import { Github, Shield, Cpu, Lock, ArrowRight, Zap } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <nav className="navbar">
        <Link href="/" className="nav-logo">
          <img src="/logo-morpheus.png" alt="Morpheus" style={{ height: '36px' }} />
          <span className="text-gradient" style={{ letterSpacing: '0.1em' }}>MORPHEUS</span>
        </Link>
        <div className="nav-links">
          <Link href="/docs" className="btn btn-secondary btn-sm">Documentation</Link>
          <a href="https://github.com/r3e-network/neo-morpheus-oracle" target="_blank" className="btn btn-primary btn-sm">
            <Github size={16} /> Source
          </a>
        </div>
      </nav>

      <main>
        <section className="hero-section" style={{ minHeight: '90vh' }}>
          <div className="hero-bg-wrapper">
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 50%, rgba(0, 255, 163, 0.05) 0%, transparent 50%)', zIndex: 0 }}></div>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent, var(--bg-main))', zIndex: 1 }}></div>
          </div>
          <div className="hero-content" style={{ zIndex: 2 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 16px', background: 'rgba(0, 255, 163, 0.05)', border: '1px solid var(--border-neo)', borderRadius: '99px', marginBottom: '2.5rem' }}>
              <div className="pulse-ring"></div>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--neo-green)', letterSpacing: '0.05em' }}>MAINNET BETA IS LIVE</span>
            </div>
            <h1 className="hero-title" style={{ fontSize: 'clamp(3.5rem, 8vw, 6rem)', letterSpacing: '-0.05em' }}>
              Autonomous <br />
              <span className="text-neo-gradient">Privacy Oracle</span>
            </h1>
            <p className="hero-subtitle" style={{ maxWidth: '650px', fontSize: '1.25rem', color: 'var(--text-dim)' }}>
              The decentralized matrix for confidential compute and high-integrity datafeeds on <strong>Neo N3</strong> and <strong>Neo X</strong>. 
              Securely bridge off-chain truth with on-chain execution.
            </p>
            <div className="hero-actions" style={{ marginTop: '3rem' }}>
              <a href="#explorer" className="btn btn-primary" style={{ padding: '1rem 2.5rem', fontSize: '1rem' }}>
                Launch Explorer <ArrowRight size={18} />
              </a>
              <Link href="/docs" className="btn btn-secondary" style={{ padding: '1rem 2.5rem', fontSize: '1rem' }}>
                Developer Docs
              </Link>
            </div>
          </div>
        </section>

        <section id="explorer" className="container" style={{ padding: '6rem 0' }}>
          <div style={{ marginBottom: '5rem', textAlign: 'center' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--neo-purple)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>Live Telemetry</span>
            <h2 className="text-gradient" style={{ fontSize: '3rem', fontWeight: 900, marginTop: '1rem' }}>Matrix Explorer</h2>
            <div style={{ width: '60px', height: '4px', background: 'var(--neo-green)', margin: '1.5rem auto', borderRadius: '2px' }}></div>
          </div>
          <Dashboard />
        </section>

        <section className="container" style={{ padding: '8rem 0', background: 'radial-gradient(50% 50% at 50% 50%, rgba(139, 92, 246, 0.03) 0%, transparent 100%)' }}>
          <div className="grid grid-3" style={{ gap: '3rem' }}>
            <div className="glass-card" style={{ padding: '3.5rem 2.5rem' }}>
              <div style={{ background: 'rgba(0, 255, 163, 0.05)', width: '64px', height: '64px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '2rem', border: '1px solid var(--border-neo)' }}>
                <Lock className="text-neo" size={28} />
              </div>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '1.25rem' }}>Confidentiality</h3>
              <p style={{ color: 'var(--text-dim)', fontSize: '1rem', lineHeight: 1.7 }}>Hardware-level isolation using Intel SGX ensures that your private data is never visible to node operators or cloud providers.</p>
            </div>
            <div className="glass-card" style={{ padding: '3.5rem 2.5rem' }}>
              <div style={{ background: 'rgba(139, 92, 246, 0.05)', width: '64px', height: '64px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '2rem', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
                <Cpu className="text-purple" size={28} />
              </div>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '1.25rem' }}>Verifiable Compute</h3>
              <p style={{ color: 'var(--text-dim)', fontSize: '1rem', lineHeight: 1.7 }}>Execute complex JS or WASM logic on private datasets with cryptographic proof of execution, powered by the Phala TEE network.</p>
            </div>
            <div className="glass-card" style={{ padding: '3.5rem 2.5rem' }}>
              <div style={{ background: 'rgba(59, 130, 246, 0.05)', width: '64px', height: '64px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '2rem', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                <Zap className="text-neo-gradient" size={28} />
              </div>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '1.25rem' }}>Native Bridging</h3>
              <p style={{ color: 'var(--text-dim)', fontSize: '1rem', lineHeight: 1.7 }}>Purpose-built for Neo N3 (C#) and Neo X (EVM), providing low-latency Oracle access via native on-chain callback mechanisms.</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer" style={{ borderTop: '1px solid var(--border-subtle)', background: 'rgba(0,0,0,0.3)' }}>
        <div className="container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '2rem' }}>
            <div className="nav-logo">
              <img src="/logo-morpheus.png" alt="Morpheus" style={{ height: '28px' }} />
              <span style={{ fontSize: '1rem', letterSpacing: '0.1em' }}>MORPHEUS</span>
            </div>
            <div style={{ display: 'flex', gap: '3rem' }}>
              <Link href="/docs" style={{ color: 'var(--text-dim)', textDecoration: 'none', fontSize: '0.9rem' }}>Docs</Link>
              <a href="#" style={{ color: 'var(--text-dim)', textDecoration: 'none', fontSize: '0.9rem' }}>Network Status</a>
              <a href="https://github.com/r3e-network/neo-morpheus-oracle" style={{ color: 'var(--text-dim)', textDecoration: 'none', fontSize: '0.9rem' }}>GitHub</a>
              <Link href="/admin" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }}>Admin Console</Link>
            </div>
          </div>
          <div style={{ marginTop: '5rem', paddingTop: '2rem', borderTop: '1px solid rgba(255,255,255,0.03)', display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            <span>&copy; {new Date().getFullYear()} Neo Morpheus Network.</span>
            <span>Powered by Phala TEE & Neo Global Development.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
