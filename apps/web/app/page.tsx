import Link from 'next/link';
import {
  Shield,
  Cpu,
  Lock,
  ArrowRight,
  Zap,
  CheckCircle2,
  Activity,
  ChevronRight,
  Layers,
  KeyRound,
} from 'lucide-react';
import { NETWORKS } from '@/lib/onchain-data';
import { Card, StatCard } from '@/components/ui/Card';

const features = [
  {
    icon: Shield,
    iconColor: 'var(--neo-green)',
    title: 'Role-Split Confidential Runtimes',
    description:
      'Oracle request/response execution and continuous datafeeds run on separate attested CVMs so private jobs and feed publication do not contend for the same lane.',
  },
  {
    icon: Cpu,
    iconColor: 'var(--accent-blue)',
    title: 'Confidential Execution',
    description:
      'Run JS/WASM workloads and private fetches inside the confidential runtime, then return signed result envelopes and optional attestation metadata.',
  },
  {
    icon: Lock,
    iconColor: 'var(--text-primary)',
    title: 'Sealed Payload Transport',
    description:
      'Secrets are sealed locally with X25519 + HKDF-SHA256 + AES-256-GCM before they ever leave the client boundary.',
  },
];

const stats = [
  { label: 'Oracle Fee', value: '0.01', subvalue: 'GAS per request' },
  { label: 'Runtime Split', value: '2', subvalue: 'Role-specialized CVMs' },
  { label: 'Feed Pairs', value: '35+', subvalue: 'Supported symbols' },
];

