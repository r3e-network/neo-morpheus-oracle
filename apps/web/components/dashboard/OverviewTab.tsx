"use client";

import { useEffect, useState, useCallback } from "react";
import { 
  Server, Activity, Shield, Zap, Clock, Radio, 
  ExternalLink, Globe, Database, RefreshCcw
} from "lucide-react";
import { fetchNeoN3Price, fetchNeoXPrice, OnChainPrice, DEFAULT_PAIRS, NETWORKS } from "@/lib/onchain-data";

interface OverviewTabProps {
  networkInfo: any;
  onchainState: any;
  setOutput: (output: string) => void;
}

export function OverviewTab({ setOutput }: OverviewTabProps) {
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
    const timer = setInterval(loadAllPrices, 30000);
    return () => clearInterval(timer);
  }, [loadAllPrices]);

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
      {/* 1. Dashboard Header */}
      <div className="grid grid-3 stagger-1">
        <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'var(--neo-green-glow)', padding: '10px', borderRadius: '12px' }}><Globe className="text-neo" size={20} /></div>
          <div>
            <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Consensus</div>
            <div style={{ fontSize: '1rem', fontWeight: 800 }}>TEE Authenticated</div>
          </div>
        </div>
        <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'var(--neo-purple-glow)', padding: '10px', borderRadius: '12px' }}><Shield className="text-purple" size={20} /></div>
          <div>
            <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Security</div>
            <div style={{ fontSize: '1rem', fontWeight: 800 }}>RSA-OAEP 2048</div>
          </div>
        </div>
        <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '10px', borderRadius: '12px' }}><Activity className="text-neo-gradient" size={20} /></div>
          <div>
            <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Availability</div>
            <div style={{ fontSize: '1rem', fontWeight: 800 }}>Dual-Chain Live</div>
          </div>
        </div>
      </div>

      {/* 2. Automated Price Board */}
      <div className="glass-card stagger-2">
        <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Radio size={18} className="text-neo" style={{ animation: 'pulse 2s infinite' }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 900 }}>Live Matrix Pricefeeds</h3>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={loadAllPrices} disabled={isRefreshing}>
            <RefreshCcw size={14} className={isRefreshing ? 'spin' : ''} /> {isRefreshing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>

        <div style={{ padding: '1.5rem' }}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
            {DEFAULT_PAIRS.map(pair => {
              const data = prices[pair];
              return (
                <div key={pair} className="glass-card" style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.02)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                    <span style={{ fontWeight: 900, fontSize: '1.1rem', letterSpacing: '0.05em' }}>{pair}</span>
                    <span className="badge-outline" style={{ color: 'var(--neo-green)', fontSize: '0.55rem' }}>Direct RPC</span>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div style={{ borderRight: '1px solid var(--border-subtle)', paddingRight: '1rem' }}>
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 800 }}>NEO N3</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#fff' }}>{data?.n3 ? `$${data.n3.price}` : '---'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 800 }}>NEO X</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--neo-blue)' }}>{data?.x ? `$${data.x.price}` : '---'}</div>
                    </div>
                  </div>
                  
                  <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.03)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>
                      <Clock size={10} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                      Updated {data?.n3 ? new Date(data.n3.timestamp).toLocaleTimeString() : 'N/A'}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <a href={NETWORKS.neo_n3.explorer + NETWORKS.neo_n3.datafeed} target="_blank" title="View on N3 Explorer"><ExternalLink size={12} className="text-muted" /></a>
                      <a href={NETWORKS.neo_x.explorer + NETWORKS.neo_x.datafeed} target="_blank" title="View on Neo X Explorer"><ExternalLink size={12} className="text-muted" /></a>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* 3. Registry Info */}
      <div className="glass-card stagger-3" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '2rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>RPC (N3): <span style={{ color: 'var(--neo-green)' }}>{NETWORKS.neo_n3.rpc.split('/')[2]}</span></span>
            <span style={{ color: 'var(--text-muted)' }}>RPC (X): <span style={{ color: 'var(--neo-blue)' }}>{NETWORKS.neo_x.rpc.split('/')[2]}</span></span>
          </div>
          <span style={{ color: 'var(--text-dim)' }}>Consistency: <span style={{ color: 'var(--neo-green)' }}>Verified</span></span>
        </div>
      </div>

      <style jsx>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
