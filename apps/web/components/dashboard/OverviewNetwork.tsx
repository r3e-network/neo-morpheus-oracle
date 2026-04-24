'use client';

import { Info } from 'lucide-react';
import { getFeedDescriptor, getDeprecatedFeedInfo } from '@/lib/feed-defaults';

type OnchainRecord = {
  pair: string;
  price_display: string;
  timestamp: string;
  timestamp_iso: string | null;
  attestation_hash: string;
};

interface OverviewNetworkProps {
  selectedPair: string;
  selectedRecord: OnchainRecord | null;
  selectedDescriptor: ReturnType<typeof getFeedDescriptor>;
  liveQuote: any;
  liveQuoteLoading: boolean;
  liveDeltaPct: number | null;
  deprecatedRecords: Array<{
    record: OnchainRecord;
    deprecated: ReturnType<typeof getDeprecatedFeedInfo>;
  }>;
}

export function OverviewNetwork({
  selectedPair,
  selectedRecord,
  selectedDescriptor,
  liveQuote,
  liveQuoteLoading,
  liveDeltaPct,
  deprecatedRecords,
}: OverviewNetworkProps) {
  return (
    <>
      {deprecatedRecords.length > 0 && (
        <section
          className="card-industrial stagger-2"
          style={{ padding: '1.5rem', borderLeft: '4px solid var(--warning)' }}
        >
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
            <Info color="var(--warning)" size={22} style={{ flexShrink: 0 }} />
            <div>
              <h4
                style={{
                  marginTop: 0,
                  marginBottom: '0.75rem',
                  color: '#fff',
                  fontSize: '1rem',
                  fontWeight: 800,
                }}
              >
                Deprecated On-Chain Feed Keys Detected
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {deprecatedRecords.map(({ record, deprecated }) => (
                  <div
                    key={record.pair}
                    style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}
                  >
                    <code>{record.pair}</code> is deprecated. Use{' '}
                    <code>{deprecated?.replacement}</code> instead.
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {deprecated?.reason}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="card-industrial stagger-2" style={{ padding: '2rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.25rem',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>
              Selected Feed Detail
            </h3>
            <div
              style={{ marginTop: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}
            >
              {selectedDescriptor?.label || selectedPair}
            </div>
          </div>
          <span
            className="badge-outline"
            style={{ color: 'var(--neo-green)', borderColor: 'var(--neo-green)' }}
          >
            {selectedDescriptor?.category || 'Feed'}
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1rem',
          }}
        >
          <div
            style={{ padding: '1rem', background: '#000', border: '1px solid var(--border-dim)' }}
          >
            <div
              style={{
                fontSize: '0.65rem',
                color: 'var(--text-secondary)',
                fontWeight: 800,
                marginBottom: '0.35rem',
                fontFamily: 'var(--font-mono)',
              }}
            >
              PAIR
            </div>
            <div style={{ color: '#fff', fontFamily: 'var(--font-mono)' }}>{selectedPair}</div>
          </div>
          <div
            style={{ padding: '1rem', background: '#000', border: '1px solid var(--border-dim)' }}
          >
            <div
              style={{
                fontSize: '0.65rem',
                color: 'var(--text-secondary)',
                fontWeight: 800,
                marginBottom: '0.35rem',
                fontFamily: 'var(--font-mono)',
              }}
            >
              MEANING
            </div>
            <div style={{ color: '#fff' }}>
              {selectedDescriptor?.meaning || 'No description available'}
            </div>
          </div>
          <div
            style={{ padding: '1rem', background: '#000', border: '1px solid var(--border-dim)' }}
          >
            <div
              style={{
                fontSize: '0.65rem',
                color: 'var(--text-secondary)',
                fontWeight: 800,
                marginBottom: '0.35rem',
                fontFamily: 'var(--font-mono)',
              }}
            >
              CHAIN VALUE
            </div>
            <div style={{ color: '#fff', fontFamily: 'var(--font-mono)' }}>
              {selectedRecord ? `$${selectedRecord.price_display}` : 'Not synced yet'}
            </div>
          </div>
          <div
            style={{ padding: '1rem', background: '#000', border: '1px solid var(--border-dim)' }}
          >
            <div
              style={{
                fontSize: '0.65rem',
                color: 'var(--text-secondary)',
                fontWeight: 800,
                marginBottom: '0.35rem',
                fontFamily: 'var(--font-mono)',
              }}
            >
              REAL-TIME SOURCE
            </div>
            <div style={{ color: '#fff', fontFamily: 'var(--font-mono)' }}>
              {liveQuoteLoading
                ? 'Loading...'
                : liveQuote?.price
                  ? `$${liveQuote.price}`
                  : 'Unavailable'}
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1rem',
            marginTop: '1rem',
          }}
        >
          <div
            style={{ padding: '1rem', background: '#000', border: '1px solid var(--border-dim)' }}
          >
            <div
              style={{
                fontSize: '0.65rem',
                color: 'var(--text-secondary)',
                fontWeight: 800,
                marginBottom: '0.35rem',
                fontFamily: 'var(--font-mono)',
              }}
            >
              TWELVEDATA SYMBOL
            </div>
            <div style={{ color: '#fff', fontFamily: 'var(--font-mono)' }}>
              {selectedDescriptor?.sourceSymbol || '-'}
            </div>
          </div>
          <div
            style={{ padding: '1rem', background: '#000', border: '1px solid var(--border-dim)' }}
          >
            <div
              style={{
                fontSize: '0.65rem',
                color: 'var(--text-secondary)',
                fontWeight: 800,
                marginBottom: '0.35rem',
                fontFamily: 'var(--font-mono)',
              }}
            >
              UNIT
            </div>
            <div style={{ color: '#fff' }}>{selectedDescriptor?.unit || '-'}</div>
          </div>
          <div
            style={{ padding: '1rem', background: '#000', border: '1px solid var(--border-dim)' }}
          >
            <div
              style={{
                fontSize: '0.65rem',
                color: 'var(--text-secondary)',
                fontWeight: 800,
                marginBottom: '0.35rem',
                fontFamily: 'var(--font-mono)',
              }}
            >
              LIVE VS CHAIN
            </div>
            <div style={{ color: '#fff', fontFamily: 'var(--font-mono)' }}>
              {liveDeltaPct === null
                ? '-'
                : `${liveDeltaPct >= 0 ? '+' : ''}${liveDeltaPct.toFixed(2)}%`}
            </div>
          </div>
          <div
            style={{ padding: '1rem', background: '#000', border: '1px solid var(--border-dim)' }}
          >
            <div
              style={{
                fontSize: '0.65rem',
                color: 'var(--text-secondary)',
                fontWeight: 800,
                marginBottom: '0.35rem',
                fontFamily: 'var(--font-mono)',
              }}
            >
              LAST ON-CHAIN UPDATE
            </div>
            <div style={{ color: '#fff', fontFamily: 'var(--font-mono)' }}>
              {selectedRecord?.timestamp_iso
                ? new Date(selectedRecord.timestamp_iso).toLocaleString()
                : '-'}
            </div>
          </div>
        </div>

        {selectedDescriptor?.note && (
          <p
            style={{
              marginTop: '1rem',
              marginBottom: 0,
              color: 'var(--text-secondary)',
              lineHeight: 1.7,
            }}
          >
            <strong style={{ color: '#fff' }}>Note:</strong> {selectedDescriptor.note}
          </p>
        )}
      </section>
    </>
  );
}
