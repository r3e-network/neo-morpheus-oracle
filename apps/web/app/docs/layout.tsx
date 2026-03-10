"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useState } from "react";
import { 
  Book, Layers, Shield, Cpu, LineChart, CheckCircle, 
  Search, Github, ArrowLeft, Menu, X, Boxes, ChevronRight
} from "lucide-react";

export default function DocsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const navItems = [
    { href: "/docs", label: "Introduction", icon: Book },
    { href: "/docs/quickstart", label: "Quickstart", icon: Zap },
    { href: "/docs/architecture", label: "Architecture", icon: Layers },
    { href: "/docs/oracle", label: "Privacy Oracle", icon: Shield },
    { href: "/docs/compute", label: "Enclave Compute", icon: Cpu },
    { href: "/docs/datafeeds", label: "Data Matrix", icon: LineChart },
    { href: "/docs/api-reference", label: "API Reference", icon: Code2 },
    { href: "/docs/verifier", label: "Attestation", icon: CheckCircle },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-main relative">
      <div className="bg-grid"></div>
      
      {/* Top Navigation */}
      <nav className="navbar" style={{ position: 'sticky', top: 0, zIndex: 1000 }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none' }}>
          <div style={{ background: '#fff', width: '28px', height: '28px', borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Boxes size={18} color="#000" strokeWidth={2.5} />
          </div>
          <span style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem', letterSpacing: '0.1em' }}>MORPHEUS <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>| DOCS</span></span>
        </Link>
        
        <div className="nav-links hide-mobile">
          <div style={{ position: 'relative', marginRight: '1rem' }}>
            <input 
              type="text" 
              placeholder="Search docs..." 
              className="neo-input" 
              style={{ width: '240px', padding: '0.4rem 1rem 0.4rem 2.2rem', fontSize: '0.8rem' }} 
            />
            <Search size={14} style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          </div>
          <Link href="/explorer" className="nav-link">Matrix Explorer</Link>
          <a href="https://github.com/r3e-network/neo-morpheus-oracle" target="_blank" className="nav-link">
            <Github size={16} />
          </a>
        </div>

        <button className="show-mobile btn btn-secondary btn-sm" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
          {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </nav>

      <div className="container flex-1" style={{ display: 'flex', alignItems: 'flex-start', padding: '0', maxWidth: '1440px', margin: '0 auto' }}>
        {/* Docs Sidebar */}
        <aside className={`docs-sidebar ${isSidebarOpen ? 'open' : ''}`} style={{
          width: '300px',
          flexShrink: 0,
          position: 'sticky',
          top: '72px',
          height: 'calc(100vh - 72px)',
          overflowY: 'auto',
          borderRight: '1px solid var(--border-dim)',
          padding: '3rem 2rem',
          background: 'var(--bg-main)',
          zIndex: 900,
        }}>
          <div style={{ marginBottom: '2.5rem' }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.15em', fontFamily: 'var(--font-mono)' }}>
              Protocol Guide
            </span>
          </div>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsSidebarOpen(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '0.75rem 1rem',
                    borderRadius: '2px',
                    color: isActive ? 'var(--neo-green)' : 'var(--text-secondary)',
                    background: isActive ? 'rgba(0, 255, 163, 0.03)' : 'transparent',
                    borderLeft: isActive ? '2px solid var(--neo-green)' : '2px solid transparent',
                    fontWeight: isActive ? 700 : 500,
                    fontSize: '0.85rem',
                    transition: 'all 0.2s',
                    textDecoration: 'none',
                  }}
                >
                  <Icon size={16} />
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {isActive && <ChevronRight size={14} />}
                </Link>
              );
            })}
          </nav>

          <div style={{ marginTop: '4rem', padding: '1.5rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-dim)', borderRadius: '4px' }}>
            <h4 style={{ fontSize: '0.7rem', fontWeight: 800, marginBottom: '0.75rem', color: '#fff', textTransform: 'uppercase' }}>Need help?</h4>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '1rem' }}>
              Join our developer community on Discord for real-time support.
            </p>
            <a href="#" className="btn btn-secondary btn-sm" style={{ width: '100%', fontSize: '0.7rem' }}>DISCORD COMMUNITY</a>
          </div>
        </aside>

        {/* Main Content */}
        <main className="docs-content fade-in" style={{ flex: 1, padding: '4rem 5rem', minWidth: 0 }}>
          <div style={{ maxWidth: '800px' }}>
            {children}
            
            {/* Navigation Footer */}
            <div style={{ marginTop: '6rem', paddingTop: '3rem', borderTop: '1px solid var(--border-dim)', display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 800 }}>LAST UPDATED</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>MARCH 10, 2026</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <a href="https://github.com/r3e-network/neo-morpheus-oracle/issues" target="_blank" style={{ fontSize: '0.8rem', color: 'var(--neo-green)', textDecoration: 'none', fontWeight: 600 }}>Edit this page on GitHub</a>
              </div>
            </div>
          </div>
        </main>
      </div>
      
      <style>{`
        .docs-content h1 { font-size: clamp(2.5rem, 5vw, 3.5rem); font-weight: 900; margin-bottom: 2rem; color: #fff; letter-spacing: -0.04em; line-height: 1.1; }
        .docs-content h2 { font-size: 1.75rem; font-weight: 800; margin-top: 4rem; margin-bottom: 1.5rem; color: #fff; border-bottom: 1px solid var(--border-dim); padding-bottom: 0.75rem; letter-spacing: -0.02em; }
        .docs-content h3 { font-size: 1.25rem; font-weight: 700; margin-top: 2.5rem; margin-bottom: 1rem; color: #fff; }
        .docs-content p { font-size: 1rem; color: var(--text-secondary); line-height: 1.8; margin-bottom: 1.5rem; }
        .docs-content ul, .docs-content ol { color: var(--text-secondary); margin-bottom: 2rem; padding-left: 1.5rem; font-size: 1rem; line-height: 1.8; }
        .docs-content li { margin-bottom: 0.75rem; position: relative; }
        .docs-content li::marker { color: var(--neo-green); }
        .docs-content code { background: #111; padding: 0.2rem 0.4rem; border-radius: 4px; font-family: var(--font-mono); font-size: 0.9em; color: var(--neo-green); border: 1px solid var(--border-dim); }
        .docs-content pre { background: #000; border: 1px solid var(--border-dim); padding: 1.5rem; border-radius: 4px; overflow-x: auto; margin: 2rem 0; position: relative; }
        .docs-content pre::before { content: 'CODE'; position: absolute; top: 0; right: 1rem; font-size: 0.6rem; color: var(--text-muted); font-family: var(--font-mono); font-weight: 800; padding: 0.5rem 0; }
        .docs-content pre code { background: transparent; padding: 0; color: #fff; border: none; font-size: 0.85rem; line-height: 1.6; }
        .docs-content blockquote { border-left: 2px solid var(--neo-green); background: rgba(0, 255, 163, 0.02); padding: 1.5rem; margin: 2rem 0; color: var(--text-secondary); }
        .docs-content strong { color: #fff; font-weight: 700; }
        
        .docs-sidebar.open { transform: translateX(0); }
        
        @media (max-width: 1024px) {
          .docs-sidebar {
            position: fixed;
            left: 0;
            top: 72px;
            bottom: 0;
            transform: translateX(-100%);
            transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            background: #000;
            box-shadow: 20px 0 50px rgba(0,0,0,0.5);
          }
          .docs-content { padding: 2rem !important; }
          .hide-mobile { display: none; }
        }
        @media (min-width: 1025px) {
          .show-mobile { display: none; }
        }
      `}</style>
    </div>
  );
}
