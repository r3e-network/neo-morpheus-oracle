import Link from "next/link";
import { ReactNode } from "react";
import { Book, Layers, Shield, Cpu, LineChart, CheckCircle } from "lucide-react";

export default function DocsLayout({ children }: { children: ReactNode }) {
  const navItems = [
    { href: "/docs", label: "Introduction", icon: Book },
    { href: "/docs/architecture", label: "Architecture", icon: Layers },
    { href: "/docs/oracle", label: "Privacy Oracle", icon: Shield },
    { href: "/docs/compute", label: "Privacy Compute", icon: Cpu },
    { href: "/docs/datafeeds", label: "Data Feeds", icon: LineChart },
    { href: "/docs/verifier", label: "Attestation & Security", icon: CheckCircle },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-bg-color">
      <nav className="navbar" style={{ position: 'sticky', top: 0, zIndex: 100, borderBottom: '1px solid var(--border-subtle)' }}>
        <Link href="/" className="nav-logo">
          <img src="/logo-morpheus.png" alt="Neo Morpheus Oracle" style={{ height: '36px', width: 'auto' }} />
          <span className="text-gradient">Morpheus Docs</span>
        </Link>
        <div className="nav-links">
          <Link href="/" className="btn btn-ghost btn-sm">Back to App</Link>
          <a
            href="https://github.com/r3e-network/neo-morpheus-oracle"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary btn-sm"
          >
            GitHub
          </a>
        </div>
      </nav>

      <div className="container flex-1" style={{ display: 'flex', alignItems: 'flex-start', padding: '0', maxWidth: '1400px', margin: '0 auto' }}>
        {/* Docs Sidebar */}
        <aside className="docs-sidebar" style={{
          width: '280px',
          flexShrink: 0,
          position: 'sticky',
          top: '80px',
          height: 'calc(100vh - 80px)',
          overflowY: 'auto',
          borderRight: '1px solid var(--border-subtle)',
          padding: '2rem 1.5rem',
        }}>
          <div style={{ marginBottom: '2rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Documentation
            </span>
          </div>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="docs-nav-link"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 16px',
                    borderRadius: '12px',
                    color: 'var(--text-secondary)',
                    fontWeight: 600,
                    fontSize: '0.95rem',
                    transition: 'all 0.2s',
                  }}
                >
                  <Icon size={18} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="docs-content fade-in" style={{ flex: 1, padding: '3rem 4rem', minWidth: 0 }}>
          <div style={{ maxWidth: '840px', margin: '0 auto' }}>
            {children}
          </div>
        </main>
      </div>
      
      <style>{`
        .docs-nav-link:hover {
          background: var(--bg-surface);
          color: var(--text-primary) !important;
        }
        /* A simple active state could be handled dynamically via usePathname if it were a client component, 
           but since layout is generic, we'll keep it simple or implement client-side highlighting */
        .docs-content h1 { font-size: 2.8rem; margin-bottom: 1.5rem; color: #fff; }
        .docs-content h2 { font-size: 2rem; margin-top: 2.5rem; margin-bottom: 1rem; color: #fff; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.5rem; }
        .docs-content h3 { font-size: 1.5rem; margin-top: 2rem; margin-bottom: 1rem; color: var(--text-primary); }
        .docs-content p { font-size: 1.05rem; color: var(--text-secondary); line-height: 1.7; margin-bottom: 1.5rem; }
        .docs-content ul, .docs-content ol { color: var(--text-secondary); margin-bottom: 1.5rem; padding-left: 1.5rem; font-size: 1.05rem; line-height: 1.7; }
        .docs-content li { margin-bottom: 0.5rem; }
        .docs-content code { background: rgba(255,255,255,0.1); padding: 0.2rem 0.4rem; border-radius: 6px; font-family: 'JetBrains Mono', monospace; font-size: 0.9em; color: var(--neo-green); }
        .docs-content pre { background: #000; border: 1px solid var(--border-highlight); padding: 1.5rem; border-radius: 12px; overflow-x: auto; margin-bottom: 1.5rem; }
        .docs-content pre code { background: transparent; padding: 0; color: #a3e635; }
        .docs-content blockquote { border-left: 4px solid var(--neo-purple); padding-left: 1.5rem; margin-bottom: 1.5rem; color: var(--text-muted); font-style: italic; }
      `}</style>
    </div>
  );
}
