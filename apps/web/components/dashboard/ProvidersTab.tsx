"use client";

import { useEffect, useState } from "react";
import { Database, Search, ShieldCheck, Zap, Activity, Info } from "lucide-react";

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
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      <div className="glass-card neo-card stagger-1" style={{ padding: '2.5rem' }}>
        <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '1rem' }}>Decentralized Data Catalog</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: '1.1rem', maxWidth: '800px' }}>
          Morpheus provides native adapters for industry-leading data sources. All retrievals are verified via TEE attestation to ensure data integrity and source authenticity.
        </p>
      </div>

      <div className="grid grid-2">
        <div className="stagger-2">
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.5rem', color: 'var(--text-muted)' }}>SUPPORTED ADAPTERS</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {providers.map((p) => (
              <div key={p.id} className="glass-card" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                     <Zap size={18} className="text-neo" />
                     <span style={{ fontWeight: 800, fontSize: '1.1rem' }}>{p.id.toUpperCase()}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {p.supports?.map((s: string) => (
                      <span key={s} className="badge badge-green" style={{ fontSize: '0.6rem' }}>{s}</span>
                    ))}
                  </div>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '1.25rem' }}>{p.description}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <span>Auth: <span style={{ color: '#fff' }}>{p.auth === 'none' ? 'Public' : 'Encrypted Key'}</span></span>
                  <span>Trust: <span style={{ color: 'var(--neo-green)' }}>Verified TEE</span></span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card stagger-3" style={{ padding: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}>
             <Activity size={18} className="text-purple" />
             <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>STANDARD FEED PAIRS</h3>
          </div>
          
          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <div style={{ position: 'relative' }}>
              <input 
                className="neo-input"
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
                placeholder="Search index (e.g. BTC, NEO)..." 
                style={{ paddingLeft: '40px' }}
              />
              <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            </div>
          </div>

          <div style={{ 
            maxHeight: '440px', 
            overflowY: 'auto', 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
            gap: '10px'
          }}>
            {isLoading ? (
               <div style={{ padding: '4rem', textAlign: 'center', gridColumn: '1/-1', color: 'var(--text-muted)' }}>Loading pairs...</div>
            ) : filteredSymbols.map(s => (
              <div key={s} style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '0.5rem', border: '1px solid var(--border-subtle)' }}>
                {s}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
