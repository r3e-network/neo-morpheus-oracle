"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
} from "lucide-react";

import { DEFAULT_PAIRS, NETWORKS } from "@/lib/onchain-data";
import { getDeprecatedFeedInfo, getFeedDisplaySymbol, getFeedUnitLabel } from "@/lib/feed-defaults";

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

  const loadState = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [stateResponse, runtimeResponse] = await Promise.all([
        fetch("/api/onchain/state?limit=50"),
        fetch("/api/runtime/info"),
      ]);
      const [stateBody, runtimeBody] = await Promise.all([
        stateResponse.json().catch(() => ({})),
        runtimeResponse.json().catch(() => ({})),
      ]);
      setOnchainState(stateBody);
      setRuntimeInfo(runtimeBody);

      const recordCount = Number(stateBody?.neo_n3?.datafeed?.pair_count || 0);
      const requestFee = stateBody?.neo_n3?.oracle?.request_fee_display || "0.01 GAS";
      const appId = runtimeBody?.dstack?.app_id || "unavailable";
      setOutput([
        ">> Loaded Neo N3 on-chain state.",
        `>> Oracle fee: ${requestFee}`,
        `>> Feed pairs tracked: ${recordCount}`,
        `>> Phala app id: ${appId}`,
      ].join("\n"));
    } catch (error) {
      setOutput(`!! Failed to load on-chain state: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsRefreshing(false);
    }
  }, [setOutput]);

  useEffect(() => {
    void loadState();
    const timer = setInterval(() => {
      void loadState();
    }, 20000);
    return () => clearInterval(timer);
  }, [loadState]);

  const recordsByPair = useMemo(() => {
    const records = Array.isArray(onchainState?.neo_n3?.datafeed?.records)
      ? onchainState.neo_n3.datafeed.records
      : [];
    return new Map<string, OnchainRecord>(
      records.map((record: OnchainRecord) => [String(record.pair || "").replace(/^TWELVEDATA:/, ""), record]),
    );
  }, [onchainState]);

  const deprecatedRecords = useMemo(() => {
    const records = Array.isArray(onchainState?.neo_n3?.datafeed?.records)
      ? onchainState.neo_n3.datafeed.records
      : [];
    return records
      .map((record: OnchainRecord) => {
        const normalizedPair = String(record.pair || "").replace(/^TWELVEDATA:/, "");
        const deprecated = getDeprecatedFeedInfo(normalizedPair);
        return deprecated ? { record, deprecated } : null;
      })
      .filter(Boolean) as Array<{ record: OnchainRecord; deprecated: ReturnType<typeof getDeprecatedFeedInfo> }>;
  }, [onchainState]);

  const oracleState = onchainState?.neo_n3?.oracle || null;
  const datafeedState = onchainState?.neo_n3?.datafeed || null;
  const dstack = runtimeInfo?.dstack || null;

  return (
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid var(--border-dim)', paddingBottom: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.03em', marginBottom: '0.5rem' }}>Network Monitor</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Live Neo N3 registry state, synchronized pricefeeds, and TEE deployment metadata.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <div className="badge-outline" style={{ color: 'var(--neo-green)', borderColor: 'var(--neo-green)' }}>Neo N3: Live</div>
          <div className="badge-outline" style={{ color: 'var(--text-muted)' }}>Neo X: Reference Only</div>
        </div>
      </div>

      <div className="grid grid-3 stagger-1">
        <div className="card-industrial" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Radio size={14} color="var(--neo-green)" />
              <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>ORACLE REGISTRY</span>
            </div>
            <div className="status-dot"></div>
          </div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' }}>{oracleState?.request_fee_display || "0.01 GAS"}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '4px' }}>{oracleState?.domain || NETWORKS.neo_n3.domains.oracle}</div>
          </div>
        </div>

        <div className="card-industrial" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={14} color="var(--accent-purple)" />
              <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>TEE STATUS</span>
            </div>
            <Fingerprint size={14} color="var(--neo-green)" />
          </div>
          <div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' }}>
              {dstack?.app_id ? "Attested" : "Unavailable"}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {dstack?.client_kind || "dstack"} {dstack?.compose_hash ? `· ${String(dstack.compose_hash).slice(0, 12)}...` : ""}
            </div>
          </div>
        </div>

        <div className="card-industrial" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={14} color="var(--accent-blue)" />
              <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>FEED AUTOMATION</span>
            </div>
            <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>15s / 0.1%</span>
          </div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' }}>{datafeedState?.pair_count || 0} Synced / {DEFAULT_PAIRS.length} Configured</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '4px' }}>NNS: {NETWORKS.neo_n3.domains.datafeed}</div>
          </div>
        </div>
      </div>

      {deprecatedRecords.length > 0 && (
        <section className="card-industrial stagger-2" style={{ padding: '1.5rem', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
            <Info color="#f59e0b" size={22} style={{ flexShrink: 0 }} />
            <div>
              <h4 style={{ marginTop: 0, marginBottom: '0.75rem', color: '#fff', fontSize: '1rem', fontWeight: 800 }}>Deprecated On-Chain Feed Keys Detected</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {deprecatedRecords.map(({ record, deprecated }) => (
                  <div key={record.pair} style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                    <code>{record.pair}</code> is deprecated. Use <code>{deprecated?.replacement}</code> instead.
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{deprecated?.reason}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="card-industrial stagger-2" style={{ padding: '0' }}>
        <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--border-dim)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Database size={16} color="var(--neo-green)" />
            <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)' }}>On-Chain Feed Records</h3>
          </div>
          <button onClick={() => void loadState()} disabled={isRefreshing} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
            {isRefreshing ? 'SYNCING...' : 'REFRESH'}
            <RefreshCcw size={12} className={isRefreshing ? 'spin' : ''} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1px', background: 'var(--border-dim)' }}>
          {DEFAULT_PAIRS.map((pair) => {
            const record = recordsByPair.get(pair);
            const displayPair = getFeedDisplaySymbol(pair);
            const unitLabel = getFeedUnitLabel(pair);
            return (
              <div key={pair} style={{ padding: '1.5rem', background: 'var(--bg-panel)', position: 'relative', transition: 'background 0.3s' }} onMouseEnter={(event) => { event.currentTarget.style.background = 'var(--bg-dark)'; }} onMouseLeave={(event) => { event.currentTarget.style.background = 'var(--bg-panel)'; }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontWeight: 800, fontSize: '1.1rem', letterSpacing: '0.02em', display: 'block' }}>{displayPair}</span>
                    <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{NETWORKS.neo_n3.domains.datafeed}</span>
                  </div>
                  <a href={NETWORKS.neo_n3.explorer + NETWORKS.neo_n3.datafeed} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-muted)', transition: 'color 0.2s' }} onMouseEnter={(event) => { event.currentTarget.style.color = 'var(--text-primary)'; }} onMouseLeave={(event) => { event.currentTarget.style.color = 'var(--text-muted)'; }}>
                    <ExternalLink size={14} />
                  </a>
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '1.75rem', fontWeight: 900, fontFamily: 'var(--font-mono)', letterSpacing: '-0.04em', color: record ? '#fff' : 'var(--text-muted)' }}>
                    {record ? `$${record.price_display}` : '$--.--'}
                  </span>
                </div>
                {unitLabel && (
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: '0.5rem' }}>
                    Unit: {unitLabel}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem' }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    <Clock size={10} style={{ verticalAlign: 'middle', marginRight: '4px', display: 'inline-block' }} />
                    {record?.timestamp_iso ? new Date(record.timestamp_iso).toLocaleTimeString() : 'Awaiting sync...'}
                  </div>
                  {record && <span className="badge-outline" style={{ color: 'var(--neo-green)', borderColor: 'var(--neo-green)', padding: '2px 6px', fontSize: '0.5rem' }}>VERIFIED</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <style jsx>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
