"use client";

import { LineChart, Zap, Clock, Database, Code2 } from "lucide-react";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { DEFAULT_FEED_SYMBOLS, getAllFeedDescriptors, getFeedDisplaySymbol } from "@/lib/feed-defaults";

export default function DocsDatafeeds() {
  const descriptors = getAllFeedDescriptors();
  return (
    <div className="fade-in">
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "1rem" }}>
        <LineChart size={14} color="var(--neo-green)" />
        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)' }}>CORE SERVICE v1.0.2</span>
      </div>
      <h1>Data Matrix</h1>

      <p>
        Morpheus Data Matrix provides high-frequency, TEE-verified price feeds synchronized directly to Neo N3 mainnet. These feeds are designed for synchronous consumption by DeFi protocols, lending platforms, algorithmic strategies, and FX / commodity aware contracts.
      </p>

      <h2>Operational Architecture</h2>
      <p>
        Unlike the request-callback Oracle model, Datafeeds are <strong>pre-synchronized</strong> state. They operate on an automated operator pipeline:
      </p>
      <ol>
        <li>Prover network nodes fetch multi-source quotes inside the TEE.</li>
        <li>Price normalization and aggregation occur in hardware-protected memory.</li>
        <li>The TEE signs the consolidated update.</li>
        <li>The Relayer pushes the update to the on-chain <code>MorpheusDataFeed</code> registry.</li>
      </ol>

      <h2>Supported Assets</h2>
      <div style={{ padding: '1.5rem', background: '#000', border: '1px solid var(--border-dim)', borderRadius: '4px', marginBottom: '2.5rem' }}>
        <p style={{ fontSize: '0.85rem', marginBottom: '1rem', fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Configured Default Pair Catalog ({DEFAULT_FEED_SYMBOLS.length})</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {DEFAULT_FEED_SYMBOLS.map((pair) => (
            <span key={pair} className="badge-outline" style={{ color: 'var(--neo-green)', fontSize: '0.7rem', padding: '0.3rem 0.6rem', border: '1px solid rgba(0,255,163,0.3)', background: 'rgba(0,255,163,0.05)' }}>{getFeedDisplaySymbol(pair)}</span>
          ))}
        </div>
      </div>

      <h2>Data Storage Format</h2>
      <p>
        All prices are stored as <strong>Integer Cents</strong> (USD) with two fixed decimal places. 
      </p>
      <ul>
        <li>A price of <code>$12.50</code> is stored as <code>1250</code>.</li>
        <li>A price of <code>$65,000.00</code> is stored as <code>6500000</code>.</li>
        <li><code>1000FLM-USD</code> is tracked as a <code>1000 FLM</code> basket so sub-cent token pricing still remains representable in integer cents.</li>
        <li><code>1000JPY-USD</code> is tracked as a <code>1000 JPY</code> basket because a single JPY is far below one USD cent.</li>
        <li>For very small USD-denominated assets, pair-level scaling metadata can promote the stored unit to <code>1000</code> or <code>10000</code> underlying units while keeping the on-chain value as integer cents.</li>
      </ul>

      <h2>Canonical Pair Meanings</h2>
      <p>
        Contracts and users should use the pair names exactly as written below. Scaled names such as <code>1000FLM-USD</code> and <code>1000JPY-USD</code> are the canonical identifiers, not just display aliases.
      </p>

      <div className="card-industrial" style={{ padding: '1.5rem', borderLeft: '4px solid #f59e0b', marginBottom: '2rem' }}>
        <h4 style={{ marginTop: 0, marginBottom: '0.75rem', color: '#fff', fontSize: '0.95rem', fontWeight: 800 }}>Deprecated Legacy Key</h4>
        <p style={{ marginBottom: 0, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          The chain still contains the historical key <code>TWELVEDATA:FLM-USD</code>. Treat it as <strong>deprecated</strong>.
          New integrations must use <code>TWELVEDATA:1000FLM-USD</code> on-chain and <code>1000FLM-USD</code> in user-facing configs, docs, and contracts.
        </p>
      </div>

      <div style={{ border: '1px solid var(--border-dim)', borderRadius: '4px', overflow: 'hidden', background: '#000', marginBottom: '2.5rem' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-dim)', background: 'rgba(255,255,255,0.02)' }}>
                <th style={{ padding: '0.9rem 1rem', textAlign: 'left' }}>Pair</th>
                <th style={{ padding: '0.9rem 1rem', textAlign: 'left' }}>Category</th>
                <th style={{ padding: '0.9rem 1rem', textAlign: 'left' }}>Meaning</th>
                <th style={{ padding: '0.9rem 1rem', textAlign: 'left' }}>TwelveData Symbol</th>
                <th style={{ padding: '0.9rem 1rem', textAlign: 'left' }}>On-Chain Unit</th>
              </tr>
            </thead>
            <tbody>
              {descriptors.map((item) => (
                <tr key={item.pair} style={{ borderBottom: '1px solid var(--border-dim)' }}>
                  <td style={{ padding: '0.85rem 1rem', fontFamily: 'var(--font-mono)', color: '#fff' }}>{item.pair}</td>
                  <td style={{ padding: '0.85rem 1rem', color: 'var(--text-secondary)' }}>{item.category}</td>
                  <td style={{ padding: '0.85rem 1rem', color: 'var(--text-secondary)' }}>
                    <div>{item.meaning}</div>
                    {item.note && <div style={{ fontSize: '0.74rem', marginTop: '0.3rem', color: 'var(--text-muted)' }}>{item.note}</div>}
                  </td>
                  <td style={{ padding: '0.85rem 1rem', fontFamily: 'var(--font-mono)', color: '#fff' }}>{item.sourceSymbol}</td>
                  <td style={{ padding: '0.85rem 1rem', color: 'var(--text-secondary)' }}>{item.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <h2>Contract Integration</h2>
      <h3>Neo N3 (C#)</h3>
      <p>
        Use the contract hash <code>0x03013f49c42a14546c8bbe58f9d434c3517fccab</code> or resolve the NeoNS alias <code>pricefeed.morpheus.neo</code> to the same script hash.
      </p>
      
      <CodeBlock
        language="csharp"
        title="Direct Read on N3"
        code={`// Read the latest verified price from contract storage
public static void CheckLiquidation() {
    object[] record = (object[])Contract.Call(
        DataFeedHash,
        "getLatest",
        CallFlags.ReadOnly,
        "TWELVEDATA:NEO-USD"
    );
    
    BigInteger priceCents = (BigInteger)record[2];
    BigInteger lastUpdate = (BigInteger)record[3];
    
    // Process logic...
}`}
      />

      <h3>Neo X (Solidity)</h3>
      <p>
        Neo X contract publication is still pending. The reference interface below shows the intended read shape once the live registry is published.
      </p>
      <CodeBlock
        language="solidity"
        title="Reference Read on Neo X"
        code={`// IMorpheusDataFeedX interface
function checkPrice(string memory pair) public view returns (int256) {
    (int256 price, uint256 timestamp) = dataFeed.latestPrice(pair);
    require(block.timestamp - timestamp < 3600, "Price too stale");
    return price;
}`}
      />

      <div className="card-industrial" style={{ marginTop: '4rem', padding: '2rem', borderLeft: '4px solid var(--accent-blue)' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
          <Clock size={20} color="var(--accent-blue)" />
          <h4 style={{ fontSize: '1rem', fontWeight: 800, margin: 0, color: '#fff' }}>Sync Cycles</h4>
        </div>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: 0 }}>
          Mainnet feeds are automatically scanned every <strong>15 seconds</strong>. Only pairs whose observed price has moved by at least <strong>0.1%</strong> are submitted on-chain, and all qualifying pairs are batched into a single <code>updateFeeds</code> transaction. Newly configured pairs appear in this catalog immediately in the frontend, then become readable on-chain after the next successful sync/update cycle.
        </p>
      </div>
    </div>
  );
}
