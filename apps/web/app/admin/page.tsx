"use client";

import { useState } from "react";
import Link from "next/link";
import { ProviderConfigPanel } from "../../components/provider-config-panel";
import { RelayerOpsPanel } from "../../components/relayer-ops-panel";

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState("providers");

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="navbar">
        <Link href="/" className="nav-logo">
          <img src="/logo-morpheus.png" alt="Neo Morpheus Oracle" style={{ height: '36px', width: 'auto' }} />
          <span className="text-gradient">Morpheus Admin</span>
        </Link>
        <div className="nav-links">
          <Link href="/" className="btn btn-ghost btn-sm">Exit Admin</Link>
        </div>
      </nav>

      <main className="container" style={{ paddingTop: '60px', paddingBottom: '120px' }}>
        <div className="dashboard-intro">
          <span className="hero-badge" style={{ background: 'var(--warning-bg)', color: 'var(--warning)', borderColor: 'var(--warning)' }}>Restricted Access</span>
          <h1 className="text-5xl" style={{ marginBottom: '1.5rem' }}>Network <span className="text-gradient-purple">Operations</span></h1>
          <p className="dashboard-subtitle">
            Manage provider configurations, monitor relayer health, and handle dead-letter queues. 
            Authorized personnel only.
          </p>
        </div>

        <div className="dashboard-layout fade-in">
          <aside className="sidebar">
            <nav className="sidebar-nav">
              <button
                className={`sidebar-tab ${activeTab === 'providers' ? 'active' : ''}`}
                onClick={() => setActiveTab('providers')}
              >
                <span className="sidebar-tab-icon">🔌</span>
                Provider Configs
              </button>
              <button
                className={`sidebar-tab ${activeTab === 'relayer' ? 'active' : ''}`}
                onClick={() => setActiveTab('relayer')}
              >
                <span className="sidebar-tab-icon">🛰️</span>
                Relayer Ops
              </button>
            </nav>

            <div className="card" style={{ padding: '1.5rem', marginTop: '1rem', borderLeft: '3px solid var(--warning)' }}>
              <h4 className="text-sm font-bold uppercase mb-2">Security Note</h4>
              <p className="text-xs text-muted leading-relaxed">
                Changes here affect live network nodes and relayer services. 
                Ensure API keys are kept secure.
              </p>
            </div>
          </aside>

          <div style={{ flex: 1, minWidth: 0 }}>
            {activeTab === "providers" ? (
              <div className="fade-in">
                <ProviderConfigPanel />
              </div>
            ) : (
              <div className="fade-in">
                <RelayerOpsPanel />
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="footer">
        <div className="container footer-grid">
          <p className="footer-copy">© {new Date().getFullYear()} Neo Morpheus Oracle Admin Console.</p>
        </div>
      </footer>
    </div>
  );
}
