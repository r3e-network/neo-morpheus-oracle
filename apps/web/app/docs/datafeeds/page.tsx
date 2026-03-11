"use client";

import { LineChart, Zap, Clock, Database, Code2 } from "lucide-react";
import { CodeBlock } from "@/components/ui/CodeBlock";

export default function DocsDatafeeds() {
  return (
    <div className="fade-in">
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "1rem" }}>
        <LineChart size={14} color="var(--neo-green)" />
        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)' }}>CORE SERVICE v1.0.2</span>
      </div>
      <h1>Data Matrix</h1>

      <p>
        Morpheus Data Matrix provides high-frequency, TEE-verified price feeds synchronized directly to Neo N3 and Neo X. These feeds are designed for synchronous consumption by DeFi protocols, lending platforms, and algorithmic traders.
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
      <h2>Supported Assets</h2>
      <div style={{ padding: '1.5rem', background: '#000', border: '1px solid var(--border-dim)', borderRadius: '4px', marginBottom: '2.5rem' }}>
        <p style={{ fontSize: '0.85rem', marginBottom: '1rem', fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Mainnet Pairs (14+)</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {["NEO-USD", "GAS-USD", "1000FLM-USD", "BTC-USD", "ETH-USD", "SOL-USD", "BNB-USD", "USDT-USD", "USDC-USD"].map(pair => (
            <span key={pair} className="badge-outline" style={{ color: 'var(--neo-green)', fontSize: '0.7rem', padding: '0.3rem 0.6rem', border: '1px solid rgba(0,255,163,0.3)', background: 'rgba(0,255,163,0.05)' }}>{pair}</span>
          ))}
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '0 0.5rem' }}>+ more endpoints</span>
        </div>
      </div>

      <h2>Data Storage Format</h2>
      <p>
        All prices are stored as <strong>Integer Cents</strong> (USD) with two fixed decimal places. 
      </p>
      <ul>
        <li>A price of <code>$12.50</code> is stored as <code>1250</code>.</li>
        <li>A price of <code>$65,000.00</code> is stored as <code>6500000</code>.</li>
        <li><code>FLM-USD</code> is tracked as a <code>1000 FLM</code> basket so sub-cent token pricing still remains representable in integer cents.</li>
      </ul>

      <h2>Contract Integration</h2>
      <h3>Neo N3 (C#)</h3>
      <p>
        Use the contract hash <code>0x03013f49c42a14546c8bbe58f9d434c3517fccab</code> or resolve the NeoNS alias
        <code> pricefeed.morpheus.neo </code> to the same script hash.
      </p>
      
      <CodeBlock
        language="csharp"
        title="Direct Read on N3"
        code={`// Read the latest verified price from contract storage
public static void CheckLiquidation() {
    var record = (Map)Contract.Call(DataFeedHash, "getLatestPrice", CallFlags.ReadOnly, "NEO-USD");
    
    BigInteger price = (BigInteger)record["price"];
    uint lastUpdate = (uint)record["timestamp"];
    
    // Process logic...
}`}
      />

      <h3>Neo X (Solidity)</h3>
      <CodeBlock
        language="solidity"
        title="Direct Read on Neo X"
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
          Mainnet feeds are automatically scanned every <strong>15 seconds</strong>. Only pairs whose observed price has moved by at least <strong>0.1%</strong> are submitted on-chain, and all qualifying pairs are batched into a single <code>updateFeeds</code> transaction.
        </p>
      </div>
    </div>
  );
}
