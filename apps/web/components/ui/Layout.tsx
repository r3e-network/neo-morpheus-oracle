'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Boxes, Github, Menu, X, Wifi, WifiOff } from 'lucide-react';
import { useState, useEffect } from 'react';
import { getSelectedNetworkKey } from '@/lib/networks';
import { NetworkSelector } from './NetworkSelector';

type NavItem = {
  label: string;
  href: string;
  external?: boolean;
};

const mainNavItems: NavItem[] = [
  { label: 'Explorer', href: '/explorer' },
  { label: 'Launchpad', href: '/launchpad' },
  { label: 'Feed Status', href: '/docs/feed-status' },
  { label: 'Docs', href: '/docs' },
  { label: 'Status', href: '/status' },
];

type LayoutProps = {
  children: React.ReactNode;
  showNav?: boolean;
  showFooter?: boolean;
  navbarContent?: React.ReactNode;
  navbarRight?: React.ReactNode;
};

export function Layout({
  children,
  showNav = true,
  showFooter = true,
  navbarContent,
  navbarRight,
}: LayoutProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [networkStatus, setNetworkStatus] = useState<'online' | 'offline'>('online');

  useEffect(() => {
    const handleOnline = () => setNetworkStatus('online');
    const handleOffline = () => setNetworkStatus('offline');
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col relative">
      <div className="bg-grid" />
      <div className="bg-glow-top" />

      {showNav && (
        <nav className="navbar">
          <Link
            href="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              textDecoration: 'none',
            }}
          >
            <div
              style={{
                background: '#fff',
                width: '32px',
                height: '32px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Boxes size={20} color="#000" strokeWidth={2.5} />
            </div>
            <div>
              <span
                style={{
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: '1rem',
                  letterSpacing: '0.1em',
                }}
              >
                MORPHEUS
              </span>
              <span
                style={{
                  color: 'var(--text-muted)',
                  fontSize: '0.65rem',
                  fontFamily: 'var(--font-mono)',
                  marginLeft: '8px',
                }}
              >
                {getSelectedNetworkKey().toUpperCase()}
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="nav-links" style={{ display: 'flex' }}>
            {mainNavItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="nav-link"
                  style={{
                    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                    borderBottom: isActive ? '2px solid var(--neo-green)' : '2px solid transparent',
                    paddingBottom: '4px',
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
            <a
              href="https://github.com/r3e-network/neo-morpheus-oracle"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '0.5rem 1rem',
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-highlight)',
                borderRadius: '4px',
                fontSize: '0.75rem',
                fontWeight: 700,
                textDecoration: 'none',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--text-primary)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-highlight)';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
            >
              <Github size={14} /> GitHub
            </a>
            <NetworkSelector />
            {navbarRight && navbarRight}
          </div>

          {/* Mobile menu button */}
          <button
            className="mobile-menu-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            style={{
              display: 'none',
              background: 'none',
              border: 'none',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              padding: '8px',
            }}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>

          {navbarContent && <div className="navbar-content">{navbarContent}</div>}
        </nav>
      )}

      {/* Mobile Navigation */}
      {showNav && mobileMenuOpen && (
        <div
          className="mobile-nav"
          style={{
            position: 'fixed',
            top: '72px',
            left: 0,
            right: 0,
            background: 'var(--bg-nav)',
            backdropFilter: 'blur(12px)',
            borderBottom: '1px solid var(--border-dim)',
            padding: '1rem',
            zIndex: 999,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {mainNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="nav-link"
                onClick={() => setMobileMenuOpen(false)}
                style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '4px',
                  background: pathname === item.href ? 'var(--neo-green-dim)' : 'transparent',
                }}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      <main style={{ flex: 1, zIndex: 1 }}>{children}</main>

      {showFooter && (
        <footer
          style={{
            padding: '40px 0',
            borderTop: '1px solid var(--border-dim)',
            background: '#000',
            marginTop: 'auto',
          }}
        >
          <div className="container">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '2rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Boxes size={18} color="var(--text-muted)" />
                <span
                  style={{
                    color: 'var(--text-muted)',
                    fontWeight: 800,
                    fontSize: '0.9rem',
                    letterSpacing: '0.1em',
                  }}
                >
                  MORPHEUS
                </span>
              </div>
              <div
                style={{
                  color: 'var(--text-muted)',
                  fontSize: '0.75rem',
                  fontFamily: 'var(--font-mono)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                {networkStatus === 'online' ? (
                  <Wifi size={12} color="var(--neo-green)" />
                ) : (
                  <WifiOff size={12} color="#ef4444" />
                )}
                © {new Date().getFullYear()} Neo Morpheus Network. Privacy-preserving oracle
                infrastructure.
              </div>
            </div>
          </div>
        </footer>
      )}

      <style jsx>{`
        @media (max-width: 768px) {
          .nav-links {
            display: none !important;
          }
          .mobile-menu-btn {
            display: block !important;
          }
        }
      `}</style>
    </div>
  );
}
