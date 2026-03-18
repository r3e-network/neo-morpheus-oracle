'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Clock,
  Database,
  ExternalLink,
  Fingerprint,
  Info,
  Radio,
  RefreshCcw,
  ShieldCheck,
} from 'lucide-react';

import { DEFAULT_PAIRS, NETWORKS } from '@/lib/onchain-data';
import {
  getDeprecatedFeedInfo,
  getFeedDescriptor,
  getFeedDisplaySymbol,
  getFeedUnitLabel,
} from '@/lib/feed-defaults';
import { Card } from '@/components/ui/Card';
import { SkeletonStats, SkeletonGrid } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';

type OnchainRecord = {
  pair: string;
  price_display: string;
  timestamp: string;
  timestamp_iso: string | null;
  attestation_hash: string;
};

export function OverviewTab({ setOutput }: any) {
  const [onchainState, setOnchainState] = useState<any>(null);
  const [runtimeInfo, setRuntimeInfo] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPair, setSelectedPair] = useState<string>(DEFAULT_PAIRS[0]);
  const [liveQuote, setLiveQuote] = useState<any>(null);
  const [liveQuoteLoading, setLiveQuoteLoading] = useState(false);
  const { addToast } = useToast();

  const loadState = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      const [stateResponse, runtimeResponse] = await Promise.all([
        fetch('/api/onchain/state?limit=50'),
        fetch('/api/runtime/info'),
      ]);
      const [stateBody, runtimeBody] = await Promise.all([
        stateResponse.json().catch(() => ({})),
        runtimeResponse.json().catch(() => ({})),
      ]);
      setOnchainState(stateBody);
      setRuntimeInfo(runtimeBody);

      const recordCount = Number(stateBody?.neo_n3?.datafeed?.pair_count || 0);
      const requestFee = stateBody?.neo_n3?.oracle?.request_fee_display || '0.01 GAS';
      const appId = runtimeBody?.dstack?.app_id || 'unavailable';
      setOutput(
        [
          '>> Loaded Neo N3 on-chain state.',
          `>> Oracle fee: ${requestFee}`,
          `>> Feed pairs tracked: ${recordCount}`,
          `>> Phala app id: ${appId}`,
        ].join('\n')
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      setError(errorMsg);
      setOutput(`!! Failed to load on-chain state: ${errorMsg}`);
      addToast('error', `Failed to load on-chain state: ${errorMsg}`);
    } finally {
      setIsRefreshing(false);
      setIsInitialLoading(false);
    }
  }, [setOutput, addToast]);

  useEffect(() => {
    void loadState();
    const timer = setInterval(() => {
      void loadState();
    }, 20000);
    return () => clearInterval(timer);
  }, [loadState]);

  useEffect(() => {
    let cancelled = false;
    async function loadLiveQuote() {
      setLiveQuoteLoading(true);
      try {
        const response = await fetch(`/api/feeds/${encodeURIComponent(selectedPair)}`);
        const body = await response.json().catch(() => ({}));
        if (!cancelled) setLiveQuote(body);
      } catch {
        if (!cancelled) setLiveQuote(null);
      } finally {
        if (!cancelled) setLiveQuoteLoading(false);
      }
    }
    void loadLiveQuote();
    return () => {
      cancelled = true;
    };
  }, [selectedPair]);

  const recordsByPair = useMemo(() => {
    const records = Array.isArray(onchainState?.neo_n3?.datafeed?.records)
      ? onchainState.neo_n3.datafeed.records
      : [];
    return new Map<string, OnchainRecord>(
      records.map((record: OnchainRecord) => [
        String(record.pair || '')
          .trim()
          .toUpperCase(),
        record,
      ])
    );
  }, [onchainState]);

  const deprecatedRecords = useMemo(() => {
    const records = Array.isArray(onchainState?.neo_n3?.datafeed?.records)
      ? onchainState.neo_n3.datafeed.records
      : [];
    return records
      .map((record: OnchainRecord) => {
        const normalizedPair = String(record.pair || '')
          .trim()
          .toUpperCase();
        const deprecated = getDeprecatedFeedInfo(normalizedPair);
        return deprecated ? { record, deprecated } : null;
      })
      .filter(Boolean) as Array<{
      record: OnchainRecord;
      deprecated: ReturnType<typeof getDeprecatedFeedInfo>;
    }>;
  }, [onchainState]);

  const oracleState = onchainState?.neo_n3?.oracle || null;
  const dstack = runtimeInfo?.dstack || null;
  const configuredSyncedCount = DEFAULT_PAIRS.filter((pair) => recordsByPair.has(pair)).length;
  const selectedRecord = recordsByPair.get(selectedPair) || null;
  const selectedDescriptor = getFeedDescriptor(selectedPair);
  const livePrice = liveQuote?.price ? Number(liveQuote.price) : null;
  const onchainPrice = selectedRecord?.price_display ? Number(selectedRecord.price_display) : null;
  const liveDeltaPct =
    livePrice !== null && onchainPrice !== null && onchainPrice > 0
      ? ((livePrice - onchainPrice) / onchainPrice) * 100
      : null;

  return (
    <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          borderBottom: '1px solid var(--border-dim)',
          paddingBottom: '1rem',
        }}
      >
        <div>
          <h2
            style={{
              fontSize: '2rem',
              fontWeight: 900,
              letterSpacing: '-0.03em',
              marginBottom: '0.5rem',
            }}
          >
            Network Monitor
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            Live Neo N3 registry state, synchronized pricefeeds, and TEE deployment metadata.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          {isInitialLoading ? (
            <div
              className="badge-outline"
              style={{ color: 'var(--text-muted)', borderColor: 'var(--border-dim)' }}
            >
              Loading...
            </div>
          ) : (
            <>
              <div
                className="badge-outline"
                style={{ color: 'var(--neo-green)', borderColor: 'var(--neo-green)' }}
              >
                Neo N3: Live
              </div>
              <div className="badge-outline" style={{ color: 'var(--text-muted)' }}>
                Current Scope: N3 Only
              </div>
            </>
          )}
        </div>
      </div>

      {isInitialLoading ? (
        <SkeletonStats />
      ) : error ? (
        <Card variant="error" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Info size={20} color="#ef4444" />
            <div>
              <div style={{ fontWeight: 800, marginBottom: '4px' }}>
                Failed to load network data
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{error}</div>
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid grid-3 stagger-1">
          <div
            className="card-industrial"
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Radio size={14} color="var(--neo-green)" />
                <span
                  style={{
                    fontSize: '0.65rem',
                    fontWeight: 800,
                    color: 'var(--text-secondary)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  ORACLE REGISTRY
                </span>
              </div>
              <div className="status-dot"></div>
            </div>
            <div>
              <div
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 800,
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '-0.02em',
                }}
              >
                {oracleState?.request_fee_display || '0.01 GAS'}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {oracleState?.domain || NETWORKS.neo_n3.domains.oracle}
              </div>
            </div>
          </div>

          <div
            className="card-industrial"
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={14} color="var(--accent-purple)" />
                <span
                  style={{
                    fontSize: '0.65rem',
                    fontWeight: 800,
                    color: 'var(--text-secondary)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  TEE STATUS
                </span>
              </div>
              <Fingerprint size={14} color="var(--neo-green)" />
            </div>
            <div>
              <div
                style={{
                  fontSize: '1.05rem',
                  fontWeight: 800,
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '-0.02em',
                }}
              >
                {dstack?.app_id ? 'Attested' : 'Unavailable'}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {dstack?.client_kind || 'dstack'}{' '}
                {dstack?.compose_hash ? `· ${String(dstack.compose_hash).slice(0, 12)}...` : ''}
              </div>
            </div>
          </div>

          <div
            className="card-industrial"
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Activity size={14} color="var(--accent-blue)" />
                <span
                  style={{
                    fontSize: '0.65rem',
                    fontWeight: 800,
                    color: 'var(--text-secondary)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  FEED AUTOMATION
                </span>
              </div>
              <span
                style={{
                  fontSize: '0.65rem',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-secondary)',
                }}
              >
                60s / 0.1%
              </span>
            </div>
            <div>
              <div
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 800,
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '-0.02em',
                }}
              >
                {configuredSyncedCount} Synced / {DEFAULT_PAIRS.length} Configured
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                NNS: {NETWORKS.neo_n3.domains.datafeed}
              </div>
            </div>
          </div>
        </div>
      )}

      {deprecatedRecords.length > 0 && (
        <section
          className="card-industrial stagger-2"
          style={{ padding: '1.5rem', borderLeft: '4px solid #f59e0b' }}
        >
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
            <Info color="#f59e0b" size={22} style={{ flexShrink: 0 }} />
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

      <div className="card-industrial stagger-2" style={{ padding: '0' }}>
        <div
          style={{
            padding: '1.5rem 2rem',
            borderBottom: '1px solid var(--border-dim)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'rgba(255,255,255,0.02)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Database size={16} color="var(--neo-green)" />
            <h3
              style={{
                fontSize: '0.85rem',
                fontWeight: 800,
                color: 'var(--text-primary)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                fontFamily: 'var(--font-mono)',
              }}
            >
              On-Chain Feed Records
            </h3>
          </div>
          <button
            onClick={() => void loadState()}
            disabled={isRefreshing}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.7rem',
              fontFamily: 'var(--font-mono)',
              textTransform: 'uppercase',
            }}
          >
            {isRefreshing ? 'SYNCING...' : 'REFRESH'}
            <RefreshCcw size={12} className={isRefreshing ? 'spin' : ''} />
          </button>
        </div>

        {isInitialLoading ? (
          <SkeletonGrid count={6} />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '1px',
              background: 'var(--border-dim)',
            }}
          >
            {DEFAULT_PAIRS.map((pair) => {
              const record = recordsByPair.get(pair);
              const displayPair = getFeedDisplaySymbol(pair);
              const unitLabel = getFeedUnitLabel(pair);
              const descriptor = getFeedDescriptor(pair);
              return (
                <div
                  key={pair}
                  onClick={() => setSelectedPair(pair)}
                  role="button"
                  tabIndex={0}
                  style={{
                    padding: '1.5rem',
                    background: selectedPair === pair ? 'var(--bg-dark)' : 'var(--bg-panel)',
                    position: 'relative',
                    transition: 'background 0.3s',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.background = 'var(--bg-dark)';
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.background =
                      selectedPair === pair ? 'var(--bg-dark)' : 'var(--bg-panel)';
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') setSelectedPair(pair);
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '1.5rem',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <span
                        style={{
                          fontWeight: 800,
                          fontSize: '1.1rem',
                          letterSpacing: '0.02em',
                          display: 'block',
                        }}
                      >
                        {displayPair}
                      </span>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          color: 'var(--text-secondary)',
                          display: 'block',
                          marginTop: '0.2rem',
                        }}
                      >
                        {descriptor?.label || descriptor?.meaning || displayPair}
                      </span>
                      <span
                        style={{
                          fontSize: '0.58rem',
                          color: 'var(--text-muted)',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {NETWORKS.neo_n3.domains.datafeed}
                      </span>
                    </div>
                    <a
                      href={NETWORKS.neo_n3.explorer + NETWORKS.neo_n3.datafeed}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--text-muted)', transition: 'color 0.2s' }}
                      onMouseEnter={(event) => {
                        event.currentTarget.style.color = 'var(--text-primary)';
                      }}
                      onMouseLeave={(event) => {
                        event.currentTarget.style.color = 'var(--text-muted)';
                      }}
                    >
                      <ExternalLink size={14} />
                    </a>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: '8px',
                      marginBottom: '0.5rem',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '1.75rem',
                        fontWeight: 900,
                        fontFamily: 'var(--font-mono)',
                        letterSpacing: '-0.04em',
                        color: record ? '#fff' : 'var(--text-muted)',
                      }}
                    >
                      {record ? `$${record.price_display}` : '$--.------'}
                    </span>
                  </div>
                  {unitLabel && (
                    <div
                      style={{
                        fontSize: '0.62rem',
                        color: 'var(--text-muted)',
                        fontFamily: 'var(--font-mono)',
                        marginBottom: '0.5rem',
                      }}
                    >
                      Unit: {unitLabel}
                    </div>
                  )}

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginTop: '1.5rem',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '0.65rem',
                        color: 'var(--text-muted)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      <Clock
                        size={10}
                        style={{
                          verticalAlign: 'middle',
                          marginRight: '4px',
                          display: 'inline-block',
                        }}
                      />
                      {record?.timestamp_iso
                        ? new Date(record.timestamp_iso).toLocaleTimeString()
                        : 'Awaiting sync...'}
                    </div>
                    {record && (
                      <span
                        className="badge-outline"
                        style={{
                          color: 'var(--neo-green)',
                          borderColor: 'var(--neo-green)',
                          padding: '2px 6px',
                          fontSize: '0.5rem',
                        }}
                      >
                        VERIFIED
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style jsx>{`
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
