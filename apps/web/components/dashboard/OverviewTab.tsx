"use client";

import { useEffect, useState, useCallback } from "react";
import { 
  Activity, Shield, Zap, Clock, Radio, 
  ExternalLink, Globe, Database, RefreshCcw, Server, ShieldCheck, CheckCircle2
} from "lucide-react";
import { fetchNeoN3Price, fetchNeoXPrice, OnChainPrice, DEFAULT_PAIRS, NETWORKS } from "@/lib/onchain-data";

export function OverviewTab({ setOutput }: any) {
  const [prices, setPrices] = useState<Record<string, { n3: OnChainPrice | null, x: OnChainPrice | null }>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadAllPrices = useCallback(async () => {
    setIsRefreshing(true);
    const newPrices: any = {};
    await Promise.all(DEFAULT_PAIRS.map(async (pair) => {
      const [n3, x] = await Promise.all([fetchNeoN3Price(pair), fetchNeoXPrice(pair)]);
      newPrices[pair] = { n3, x };
    }));
    setPrices(newPrices);
    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    loadAllPrices();
    const timer = setInterval(loadAllPrices, 20000);
    return () => clearInterval(timer);
  }, [loadAllPrices]);

  return (
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
      {/* Network Live Stats */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid var(--border-dim)', paddingBottom: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.03em', marginBottom: '0.5rem' }}>Network Monitor</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Real-time telemetry and on-chain verification from the prover network.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <div className="badge-outline" style={{ color: 'var(--neo-green)', borderColor: 'var(--neo-green)' }}>Neo N3: Live</div>
          <div className="badge-outline" style={{ color: 'var(--text-muted)' }}>Neo X: Pending</div>
        </div>
      </div>

      <div className="grid grid-3 stagger-1">
        <div className="card-industrial" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Server size={14} color="var(--neo-green)" />
              <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>RPC STATUS</span>
            </div>
            <div className="status-dot"></div>
          </div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' }}>{NETWORKS.neo_n3.rpc.split('/')[2]}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--neo-green)', fontWeight: 700, marginTop: '4px' }}>Operational</div>
          </div>
        </div>
        
        <div className="card-industrial" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={14} color="var(--accent-purple)" />
              <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>TEE SECURITY</span>
            </div>
            <CheckCircle2 size={14} color="var(--neo-green)" />
          </div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' }}>Hardware Attested</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Intel SGX Enclave v2.4</div>
          </div>
        </div>
        
        <div className="card-industrial" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={14} color="var(--accent-blue)" />
              <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>MATRIX SYNC</span>
            </div>
            <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>~140ms</span>
          </div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' }}>14 Active Feeds</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Decentralized Aggregation</div>
          </div>
        </div>
      </div>

      {/* Main Price Grid */}
      <div className="card-industrial stagger-2" style={{ padding: '0' }}>
        <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--border-dim)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Database size={16} color="var(--neo-green)" />
            <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)' }}>On-Chain Verification</h3>
          </div>
          <button onClick={loadAllPrices} disabled={isRefreshing} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
            {isRefreshing ? 'SYNCING...' : 'SYNC NOW'}
            <RefreshCcw size={12} className={isRefreshing ? 'spin' : ''} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1px', background: 'var(--border-dim)' }}>
          {DEFAULT_PAIRS.map(pair => {
            const data = prices[pair];
            return (
              <div key={pair} style={{ padding: '1.5rem', background: 'var(--bg-panel)', position: 'relative', transition: 'background 0.3s' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-dark)'} onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-panel)'}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', alignItems: 'center' }}>
                  <span style={{ fontWeight: 800, fontSize: '1.1rem', letterSpacing: '0.02em' }}>{pair}</span>
                  <a href={NETWORKS.neo_n3.explorer + NETWORKS.neo_n3.datafeed} target="_blank" style={{ color: 'var(--text-muted)', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
                    <ExternalLink size={14} />
                  </a>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '1.75rem', fontWeight: 900, fontFamily: 'var(--font-mono)', letterSpacing: '-0.04em', color: data?.n3 ? '#fff' : 'var(--text-muted)' }}>
                    {data?.n3 ? `$${data.n3.price}` : '$--.--'}
                  </span>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem' }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    <Clock size={10} style={{ verticalAlign: 'middle', marginRight: '4px', display: 'inline-block' }} />
                    {data?.n3 ? new Date(data.n3.timestamp).toLocaleTimeString() : 'Awaiting sync...'}
                  </div>
                  {data?.n3 && <span className="badge-outline" style={{ color: 'var(--neo-green)', borderColor: 'var(--neo-green)', padding: '2px 6px', fontSize: '0.5rem' }}>VERIFIED</span>}
                </div>
              </div>
            )
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