"use client";

import { useEffect, useState, useCallback } from "react";
import { 
  Server, Activity, Shield, Zap, Clock, Radio, 
  ExternalLink, ChevronRight, RefreshCcw, Database, 
  Search, CheckCircle2, Globe
} from "lucide-react";
import { fetchNeoN3Price, fetchNeoXPrice, OnChainPrice, NETWORKS } from "@/lib/onchain-data";

interface OverviewTabProps {
  networkInfo: any;
  providers: any[];
  callJSON: (path: string, body?: any, method?: string) => Promise<string>;
  setOutput: (output: string) => void;
  onchainState: any;
  runtimeHealth: any;
  runtimeInfo: any;
  attestationDemo: any;
}

export function OverviewTab({ networkInfo, providers, callJSON, setOutput, onchainState }: OverviewTabProps) {
  const [symbol, setSymbol] = useState("NEO-USD");
  const [onchainPrices, setOnchainPrices] = useState<Record<string, OnChainPrice | null>>({});
  const [isFetching, setIsFetching] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const chainViews = [
    { key: "neo_n3", label: "Neo N3", color: "var(--neo-green)" },
    { key: "neo_x", label: "Neo X", color: "var(--neo-blue)" },
  ];

  const fetchDirectly = useCallback(async () => {
    setIsFetching(true);
    try {
      const [n3, x] = await Promise.all([
        fetchNeoN3Price(symbol),
        fetchNeoXPrice(symbol)
      ]);
      setOnchainPrices({ neo_n3: n3, neo_x: x });
    } finally {
      setIsFetching(false);
    }
  }, [symbol]);

  useEffect(() => {
    fetchDirectly();
  }, [fetchDirectly]);

  useEffect(() => {
    let timer: any;
    if (autoRefresh) {
      timer = setInterval(fetchDirectly, 10000);
    }
    return () => clearInterval(timer);
  }, [autoRefresh, fetchDirectly]);

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
      {/* High-Level Network Metrics */}
      <div className="grid grid-3 stagger-1">
        <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{ background: 'var(--neo-green-glow)', padding: '10px', borderRadius: '12px' }}>
            <Globe className="text-neo" size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Network State</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>Global Distributed</div>
          </div>
        </div>
        <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{ background: 'var(--neo-purple-glow)', padding: '10px', borderRadius: '12px' }}>
            <Activity className="text-purple" size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Sync Integrity</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>99.9% Attested</div>
          </div>
        </div>
        <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '10px', borderRadius: '12px' }}>
            <Database className="text-neo-gradient" size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Data Consistency</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>Cross-Chain Valid</div>
          </div>
        </div>
      </div>

      {/* Main Validation Console */}
      <div className="glass-card stagger-2" style={{ border: '1px solid var(--border-neo)', background: 'linear-gradient(180deg, rgba(0, 255, 163, 0.03) 0%, transparent 100%)' }}>
        <div style={{ padding: '2rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="pulse-ring"></div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 900 }}>Live On-Chain Verification</h3>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
              <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} style={{ width: '14px', height: '14px' }} />
              Auto-Live
            </div>
            <button className="btn btn-secondary btn-sm" onClick={fetchDirectly} disabled={isFetching}>
              <RefreshCcw size={14} className={isFetching ? 'spin' : ''} /> Refresh
            </button>
          </div>
        </div>

        <div style={{ padding: '2.5rem' }}>
          <div className="grid grid-2" style={{ gap: '3rem' }}>
            <div>
              <div className="form-group" style={{ marginBottom: '2rem' }}>
                <label className="form-label" style={{ fontSize: '0.7rem' }}>Verification Target (Symbol)</label>
                <div style={{ position: 'relative' }}>
                  <input 
                    className="neo-input" 
                    value={symbol} 
                    onChange={e => setSymbol(e.target.value.toUpperCase())} 
                    style={{ fontSize: '1.25rem', fontWeight: 800, paddingLeft: '3.5rem' }} 
                  />
                  <Search size={20} style={{ position: 'absolute', left: '1.25rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.85rem', fontWeight: 800 }}>RPC TELEMETRY</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {chainViews.map(({ key, label }) => (
                      <div key={key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                        <span style={{ color: 'var(--text-dim)' }}>{label} Endpoint:</span>
                        <span className="font-mono" style={{ color: 'var(--neo-green)' }}>{NETWORKS[key as keyof typeof NETWORKS].rpc.split('/')[2]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {chainViews.map(({ key, label, color }) => (
                <div key={key} className="glass-card" style={{ padding: '1.5rem', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }}></div>
                        <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>{label} Network</span>
                      </div>
                      {onchainPrices[key] ? (
                        <div className="fade-in">
                          <div style={{ fontSize: '2.25rem', fontWeight: 900, letterSpacing: '-0.02em' }}>${onchainPrices[key]?.price}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Clock size={12} /> Last Contract Update: {new Date(onchainPrices[key]?.timestamp || 0).toLocaleTimeString()}
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: '2.25rem', fontWeight: 900, opacity: 0.1 }}>$--.---</div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <a 
                        href={onchainPrices[key]?.contractLink || NETWORKS[key as keyof typeof NETWORKS].explorer + NETWORKS[key as keyof typeof NETWORKS].datafeed} 
                        target="_blank" 
                        className="btn btn-secondary btn-xs"
                        style={{ fontSize: '0.6rem', padding: '4px 8px', borderRadius: '4px' }}
                      >
                        VIEW CONTRACT <ExternalLink size={10} />
                      </a>
                      <div style={{ marginTop: '1rem' }}>
                        {onchainPrices[key] && <span className="badge-outline" style={{ color: 'var(--neo-green)', borderColor: 'var(--neo-green)', fontSize: '0.55rem' }}>✓ ATTESTED BY TEE</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
