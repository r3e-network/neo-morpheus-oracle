import { appendFileSync, writeFileSync } from 'node:fs';
const RPCS = (
  process.env.FEED_RPCS ||
  'https://api.n3index.dev/mainnet,https://rpc10.n3.nspcc.ru:10331,https://mainnet1.neo.coz.io:443'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const FEED = '0x03013f49c42a14546c8bbe58f9d434c3517fccab',
  UPDATER = '0x9fb28bdacfaa7fcc0a4d660d0dc990b0e7d46118',
  GASH = '0xd2a4cff31913016155e38e474a2c06d08be276cf';
// Alert only on GENUINE staleness, i.e. above the pusher's own force-refresh
// interval (MAX_STALE_SEC) plus margin. A flat symbol legitimately ages up to
// MAX_STALE_SEC + a push cycle before its scheduled refresh, so a tighter
// threshold (the old 1200s) false-alarms whenever the price simply hasn't moved.
const STALE_REFRESH = Number(process.env.MAX_STALE_SEC || 1800);
const MAX_AGE = Number(process.env.MAX_AGE_SEC || STALE_REFRESH + 900),
  MIN_GAS = Number(process.env.MIN_GAS || 12);
const LOG = process.env.MONITOR_LOG || '/opt/morpheus/nitro/feed-monitor.log',
  STATUS = process.env.MONITOR_STATUS || '/opt/morpheus/nitro/feed-status.json';
const log = (m) => {
  const l = `[${new Date().toISOString()}] ${m}`;
  try {
    appendFileSync(LOG, l + '\n');
  } catch {}
  console.log(l);
};
async function rpc(m, p) {
  let last;
  for (const url of RPCS) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: m, params: p }),
        signal: AbortSignal.timeout(12000),
      });
      const t = await r.text();
      let j;
      try {
        j = JSON.parse(t);
      } catch {
        throw new Error('non-JSON');
      }
      if (j.error) throw new Error('rpcerr');
      return j.result;
    } catch (e) {
      last = e;
    }
  }
  throw last;
}
const now = Math.floor(Date.now() / 1000);
const problems = [];
try {
  const j = await rpc('invokefunction', [
    FEED,
    'getLatest',
    [{ type: 'String', value: 'TWELVEDATA:NEO-USD' }],
  ]);
  // FeedRecord = [Pair, RoundId, Price, Timestamp, AttestationHash, SourceSetId]:
  // age comes from Timestamp (v[3]); RoundId only coincidentally tracks time for
  // the current pusher (round = max(cur+1, now)) and is a plain counter elsewhere.
  const v = j.stack[0].value;
  const age = now - Number(v[3].value);
  if (age > MAX_AGE) problems.push(`FEED STALE NEO-USD age=${(age / 60).toFixed(0)}min`);
  const g = await rpc('invokefunction', [GASH, 'balanceOf', [{ type: 'Hash160', value: UPDATER }]]);
  const gas = Number(g.stack[0].value) / 1e8;
  if (gas < MIN_GAS) problems.push(`LOW GAS updater=${gas.toFixed(1)} (refund ${UPDATER})`);
  writeFileSync(
    STATUS,
    JSON.stringify(
      {
        ts: new Date().toISOString(),
        feed_age_min: Math.round(age / 60),
        updater_gas: gas,
        ok: problems.length === 0,
        problems,
      },
      null,
      2
    )
  );
  if (problems.length) {
    log('ALERT: ' + problems.join(' | '));
    process.exit(1);
  }
  log(`ok feed_age=${Math.round(age / 60)}min gas=${gas.toFixed(1)}`);
} catch (e) {
  log('monitor RPC error: ' + (e.message || e));
  process.exit(2);
}
