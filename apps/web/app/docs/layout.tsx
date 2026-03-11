"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useState } from "react";
import { 
  Book, Layers, Shield, Cpu, LineChart, CheckCircle, 
  Search, Github, Menu, X, Boxes, ChevronRight, ArrowLeft,
  Code2, HelpCircle, Zap, ClipboardList
} from "lucide-react";

export default function DocsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const sections = [
    {
      title: "Fundamentals",
      items: [
        { href: "/docs", label: "Introduction", icon: Book },
        { href: "/docs/architecture", label: "Architecture", icon: Layers },
      ]
    },
    {
      title: "Guides",
      items: [
        { href: "/docs/quickstart", label: "Quickstart", icon: Zap },
        { href: "/docs/oracle", label: "Privacy Oracle", icon: Shield },
        { href: "/docs/compute", label: "Enclave Compute", icon: Cpu },
        { href: "/docs/datafeeds", label: "Data Matrix", icon: LineChart },
        { href: "/docs/r/USER_GUIDE", label: "User Guide", icon: Book },
      ]
    },
    {
      title: "Reference",
      items: [
        { href: "/docs/networks", label: "Networks & Contracts", icon: Layers },
        { href: "/docs/api-reference", label: "API Reference", icon: Code2 },
        { href: "/docs/verifier", label: "Attestation Spec", icon: CheckCircle },
        { href: "/docs/faq", label: "FAQ & Troubleshooting", icon: HelpCircle },
      ]
    },
    {
      title: "Extended Documentation",
      items: [
        { href: "/docs/r/EXAMPLES", label: "Examples Portfolio", icon: Code2 },
        { href: "/docs/r/BUILTIN_COMPUTE", label: "Built-in Compute", icon: Cpu },
        { href: "/docs/r/PROVIDERS", label: "Supported Providers", icon: Boxes },
        { href: "/docs/r/DEPLOYMENT", label: "Deployment Node", icon: Boxes },
        { href: "/docs/r/ENVIRONMENT", label: "Environment Setup", icon: Zap },
        { href: "/docs/r/TESTING_LEDGER", label: "Testing Ledger", icon: ClipboardList },
        { href: "/docs/r/ASYNC_PRIVACY_ORACLE_SPEC", label: "Async Privacy Spec", icon: Shield },
        { href: "/docs/r/SECURITY_AUDIT", label: "Security Audit", icon: Shield },
      ]
    }
  ];

  return (
    <div className="min-h-screen flex flex-col bg-main relative">
      <div className="bg-grid"></div>
      
      {/* Top Navigation */}
      <nav className="navbar" style={{ position: 'sticky', top: 0, zIndex: 1000, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(20px)' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none' }}>
          <div style={{ background: '#fff', width: '28px', height: '28px', borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Boxes size={18} color="#000" strokeWidth={2.5} />
          </div>
          <span style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem', letterSpacing: '0.1em' }}>MORPHEUS <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>| DOCS</span></span>
        </Link>
        
        <div className="nav-links hide-mobile">
          <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-dim)', borderRadius: '4px', padding: '0.4rem 0.8rem', gap: '8px', cursor: 'pointer', transition: 'border-color 0.2s', marginRight: '1rem' }} className="hover-search">
            <Search size={14} color="var(--text-muted)" />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Search documentation...</span>
            <span style={{ marginLeft: '1.5rem', padding: '0.15rem 0.35rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-dim)', borderRadius: '2px', fontSize: '0.65rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>⌘K</span>
          </div>
          <Link href="/explorer" className="nav-link">Network Explorer</Link>
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
          width: '280px',
          flexShrink: 0,
          position: 'sticky',
          top: '72px',
          height: 'calc(100vh - 72px)',
          overflowY: 'auto',
          borderRight: '1px solid var(--border-dim)',
          padding: '2.5rem 1.5rem',
          background: 'var(--bg-main)',
          zIndex: 900,
        }}>
          {sections.map((section, idx) => (
            <div key={idx} style={{ marginBottom: '2.5rem' }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.15em', fontFamily: 'var(--font-mono)', paddingLeft: '1rem', display: 'block', marginBottom: '1rem' }}>
                {section.title}
              </span>
              <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                {section.items.map((item) => {
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
                        gap: '10px',
                        padding: '0.65rem 1rem',
                        borderRadius: '4px',
                        color: isActive ? 'var(--neo-green)' : 'var(--text-secondary)',
                        background: isActive ? 'rgba(255, 255, 255, 0.03)' : 'transparent',
                        fontWeight: isActive ? 700 : 500,
                        fontSize: '0.85rem',
                        transition: 'all 0.2s',
                        textDecoration: 'none',
                        borderLeft: isActive ? '2px solid var(--neo-green)' : '2px solid transparent',
                      }}
                    >
                      <Icon size={14} color={isActive ? 'var(--neo-green)' : 'currentColor'} />
                      <span style={{ flex: 1 }}>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          ))}

          <div style={{ marginTop: '2rem', padding: '1.25rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-dim)', borderRadius: '4px' }}>
            <h4 style={{ fontSize: '0.65rem', fontWeight: 800, marginBottom: '0.5rem', color: '#fff', textTransform: 'uppercase' }}>Resources</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <a href="https://github.com/r3e-network/neo-morpheus-oracle" target="_blank" style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }} className="hover-link"><Github size={12} /> Source Code</a>
              <a href="https://github.com/r3e-network/neo-morpheus-oracle/issues" target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }} className="hover-link"><HelpCircle size={12} /> Support</a>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="docs-content fade-up" style={{ flex: 1, padding: '4rem 6rem', minWidth: 0 }}>
          <div style={{ maxWidth: '840px' }}>
            {children}
            
            {/* Next/Prev Navigation */}
            {(() => {
              const flatItems = sections.flatMap(s => s.items);
              const currentIndex = flatItems.findIndex(i => i.href === pathname);
              const prevItem = currentIndex > 0 ? flatItems[currentIndex - 1] : null;
              const nextItem = currentIndex !== -1 && currentIndex < flatItems.length - 1 ? flatItems[currentIndex + 1] : null;

              if (!prevItem && !nextItem) return null;

              return (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginTop: '4rem' }}>
                  {prevItem ? (
                    <Link href={prevItem.href} className="card-industrial" style={{ padding: '1.5rem', textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', transition: 'border-color 0.2s' }} onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--neo-green)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-dim)'}>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>Previous</span>
                      <span style={{ fontSize: '1rem', color: '#fff', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <ArrowLeft size={16} color="var(--neo-green)" /> {prevItem.label}
                      </span>
                    </Link>
                  ) : <div></div>}
                  
                  {nextItem ? (
                    <Link href={nextItem.href} className="card-industrial" style={{ padding: '1.5rem', textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', transition: 'border-color 0.2s' }} onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--neo-green)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-dim)'}>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>Next</span>
                      <span style={{ fontSize: '1rem', color: '#fff', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {nextItem.label} <ChevronRight size={16} color="var(--neo-green)" />
                      </span>
                    </Link>
                  ) : <div></div>}
                </div>
              );
            })()}

            {/* Footer Navigation */}
            <div style={{ marginTop: '4rem', paddingTop: '3rem', borderTop: '1px solid var(--border-dim)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 800, letterSpacing: '0.1em' }}>REVISION 1.0.2</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>LAST UPDATED: 2026-03-11</span>
              </div>
              <div>
                <a href="https://github.com/r3e-network/neo-morpheus-oracle" target="_blank" className="btn btn-secondary btn-sm" style={{ fontSize: '0.7rem' }}>
                  <Github size={14} /> EDIT ON GITHUB
                </a>
              </div>
            </div>
          </div>
        </main>
      </div>
      
      <style>{`
        .docs-content h1 { font-size: clamp(2.5rem, 5vw, 3.25rem); font-weight: 900; margin-bottom: 2rem; color: #fff; letter-spacing: -0.04em; line-height: 1.1; }
        .docs-content h2 { font-size: 1.5rem; font-weight: 800; margin-top: 5rem; margin-bottom: 1.5rem; color: #fff; border-bottom: 1px solid var(--border-dim); padding-bottom: 0.75rem; letter-spacing: -0.02em; text-transform: uppercase; }
        .docs-content h3 { font-size: 1.15rem; font-weight: 700; margin-top: 3rem; margin-bottom: 1rem; color: #fff; }
        .docs-content p { font-size: 1rem; color: var(--text-secondary); line-height: 1.8; margin-bottom: 1.5rem; }
        .docs-content ul, .docs-content ol { color: var(--text-secondary); margin-bottom: 2.5rem; padding-left: 1.25rem; font-size: 1rem; line-height: 1.8; }
        .docs-content li { margin-bottom: 0.75rem; }
        .docs-content li::marker { color: var(--neo-green); }
        .docs-content p code, .docs-content li code { background: rgba(0,255,163,0.05); padding: 0.2rem 0.35rem; border-radius: 4px; font-family: var(--font-mono); font-size: 0.85em; color: var(--neo-green); border: 1px solid rgba(0,255,163,0.2); }
        .docs-content pre code { background: transparent; padding: 0; border: none; font-size: 0.8rem; line-height: 1.6; }
        .docs-content blockquote { border-left: 2px solid var(--neo-green); background: rgba(0, 255, 163, 0.01); padding: 1.25rem 1.5rem; margin: 2.5rem 0; color: var(--text-secondary); font-size: 0.95rem; }
        .docs-content strong { color: #fff; font-weight: 700; }
        
        .docs-sidebar::-webkit-scrollbar { width: 3px; }
        .docs-sidebar::-webkit-scrollbar-thumb { background: var(--border-dim); }
        
        .hover-link:hover { color: var(--neo-green) !important; }
        
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
