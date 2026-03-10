"use client";

import { useEffect, useState } from "react";
import { Database, Search, Zap, Activity, ExternalLink, Info, Globe, Filter } from "lucide-react";
import { DEFAULT_PAIRS } from "@/lib/onchain-data";

interface ProvidersTabProps {
  providers: any[];
}

export function ProvidersTab({ providers }: ProvidersTabProps) {
  const [symbols, setSymbols] = useState<string[]>(DEFAULT_PAIRS);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/feeds/catalog");
        const body = await res.json();
        if (Array.isArray(body.pairs) && body.pairs.length > 0) {
          setSymbols(body.pairs.sort());
        }
      } catch (err) {
        console.error("Failed to load symbols, using defaults", err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const filteredSymbols = symbols.filter(s => {
    const normalizedS = s.toLowerCase();
    const normalizedTerm = searchTerm.toLowerCase();
    return normalizedS.includes(normalizedTerm) || normalizedS.replace('-', '').includes(normalizedTerm);
  });

  return (
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid var(--border-dim)', paddingBottom: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.03em', marginBottom: '0.5rem' }}>Data Catalog</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Explore native adapters and indexable price pairs.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <a href="https://twelvedata.com/stocks" target="_blank" className="btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
            <Globe size={14} /> EXPLORE TWELVEDATA
          </a>
        </div>
      </div>

      <div className="grid grid-2" style={{ gap: '2rem' }}>
        <div className="card-industrial stagger-1" style={{ padding: '0' }}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-dim)', background: 'rgba(255,255,255,0.02)' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
              <Zap className="text-neo" size={16} /> Built-in Adapters
            </h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '500px', overflowY: 'auto' }}>
            {providers.map((p) => (
              <div key={p.id} style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-dim)', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,255,163,0.02)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <span style={{ fontWeight: 800, fontSize: '1rem', color: '#fff', fontFamily: 'var(--font-mono)' }}>{p.id.toUpperCase()}</span>
                  <div className="badge-outline" style={{ color: 'var(--neo-green)', borderColor: 'var(--neo-green)' }}>NATIVE</div>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.6 }}>{p.description}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', fontFamily: 'var(--font-mono)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>SUPPORT: <span style={{ color: '#fff' }}>{p.supports?.join(', ')}</span></span>
                  <span style={{ color: 'var(--text-muted)' }}>AUTH: <span style={{ color: '#fff' }}>{p.auth === 'none' ? 'Public' : 'Encrypted Key'}</span></span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card-industrial stagger-2" style={{ padding: '0', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-dim)', background: 'rgba(255,255,255,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
               <Activity className="text-accent-blue" size={16} /> Available Pairs ({symbols.length})
            </h3>
            <Filter size={14} color="var(--text-muted)" />
          </div>
          
          <div style={{ padding: '1.5rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <div style={{ position: 'relative' }}>
                <input 
                  className="neo-input"
                  value={searchTerm} 
                  onChange={(e) => setSearchTerm(e.target.value)} 
                  placeholder="Search index (e.g. BTC, NEO)..." 
                  style={{ paddingLeft: '40px', background: '#000' }}
                />
                <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              </div>
            </div>

            <div style={{ 
              maxHeight: '380px', 
              overflowY: 'auto', 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
              gap: '8px',
              alignContent: 'start'
            }}>
              {isLoading ? (
                 <div style={{ padding: '4rem', textAlign: 'center', gridColumn: '1/-1', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>SYNCING...</div>
              ) : filteredSymbols.map(s => (
                <div key={s} style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.75rem', background: '#000', border: '1px solid var(--border-dim)', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', transition: 'all 0.2s', cursor: 'default' }} onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--neo-green)'; e.currentTarget.style.color = '#fff'; }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-dim)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}>
                  {s}
                </div>
              ))}
              {!isLoading && filteredSymbols.length === 0 && (
                <div style={{ gridColumn: '1/-1', padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                  NO MATCHES FOUND
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <section className="card-industrial stagger-3" style={{ padding: '2rem', borderLeft: '4px solid var(--accent-blue)', background: 'linear-gradient(90deg, rgba(59, 130, 246, 0.05) 0%, transparent 50%)' }}>
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
          <Info color="var(--accent-blue)" size={24} style={{ flexShrink: 0 }} />
          <div>
            <h4 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.5rem' }}>Custom URL Construction</h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
              Morpheus is not limited to the pairs listed above. You can query any REST API via the <strong>Custom URL</strong> mode. 
              Always encrypt authorization headers locally in the <strong>Data Sealing</strong> tab before transmission.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
