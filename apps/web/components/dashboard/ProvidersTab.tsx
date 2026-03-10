"use client";

import { useEffect, useState } from "react";
import { Database, Search, ShieldCheck, Zap, Activity, ExternalLink, Info, Globe } from "lucide-react";

interface ProvidersTabProps {
  providers: any[];
}

export function ProvidersTab({ providers }: ProvidersTabProps) {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/feeds/catalog");
        const body = await res.json();
        if (Array.isArray(body.pairs)) setSymbols(body.pairs.sort());
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const filteredSymbols = symbols.filter(s => s.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
      {/* 1. Header with Discovery Guide */}
      <div className="glass-card neo-card stagger-1" style={{ padding: '2.5rem' }}>
        <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '1.25rem' }}>Data Matrix Catalog</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: '1.1rem', maxWidth: '850px', lineHeight: 1.7 }}>
          Morpheus natively integrates with top-tier data aggregators. If your required pair is not in our standard catalog, you can use the <strong>Custom URL</strong> mode in the Secure Gateway to fetch data from any REST API.
        </p>
        <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
          <a href="https://twelvedata.com/stocks" target="_blank" className="btn btn-secondary btn-sm">
            <Globe size={14} /> Explore TwelveData Symbols
          </a>
          <a href="https://binance-docs.github.io/apidocs/spot/en/#symbol-price-ticker" target="_blank" className="btn btn-secondary btn-sm">
            <ExternalLink size={14} /> Binance Spot API
          </a>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="stagger-2">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}>
            <Zap size={18} className="text-neo" />
            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, textTransform: 'uppercase' }}>Built-in Adapters</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {providers.map((p) => (
              <div key={p.id} className="glass-card" style={{ padding: '1.5rem', background: 'rgba(255,255,255,0.02)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <span style={{ fontWeight: 800, fontSize: '1rem', color: '#fff' }}>{p.id.toUpperCase()}</span>
                  <div className="badge-outline" style={{ color: 'var(--neo-green)', fontSize: '0.55rem' }}>NATIVE</div>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '1.25rem' }}>{p.description}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>SUPPORT: <span style={{ color: '#fff' }}>{p.supports?.join(', ')}</span></span>
                  <span style={{ color: 'var(--text-muted)' }}>AUTH: <span style={{ color: '#fff' }}>{p.auth === 'none' ? 'Public' : 'Encrypted Key'}</span></span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card stagger-3" style={{ padding: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}>
             <Activity size={18} className="text-purple" />
             <h3 style={{ fontSize: '0.9rem', fontWeight: 800, textTransform: 'uppercase' }}>Available Pairs</h3>
          </div>
          
          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <div style={{ position: 'relative' }}>
              <input 
                className="neo-input"
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
                placeholder="Filter index (e.g. BTC, NEO, TSLA)..." 
                style={{ paddingLeft: '40px' }}
              />
              <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            </div>
          </div>

          <div style={{ 
            maxHeight: '480px', 
            overflowY: 'auto', 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
            gap: '8px'
          }}>
            {isLoading ? (
               <div style={{ padding: '4rem', textAlign: 'center', gridColumn: '1/-1', color: 'var(--text-muted)' }}>Syncing symbols...</div>
            ) : filteredSymbols.map(s => (
              <div key={s} style={{ padding: '0.6rem', textAlign: 'center', fontSize: '0.7rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--border-subtle)', fontWeight: 700 }}>
                {s}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 2. Custom URL Guide */}
      <section className="glass-card stagger-4" style={{ padding: '2rem', borderLeft: '4px solid var(--neo-blue)' }}>
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '12px', borderRadius: '12px' }}><Info className="text-neo-blue" size={24} /></div>
          <div>
            <h4 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.5rem' }}>Need a Custom Data Source?</h4>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', lineHeight: 1.6 }}>
              You can construct a custom request to any REST API. In the Secure Gateway, select <strong>Custom API URL</strong>. 
              Example: <code>https://api.coingecko.com/api/v3/simple/price?ids=neo&vs_currencies=usd</code>. 
              If the API requires an API Key, use the <strong>Parameter Protection</strong> tool to encrypt the <code>Authorization</code> header locally.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
