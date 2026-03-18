'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Web3AuthLiveStudio } from '@/components/neodid/Web3AuthLiveStudio';

export default function NeoDidWeb3AuthLivePage() {
  return (
    <div className="min-h-screen bg-main flex flex-col">
      <nav className="navbar" style={{ position: 'sticky' }}>
        <Link
          href="/launchpad"
          className="nav-logo"
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <ArrowLeft size={18} />
          <span className="text-gradient" style={{ letterSpacing: '0.1em' }}>
            MORPHEUS{' '}
            <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>
              | NeoDID Web3Auth Live
            </span>
          </span>
        </Link>
        <div className="nav-links">
          <Link href="/docs/neodid" className="nav-link">
            NeoDID Docs
          </Link>
          <Link href="/launchpad/neodid-resolver" className="nav-link">
            Resolver
          </Link>
          <Link href="/verifier" className="nav-link">
            Verifier
          </Link>
        </div>
      </nav>
      <main className="container" style={{ flex: 1, padding: '2rem 0' }}>
        <Web3AuthLiveStudio />
      </main>
    </div>
  );
}