export default function HomePage() {
  return (
    <>
      {/* HERO SECTION */}
      <section
        style={{
          paddingTop: '18vh',
          paddingBottom: '12vh',
          textAlign: 'center',
        }}
      >
        <div className="container fade-in">
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 20px',
              background: 'rgba(0, 255, 163, 0.05)',
              border: '1px solid rgba(0, 255, 163, 0.2)',
              borderRadius: '4px',
              marginBottom: '2rem',
            }}
          >
            <div className="status-dot" />
            <span
              style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                color: 'var(--neo-green)',
                letterSpacing: 0,
                fontFamily: 'var(--font-mono)',
              }}
            >
              DUAL-CVM CONFIDENTIAL STACK
            </span>
          </div>

          <h1 className="hero-title">
            Confidential Oracle <br />
            <span className="text-gradient">for Neo N3</span>
          </h1>

          <p
            style={{
              maxWidth: '640px',
              margin: '0 auto 2.5rem',
              fontSize: '1.15rem',
              color: 'var(--text-secondary)',
              lineHeight: 1.7,
            }}
          >
            Serverless ingress, durable orchestration, isolated datafeeds, and attested
            request-response execution for Neo N3.
          </p>

          <div
            style={{
              display: 'flex',
              gap: '1rem',
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <Link href="/launchpad" className="btn-ata" style={{ padding: '1rem 2.5rem' }}>
              Launchpad <ArrowRight size={16} />
            </Link>
            <Link
              href="/explorer"
              className="btn-secondary"
              style={{
                padding: '1rem 2rem',
                textTransform: 'uppercase',
                fontSize: '0.8rem',
                letterSpacing: 0,
                fontWeight: 700,
              }}
            >
              <Activity size={14} style={{ display: 'inline', marginRight: '8px' }} />
              Explorer
            </Link>
            <Link
              href="/docs"
              className="btn-secondary"
              style={{
                padding: '1rem 2rem',
                textTransform: 'uppercase',
                fontSize: '0.8rem',
                letterSpacing: 0,
                fontWeight: 700,
              }}
            >
              Documentation
            </Link>
          </div>
        </div>
      </section>

      {/* STATS */}
      <section style={{ padding: '4rem 0', borderTop: '1px solid var(--border-dim)' }}>
        <div className="container">
          <div className="grid grid-3">
            {stats.map((stat) => (
              <StatCard
                key={stat.label}
                label={stat.label}
                value={stat.value}
                subvalue={stat.subvalue}
              />
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section style={{ padding: '6rem 0', borderTop: '1px solid var(--border-dim)' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <h2 className="section-title">Execution Model</h2>
            <p
              style={{
                color: 'var(--text-secondary)',
                fontSize: '1rem',
                fontFamily: 'var(--font-mono)',
              }}
            >
              CONTROL PLANE OUTSIDE, CONFIDENTIAL EXECUTION INSIDE
            </p>
          </div>

          <div className="grid grid-3">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <Card key={feature.title} className={`stagger-${index + 1}`} hoverable>
                  <Icon size={28} color={feature.iconColor} style={{ marginBottom: '1.5rem' }} />
                  <h3
                    style={{
                      fontSize: '1rem',
                      fontWeight: 800,
                      marginBottom: '1rem',
                      textTransform: 'uppercase',
                      letterSpacing: 0,
                    }}
                  >
                    {feature.title}
                  </h3>
                  <p
                    style={{
                      color: 'var(--text-secondary)',
                      fontSize: '0.9rem',
                      lineHeight: 1.7,
                      margin: 0,
                    }}
                  >
                    {feature.description}
                  </p>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* DATAFEED SECTION */}
      <section
        style={{
          padding: '6rem 0',
          borderTop: '1px solid var(--border-dim)',
          background:
            'radial-gradient(ellipse at center, rgba(0, 255, 163, 0.02) 0%, transparent 70%)',
        }}
      >
        <div className="container">
          <div className="grid grid-2" style={{ alignItems: 'center', gap: '5rem' }}>
            <div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '10px',
                  marginBottom: '1.5rem',
                }}
              >
                <Zap size={16} color="var(--neo-green)" />
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    color: 'var(--neo-green)',
                    letterSpacing: 0,
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  ISOLATED DATAFEED LANE
                </span>
              </div>
              <h2 className="section-title">Isolated Datafeeds</h2>
              <p
                style={{
                  color: 'var(--text-secondary)',
                  fontSize: '1.05rem',
                  marginBottom: '2rem',
                  lineHeight: 1.7,
                }}
              >
                Access synchronized price pairs stored directly on {NETWORKS.neo_n3.name}. Feed
                publication runs on the dedicated DataFeed CVM, uses a global{' '}
                <code>1 USD = 1,000,000</code> integer scale, scans every 60 seconds, and only
                publishes when movement versus the current quantized on-chain value exceeds 0.1%.
              </p>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                  marginBottom: '2rem',
                }}
              >
                {[
                  'Native Neo N3 C# contract integration',
                  'Role-split Oracle and DataFeed attestation anchors',
                  'Encrypted callbacks with replay and boundary protections',
                ].map((item) => (
                  <div key={item} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <CheckCircle2 size={18} color="var(--text-primary)" />
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                      {item}
                    </span>
                  </div>
                ))}
              </div>

              <Link href="/explorer" className="btn-ata">
                Explore Live Data <ArrowRight size={16} />
              </Link>
            </div>

            <Card variant="highlighted" padding="none">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottom: '1px solid var(--border-dim)',
                  padding: '1rem 1.5rem',
                  background: 'rgba(83, 58, 253, 0.045)',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.8rem',
                    color: 'var(--text-secondary)',
                    fontWeight: 700,
                  }}
                >
                  MorpheusFeed.cs
                </span>
                <span
                  className="badge-outline"
                  style={{
                    color: 'var(--neo-green)',
                    borderColor: 'var(--neo-green)',
                  }}
                >
                  SYNC_OK
                </span>
              </div>
              <pre
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.85rem',
                  lineHeight: 1.7,
                  padding: '1.5rem',
                  margin: 0,
                  color: 'var(--text-primary)',
                }}
              >
                {`// Read verified 1e6-scaled USD price data on Neo N3
public static void Execute() {
 object[] record = (object[])Contract.Call(
 DataFeedHash,
 "getLatest",
 CallFlags.ReadOnly,
 "TWELVEDATA:NEO-USD"
 );

 BigInteger priceUnits = (BigInteger)record[2];
 BigInteger timestamp = (BigInteger)record[3];

 // 1.000000 USD == 1_000_000 units
 Require(priceUnits > 1_000_000, "Price too low");
}`}
              </pre>
            </Card>
          </div>
        </div>
      </section>

      {/* QUICK ACTIONS */}
      <section style={{ padding: '6rem 0', borderTop: '1px solid var(--border-dim)' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <h2 className="section-title">Get Started</h2>
            <p style={{ color: 'var(--text-secondary)' }}>
              Choose your entry point based on what you want to build.
            </p>
          </div>

          <div className="grid grid-3">
            {[
              {
                icon: Shield,
                title: 'Privacy Oracle',
                description: 'Fetch outside data with encrypted secrets and sealed computation.',
                href: '/launchpad',
                cta: 'Start Oracle',
              },
              {
                icon: Layers,
                title: 'Compute',
                description:
                  'Run custom JS/WASM logic inside TEE enclaves with verifiable results.',
                href: '/docs/compute',
                cta: 'Learn Compute',
              },
              {
                icon: KeyRound,
                title: 'NeoDID',
                description:
                  'Bind Web2 identities, resolve W3C DID documents, issue action tickets.',
                href: '/launchpad/neodid-live',
                cta: 'Try NeoDID',
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.title} hoverable>
                  <Icon size={24} color="var(--neo-green)" style={{ marginBottom: '1rem' }} />
                  <h3
                    style={{
                      fontSize: '1rem',
                      fontWeight: 800,
                      marginBottom: '0.75rem',
                    }}
                  >
                    {item.title}
                  </h3>
                  <p
                    style={{
                      color: 'var(--text-secondary)',
                      fontSize: '0.85rem',
                      lineHeight: 1.6,
                      marginBottom: '1.5rem',
                    }}
                  >
                    {item.description}
                  </p>
                  <Link
                    href={item.href}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      color: 'var(--neo-green)',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    {item.cta} <ChevronRight size={16} />
                  </Link>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section
        style={{
          padding: '8rem 0',
          textAlign: 'center',
          borderTop: '1px solid var(--border-dim)',
        }}
      >
        <div className="container stagger-1">
          <h2 className="section-title" style={{ marginBottom: '1rem' }}>
            Initialize Connection
          </h2>
          <p
            style={{
              color: 'var(--text-secondary)',
              marginBottom: '2.5rem',
              fontSize: '1.05rem',
            }}
          >
            Build on a production design that separates ingress, durability, and confidential
            execution cleanly.
          </p>
          <Link
            href="/explorer"
            className="btn-ata"
            style={{ padding: '1rem 3rem', fontSize: '0.9rem' }}
          >
            Open Explorer
          </Link>
        </div>
      </section>
    </>
  );
}
