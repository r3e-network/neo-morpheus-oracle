'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import {
  Globe,
  Cpu,
  Terminal,
  Copy,
  Trash2,
  CheckCircle2,
  Database,
  ChevronRight,
  BookOpen,
  Box,
} from 'lucide-react';

const TabFallback = () => (
  <div
    className="card-industrial"
    style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '420px',
    }}
  >
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
      <div className="status-dot" style={{ transform: 'scale(1.6)' }}></div>
      <p
        style={{
          color: 'var(--text-secondary)',
          fontSize: '0.8rem',
          fontWeight: 600,
          fontFamily: 'var(--font-mono)',
          letterSpacing: 0,
        }}
      >
        LOADING MODULE...
      </p>
    </div>
  </div>
);

const OverviewTab = dynamic(
  () => import('./dashboard/OverviewTab').then((mod) => mod.OverviewTab),
  {
    loading: () => <TabFallback />,
  }
);
const OracleTab = dynamic(() => import('./dashboard/OracleTab').then((mod) => mod.OracleTab), {
  loading: () => <TabFallback />,
});
const ComputeTab = dynamic(() => import('./dashboard/ComputeTab').then((mod) => mod.ComputeTab), {
  loading: () => <TabFallback />,
});
const ProvidersTab = dynamic(
  () => import('./dashboard/ProvidersTab').then((mod) => mod.ProvidersTab),
  { loading: () => <TabFallback /> }
);
const DeveloperHub = dynamic(
  () => import('./dashboard/DeveloperHub').then((mod) => mod.DeveloperHub),
  { loading: () => <TabFallback /> }
);
const StarterStudio = dynamic(
  () => import('./starter/StarterStudio').then((mod) => mod.StarterStudio),
  {
    loading: () => <TabFallback />,
  }
);

export function Dashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [output, setOutput] = useState<string>('');
  const [providers, setProviders] = useState<any[]>([]);
  const [isProvidersLoading, setIsProvidersLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!['providers', 'oracle'].includes(activeTab) || providers.length > 0) {
      return;
    }

    let cancelled = false;
    (async () => {
      setIsProvidersLoading(true);
      try {
        const providersRes = await fetch('/api/providers');
        const providersBody = await providersRes.json();
        if (!cancelled && Array.isArray(providersBody.providers)) {
          setProviders(providersBody.providers);
        }
      } catch (err) {
        console.error('Failed to fetch initial data', err);
      } finally {
        if (!cancelled) {
          setIsProvidersLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTab, providers.length]);

  const handleCopy = () => {
    if (!output) return;
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const tabs = [
    { id: 'overview', label: 'Network Monitor', icon: Globe },
    { id: 'providers', label: 'Data Catalog', icon: Database },
    { id: 'oracle', label: 'Oracle Payload', icon: Box },
    { id: 'compute', label: 'Enclave Sandbox', icon: Cpu },
    { id: 'studio', label: 'Starter Studio', icon: Box },
    { id: 'devhub', label: 'Developer Hub', icon: BookOpen },
  ];

  return (
    <div className="grid fade-in dashboard-grid">
      <aside className="dashboard-sidebar">
        <div
          className="stagger-1"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
            marginBottom: '2.5rem',
          }}
        >
          {tabs.map((Tab) => (
            <button
              key={Tab.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '0.85rem 1rem',
                background: activeTab === Tab.id ? 'rgba(255,255,255,0.05)' : 'transparent',
                border: '1px solid',
                borderColor: activeTab === Tab.id ? 'var(--border-highlight)' : 'transparent',
                borderRadius: '4px',
                color: activeTab === Tab.id ? '#fff' : 'var(--text-secondary)',
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s',
              }}
              onClick={() => {
                setActiveTab(Tab.id);
                setOutput('');
              }}
            >
              <Tab.icon
                size={16}
                color={activeTab === Tab.id ? 'var(--neo-green)' : 'currentColor'}
              />
              <span style={{ flex: 1, fontSize: '0.9rem' }}>{Tab.label}</span>
              {activeTab === Tab.id && <ChevronRight size={14} />}
            </button>
          ))}
        </div>

        <div
          className="stagger-3"
          style={{
            background: '#000',
            border: '1px solid var(--border-dim)',
            borderRadius: '4px',
            marginTop: '2rem',
          }}
        >
          <div
            style={{
              background: 'var(--bg-panel)',
              padding: '0.75rem 1rem',
              borderBottom: '1px solid var(--border-dim)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Terminal size={12} color="var(--neo-green)" />
              <span
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  letterSpacing: 0,
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                PROCESS_LOGS
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleCopy}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                {copied ? <CheckCircle2 size={12} color="var(--neo-green)" /> : <Copy size={12} />}
              </button>
              <button
                onClick={() => setOutput('')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
          <div style={{ padding: '1rem', height: '300px', overflowY: 'auto' }}>
            <pre
              style={{
                fontSize: '0.75rem',
                whiteSpace: 'pre-wrap',
                fontFamily: 'var(--font-mono)',
                color: 'var(--neo-green)',
                opacity: 0.9,
                lineHeight: 1.5,
              }}
            >
              {output || '> System online. Ready for command input...'}
            </pre>
          </div>
        </div>
      </aside>

      <main style={{ minWidth: 0 }}>
        {isProvidersLoading && ['providers', 'oracle'].includes(activeTab) ? (
          <div
            className="card-industrial"
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: '500px',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1.5rem',
              }}
            >
              <div className="status-dot" style={{ transform: 'scale(2)' }}></div>
              <p
                style={{
                  color: 'var(--text-secondary)',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: 0,
                }}
              >
                CONNECTING TO MATRIX...
              </p>
            </div>
          </div>
        ) : (
          <div className="fade-in">
            {activeTab === 'overview' && <OverviewTab setOutput={setOutput} />}
            {activeTab === 'providers' && <ProvidersTab providers={providers} />}
            {activeTab === 'oracle' && <OracleTab providers={providers} setOutput={setOutput} />}
            {activeTab === 'compute' && <ComputeTab setOutput={setOutput} />}
            {activeTab === 'studio' && <StarterStudio embedded />}
            {activeTab === 'devhub' && <DeveloperHub />}
          </div>
        )}
      </main>
    </div>
  );
}
