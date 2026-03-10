export default function DocsDatafeeds() {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "1rem" }}>
        <span className="badge badge-success">Service</span>
      </div>
      <h1>Data Feeds</h1>

      <p>
        Morpheus datafeeds are synchronized on-chain price records for Neo N3 and Neo X. They are intended for
        synchronous smart-contract reads after the operator pipeline has already pushed the latest market data on-chain.
      </p>

      <h2>Operational Model</h2>
      <p>
        Datafeeds are <strong>operator-only</strong>. End users and dApps should <strong>not</strong> submit
        <code>datafeed</code> requests through the Oracle contract. Instead:
      </p>
      <ol>
        <li>The worker fetches a provider quote inside the TEE.</li>
        <li>The operator relays the normalized record to the on-chain datafeed contract.</li>
        <li>User contracts read the stored record directly from chain state.</li>
      </ol>

      <h2>Storage Format</h2>
      <p>
        Every provider is stored independently as <code>PROVIDER:PAIR</code>, for example
        <code>TWELVEDATA:NEO-USD</code>.
      </p>
      <p>
        Prices are stored as <strong>integer cents</strong> with exactly two decimals of precision:
      </p>
      <ul>
        <li><code>1.00</code> is stored as <code>100</code>.</li>
        <li><code>1.02</code> is stored as <code>102</code>.</li>
        <li>Anything beyond cents is truncated before storage.</li>
      </ul>

      <h2>What Contracts Can Read</h2>
      <p>Both Neo N3 and Neo X datafeed contracts expose list and point-read methods:</p>
      <ul>
        <li>Latest record for a pair</li>
        <li>Total pair count</li>
        <li>Pair by index</li>
        <li>All stored pairs</li>
        <li>All feed records</li>
      </ul>

      <h2>Neo N3 Example</h2>
      <pre><code>{`var record = (object[])Contract.Call(
    dataFeedHash,
    "getLatest",
    CallFlags.ReadOnly,
    "TWELVEDATA:NEO-USD"
);

string pair = (string)record[0];
BigInteger roundId = (BigInteger)record[1];
BigInteger priceCents = (BigInteger)record[2];
BigInteger timestamp = (BigInteger)record[3];`}</code></pre>

      <h2>Neo X Example</h2>
      <pre><code>{`IMorpheusDataFeedX.FeedRecord memory record = feed.getLatest("TWELVEDATA:NEO-USD");
uint256 priceCents = record.price;
uint256 timestamp = record.timestamp;`}</code></pre>

      <blockquote>
        User-triggered Oracle requests return via callback. Datafeeds do not. They are pre-synchronized state that your
        contracts read directly.
      </blockquote>
    </>
  );
}
