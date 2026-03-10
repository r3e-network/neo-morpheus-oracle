import Link from "next/link";
import { Github, Shield, Cpu, Lock, ArrowRight, Zap, Database, Terminal, Layers } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <nav className="navbar" style={{ position: 'fixed', width: '100%' }}>
        <Link href="/" className="nav-logo" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ background: 'var(--neo-green)', borderRadius: '6px', padding: '4px' }}>
            <Layers size={20} color="#000" />
          </div>
          <span className="text-gradient" style={{ letterSpacing: '0.1em' }}>MORPHEUS</span>
        </Link>
        <div className="nav-links">
          <Link href="/docs" className="btn btn-secondary btn-sm" style={{ padding: '0.5rem 1rem' }}>Documentation</Link>
          <a href="https://github.com/r3e-network/neo-morpheus-oracle" target="_blank" className="btn btn-primary btn-sm" style={{ padding: '0.5rem 1rem' }}>
            <Github size={16} /> Source
          </a>
        </div>
      </nav>

      <main>
        {/* HERO SECTION - Pure CSS */}
        <section className="hero-section" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', position: 'relative', overflow: 'hidden' }}>
          {/* CSS Abstract Background */}
          <div style={{ position: 'absolute', inset: 0, zIndex: 0, opacity: 0.8 }}>
            <div style={{ position: 'absolute', top: '10%', left: '15%', width: '500px', height: '500px', background: 'radial-gradient(circle, var(--neo-green-glow) 0%, transparent 60%)', filter: 'blur(80px)' }}></div>
            <div style={{ position: 'absolute', bottom: '10%', right: '10%', width: '600px', height: '600px', background: 'radial-gradient(circle, var(--neo-purple-glow) 0%, transparent 60%)', filter: 'blur(100px)' }}></div>
            {/* Grid Overlay */}
            <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px)', backgroundSize: '50px 50px', transform: 'perspective(500px) rotateX(60deg) translateY(-100px) translateZ(-200px)', transformOrigin: 'top center' }}></div>
          </div>

          <div className="container" style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
            <div className="fade-in stagger-1">
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 20px', background: 'rgba(0, 255, 163, 0.05)', border: '1px solid var(--border-neo)', borderRadius: '99px', marginBottom: '2.5rem', backdropFilter: 'blur(10px)' }}>
                <div className="pulse-ring"></div>
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--neo-green)', letterSpacing: '0.05em' }}>N3 & NEO X MAINNET READY</span>
              </div>
              <h1 className="hero-title" style={{ fontSize: 'clamp(4rem, 8vw, 7rem)', letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: '2rem' }}>
                The Trustless <br />
                <span className="text-neo-gradient">Privacy Oracle</span>
              </h1>
              <p className="hero-subtitle" style={{ maxWidth: '700px', margin: '0 auto 3rem', fontSize: '1.25rem', color: 'var(--text-dim)', lineHeight: 1.6 }}>
                A decentralized hardware-enclave matrix for confidential compute and high-integrity datafeeds. Bridge off-chain truth with on-chain execution with zero data leakage.
              </p>
              <div className="hero-actions" style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center' }}>
                <Link href="/explorer" className="btn btn-primary" style={{ padding: '1.25rem 3rem', fontSize: '1.1rem' }}>
                  Launch App <ArrowRight size={20} />
                </Link>
                <a href="https://github.com/r3e-network/neo-morpheus-oracle" target="_blank" className="btn btn-secondary" style={{ padding: '1.25rem 3rem', fontSize: '1.1rem' }}>
                  View Github
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES SECTION */}
        <section className="container" style={{ padding: '8rem 0', position: 'relative', zIndex: 2 }}>
          <div style={{ textAlign: 'center', marginBottom: '5rem' }}>
            <h2 className="text-gradient" style={{ fontSize: '3rem', fontWeight: 900, letterSpacing: '-0.03em' }}>Enterprise Infrastructure</h2>
            <p style={{ color: 'var(--text-dim)', fontSize: '1.1rem', marginTop: '1rem' }}>Engineered for DeFi, Gaming, and Institutional privacy requirements.</p>
          </div>
          
          <div className="grid grid-3" style={{ gap: '3rem' }}>
            <div className="glass-card fade-in stagger-2" style={{ padding: '3.5rem 2.5rem', borderTop: '2px solid var(--neo-green)' }}>
              <div style={{ background: 'rgba(0, 255, 163, 0.05)', width: '64px', height: '64px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '2rem', border: '1px solid var(--border-neo)' }}>
                <Lock className="text-neo" size={28} />
              </div>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '1.25rem', color: '#fff' }}>Hardware Privacy</h3>
              <p style={{ color: 'var(--text-dim)', fontSize: '1rem', lineHeight: 1.7 }}>Powered by Intel SGX. Cryptographic guarantees ensure your API keys and confidential data are never visible to node operators.</p>
            </div>
            <div className="glass-card fade-in stagger-3" style={{ padding: '3.5rem 2.5rem', borderTop: '2px solid var(--neo-purple)' }}>
              <div style={{ background: 'rgba(139, 92, 246, 0.05)', width: '64px', height: '64px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '2rem', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
                <Cpu className="text-purple" size={28} />
              </div>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '1.25rem', color: '#fff' }}>Verifiable Compute</h3>
              <p style={{ color: 'var(--text-dim)', fontSize: '1rem', lineHeight: 1.7 }}>Execute complex JavaScript or WebAssembly logic on private datasets off-chain, and submit the cryptographically signed result on-chain.</p>
            </div>
            <div className="glass-card fade-in stagger-4" style={{ padding: '3.5rem 2.5rem', borderTop: '2px solid var(--neo-blue)' }}>
              <div style={{ background: 'rgba(59, 130, 246, 0.05)', width: '64px', height: '64px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '2rem', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                <Zap className="text-neo-gradient" size={28} />
              </div>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '1.25rem', color: '#fff' }}>Neo Native</h3>
              <p style={{ color: 'var(--text-dim)', fontSize: '1rem', lineHeight: 1.7 }}>First-class bridging. Seamlessly integrate with Neo N3 (C#) and Neo X (Solidity) with ultra-low latency callbacks.</p>
            </div>
          </div>
        </section>

        {/* CTA SECTION */}
        <section className="container" style={{ padding: '6rem 0 10rem', textAlign: 'center' }}>
          <div className="glass-card neo-card fade-in" style={{ padding: '5rem', background: 'radial-gradient(circle at center, rgba(0, 255, 163, 0.05) 0%, transparent 80%)' }}>
            <h2 style={{ fontSize: '3rem', fontWeight: 900, marginBottom: '1.5rem', color: '#fff' }}>Ready to Build?</h2>
            <p style={{ color: 'var(--text-dim)', fontSize: '1.25rem', marginBottom: '3rem', maxWidth: '600px', margin: '0 auto 3rem' }}>
              Explore the live network state, test privacy functions in the sandbox, and integrate the oracle into your dApp today.
            </p>
            <Link href="/explorer" className="btn btn-primary" style={{ padding: '1.25rem 4rem', fontSize: '1.25rem' }}>
              Enter the Matrix
            </Link>
          </div>
        </section>
      </main>

      <footer className="footer" style={{ borderTop: '1px solid var(--border-subtle)', background: 'rgba(0,0,0,0.5)', padding: '4rem 0 2rem' }}>
        <div className="container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '2rem' }}>
            <div className="nav-logo" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ background: 'var(--text-dim)', borderRadius: '4px', padding: '2px' }}>
                <Layers size={16} color="#000" />
              </div>
              <span style={{ fontSize: '1rem', letterSpacing: '0.1em', fontWeight: 800, color: 'var(--text-dim)' }}>MORPHEUS</span>
            </div>
            <div style={{ display: 'flex', gap: '3rem' }}>
              <Link href="/docs" style={{ color: 'var(--text-dim)', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 600 }}>Documentation</Link>
              <a href="https://github.com/r3e-network/neo-morpheus-oracle" style={{ color: 'var(--text-dim)', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 600 }}>GitHub</a>
            </div>
          </div>
          <div style={{ marginTop: '3rem', paddingTop: '2rem', borderTop: '1px solid rgba(255,255,255,0.03)', display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            <span>&copy; {new Date().getFullYear()} Neo Morpheus Network. Open Source Infrastructure.</span>
            <span>Powered by Phala TEE & Neo Global Development.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
