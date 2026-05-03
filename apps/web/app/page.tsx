import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Database,
  KeyRound,
  Lock,
  Shield,
} from 'lucide-react';

import { Dashboard } from '@/components/dashboard';
import { NETWORKS } from '@/lib/onchain-data';

const serviceCards = [
  {
    icon: Shield,
    title: 'Oracle Requests',
    value: '0.01 GAS',
    description: 'Encrypted payloads, callback contracts, NEP-21 wallet submission.',
  },
  {
    icon: Cpu,
    title: 'Private Compute',
    value: 'JS / WASM',
    description: 'Author bounded compute packages and verify callback readback shape.',
  },
  {
    icon: Database,
    title: 'Data Catalog',
    value: '35+ pairs',
    description: 'Provider-scoped feed keys with on-chain 1e6 USD scaled storage.',
  },
  {
    icon: Lock,
    title: 'Attested Runtime',
    value: 'Dual CVM',
    description: 'Separated oracle and datafeed runtimes with published attestation anchors.',
  },
];

const validationItems = [
  'Local encryption before payload submission',
  'On-chain Oracle.request package generation',
  'NEP-21 wallet path for direct testnet requests',
  'Callback readback and verifier templates',
];

export default function HomePage() {
  return (
    <div className="workbench-home">
      <section className="workbench-hero">
        <div className="container">
          <div className="workbench-hero-grid">
            <div className="workbench-hero-copy">
              <h1>Morpheus Oracle Workbench</h1>
              <p>
                A production console for Neo N3 oracle requests, confidential compute, feed
                inspection, callback verification, and developer handoff.
              </p>
              <div className="workbench-hero-actions" aria-label="Primary workbench actions">
                <Link href="/explorer" className="btn-ata">
                  Open Workbench <ArrowRight size={16} />
                </Link>
                <Link href="/docs/api-reference" className="btn-secondary workbench-link-button">
                  API Reference
                </Link>
              </div>
            </div>

            <div className="workbench-status-panel" aria-label="Service readiness">
              <div className="workbench-status-header">
                <div>
                  <strong>{NETWORKS.neo_n3.name}</strong>
                  <span>{NETWORKS.neo_n3.environmentLabel}</span>
                </div>
                <span className="workbench-status-pill">
                  <Activity size={13} />
                  Ready
                </span>
              </div>
              <div className="workbench-validation-list">
                {validationItems.map((item) => (
                  <div key={item} className="workbench-validation-row">
                    <CheckCircle2 size={16} />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
              <div className="workbench-contract-strip">
                <span>Oracle contract</span>
                <code>{NETWORKS.neo_n3.oracle}</code>
              </div>
            </div>
          </div>

          <div className="workbench-service-grid" aria-label="Workbench services">
            {serviceCards.map((card) => {
              const Icon = card.icon;
              return (
                <article key={card.title} className="workbench-service-card">
                  <div className="workbench-service-icon">
                    <Icon size={18} />
                  </div>
                  <div>
                    <div className="workbench-service-title">{card.title}</div>
                    <div className="workbench-service-value">{card.value}</div>
                    <p>{card.description}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="workbench-dashboard-section" aria-label="Morpheus operator workbench">
        <div className="container">
          <Dashboard />
        </div>
      </section>

      <section className="workbench-support-section">
        <div className="container workbench-support-grid">
          <Link href="/verifier" className="workbench-support-link">
            <KeyRound size={18} />
            <span>
              <strong>Verifier</strong>
              <small>Check result envelopes and attestation hashes.</small>
            </span>
          </Link>
          <Link href="/status" className="workbench-support-link">
            <Activity size={18} />
            <span>
              <strong>Runtime Status</strong>
              <small>Inspect public health and runtime catalog metadata.</small>
            </span>
          </Link>
          <Link href="/launchpad" className="workbench-support-link">
            <ArrowRight size={18} />
            <span>
              <strong>Launchpad</strong>
              <small>Start from curated oracle, compute, and NeoDID flows.</small>
            </span>
          </Link>
        </div>
      </section>
    </div>
  );
}
