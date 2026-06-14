import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import pkg from '@cityofzion/neon-js';
const { sc, wallet, tx, u } = pkg;

// ── Shared config ────────────────────────────────────────────────────────────
const TD_KEY = process.env.TD_KEY;
const THRESHOLD_BPS = Number(process.env.THRESHOLD_BPS || 10);
const MAX_STALE_SEC = Number(process.env.MAX_STALE_SEC || 1800);
// Price-sanity guard: reject a candidate price that deviates from the existing
// on-chain price by more than MAX_DEVIATION_BPS (default 5000 = 50%). A zero or
// absurd source quote (TwelveData glitch, half-populated batch) would otherwise
// be signed straight onto the feed every chain consumes. Set the admin-override
// env to 0 to bypass for a genuine flash move (e.g. a real >50% candle).
const MAX_DEVIATION_BPS = Number(process.env.MAX_DEVIATION_BPS || 5000);
const LOG = process.env.PUSH_LOG || '/opt/morpheus/nitro/feed-pusher.log';
const SYMBOLS = (process.env.SYMBOLS || 'NEO-USD,GAS-USD,BTC-USD,ETH-USD').split(',');
// Consecutive-cycle missing-symbol alerting: each oneshot cycle persists the
// per-symbol miss counters here so a symbol TwelveData stopped serving raises
// an explicit ALERT line (picked up by log monitoring) instead of silently
// counting as "missing N" forever.
const MISSING_STATE = process.env.MISSING_STATE || '/opt/morpheus/nitro/feed-pusher-missing.json';
const MISSING_ALERT_CYCLES = Number(process.env.MISSING_ALERT_CYCLES || 3);
const log = (m) => {
  const line = `[${new Date().toISOString()}] ${m}`;
  try {
    appendFileSync(LOG, line + '\n');
  } catch {}
  console.log(line);
};

// ── Push decision core (shared by both chains, exported for tests) ───────────
// Single writer invariant: a signed batch must never regress the on-chain round
// OR timestamp. The N3 contract asserts timestamp monotonicity itself, but the
// deployed MorpheusPriceFeed.sol on Neo X only checks roundId, so the pusher is
// the sole enforcement point for timestamps there.
export function planFeedUpdate(
  cur,
  newPrice,
  now,
  {
    thresholdBps = THRESHOLD_BPS,
    maxStaleSec = MAX_STALE_SEC,
    maxDeviationBps = MAX_DEVIATION_BPS,
  } = {}
) {
  // Price-sanity guard (centralized here so it covers BOTH the N3 and EVM push
  // paths). A non-finite or non-positive candidate price is always rejected —
  // signing it would poison the feed and burn the updater's gas on a bad write.
  if (!Number.isFinite(newPrice) || newPrice <= 0) {
    return { push: false, round: cur.round, ts: cur.ts, rejected: 'invalid_price' };
  }
  // Deviation spike guard: when a valid on-chain price already exists, reject a
  // candidate that jumps more than maxDeviationBps from it. The bootstrap case
  // (cur.price<=0, no usable reference) is exempt so the very first write — or a
  // recovery after AdminResetFeed — still lands. maxDeviationBps<=0 is the admin
  // override env for a genuine flash move.
  if (cur.price > 0 && maxDeviationBps > 0) {
    const deviationBps = (Math.abs(newPrice - cur.price) / cur.price) * 10000;
    if (deviationBps > maxDeviationBps) {
      return { push: false, round: cur.round, ts: cur.ts, rejected: 'deviation_spike' };
    }
  }
  const recent = cur.round > 0 && now - cur.round < maxStaleSec;
  const unchanged =
    cur.price > 0 && (Math.abs(newPrice - cur.price) / cur.price) * 10000 < thresholdBps;
  if (recent && unchanged) return { push: false, round: cur.round, ts: cur.ts };
  return { push: true, round: Math.max(cur.round + 1, now), ts: Math.max(cur.ts, now) };
}

// FeedRecord = [Pair, RoundId, Price, Timestamp, AttestationHash, SourceSetId]
export function parseGetLatestStack(result) {
  const v =
    result && result.state === 'HALT'
      ? result.stack && result.stack[0] && result.stack[0].value
      : null;
  return Array.isArray(v)
    ? {
        round: Number(v[1].value || 0),
        price: Number(v[2].value || 0) / 1e6,
        ts: Number(v[3].value || 0),
      }
    : { round: 0, price: 0, ts: 0 };
}

// Batched read: getAllFeedRecords returns every registered FeedRecord in one
// invoke. Returns a Map keyed by the on-chain pair string (e.g.
// 'TWELVEDATA:NEO-USD') → { round, price, ts }, or null when the invoke did not
// HALT (caller falls back to per-pair getLatest). A pair absent from the map is
// simply not registered yet — same zeroed default getLatest would return.
export function parseGetAllFeedRecordsStack(result) {
  if (!result || result.state !== 'HALT') return null;
  const records =
    result.stack && result.stack[0] && Array.isArray(result.stack[0].value)
      ? result.stack[0].value
      : [];
  const byPair = new Map();
  for (const record of records) {
    const v = record && record.value;
    if (!Array.isArray(v) || v.length < 4) continue;
    const pair = Buffer.from(String(v[0].value || ''), 'base64').toString('utf8');
    if (!pair) continue;
    byPair.set(pair, {
      round: Number(v[1].value || 0),
      price: Number(v[2].value || 0) / 1e6,
      ts: Number(v[3].value || 0),
    });
  }
  return byPair;
}

// Consecutive-cycle missing-symbol tracking (pure, exported for tests): symbols
// present in `prices` reset their counter; requested-but-missing symbols
// increment it, and once a counter reaches `alertAfter` the symbol is reported
// every cycle until it recovers (or is pruned from SYMBOLS).
export function trackMissingSymbols(
  prevCounts,
  requested,
  prices,
  alertAfter = MISSING_ALERT_CYCLES
) {
  const counts = { ...(prevCounts && typeof prevCounts === 'object' ? prevCounts : {}) };
  const alerts = [];
  for (const symbol of requested) {
    if (symbol in prices) {
      delete counts[symbol];
      continue;
    }
    counts[symbol] = (Number(counts[symbol]) || 0) + 1;
    if (counts[symbol] >= alertAfter) alerts.push({ symbol, cycles: counts[symbol] });
  }
  return { counts, alerts };
}

function readMissingState() {
  try {
    const parsed = JSON.parse(readFileSync(MISSING_STATE, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeMissingState(counts) {
  try {
    writeFileSync(MISSING_STATE, JSON.stringify(counts));
  } catch {}
}

async function td(syms) {
  const t = syms.map((s) => s.replace('-', '/'));
  const r = await fetch(
    `https://api.twelvedata.com/price?symbol=${encodeURIComponent(t.join(','))}&apikey=${TD_KEY}`,
    { signal: AbortSignal.timeout(25000) }
  );
  const text = await r.text();
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error('TwelveData non-JSON (HTTP ' + r.status + ')');
  }
  const o = {};
  for (const s of syms) {
    const k = s.replace('-', '/');
    const e = t.length === 1 ? j : j[k];
    const v = e && e.price;
    const n = Number(v);
    // Drop non-positive / non-finite source quotes here so a zero or negative
    // TwelveData reading is treated as "missing" rather than a 0-priced push.
    if (v != null && Number.isFinite(n) && n > 0) o[s] = n;
  }
  return o;
}

// ── Neo N3 (NeoVM) chain: MorpheusDataFeed, signed by the 8787 enclave updater ─
const N3_RPCS = (
  process.env.FEED_RPCS ||
  'https://mainnet1.neo.coz.io:443,https://api.n3index.dev/mainnet,https://rpc10.n3.nspcc.ru:10331'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const N3_MAGIC = Number(process.env.FEED_MAGIC || 860833102);
const N3_FEED = '03013f49c42a14546c8bbe58f9d434c3517fccab';
const GASH = 'd2a4cff31913016155e38e474a2c06d08be276cf';
const N3_UPDATER_PUB = '02f63e3f618d8f6995eb85279a03361beb715d25d3b97407c73c351d26ba849744';
const N3_UPDATER_SH = '9fb28bdacfaa7fcc0a4d660d0dc990b0e7d46118';
const SIGNER = process.env.SIGNER_URL || 'http://127.0.0.1:8787';
const TOKEN = process.env.RUNTIME_TOKEN;
const N3_GAS_WARN = Number(process.env.GAS_WARN || 8);

async function n3rpc(method, params) {
  let lastErr;
  for (const url of N3_RPCS) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(15000),
      });
      const text = await r.text();
      let j;
      try {
        j = JSON.parse(text);
      } catch {
        throw new Error('non-JSON from ' + url.replace(/^https?:\/\//, '').split('/')[0]);
      }
      if (j.error) throw new Error(method + ': ' + JSON.stringify(j.error).slice(0, 120));
      return j.result;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}
async function n3cur(pair) {
  const j = await n3rpc('invokefunction', [
    `0x${N3_FEED}`,
    'getLatest',
    [{ type: 'String', value: 'TWELVEDATA:' + pair }],
  ]);
  return parseGetLatestStack(j);
}
async function nitroSign(msg) {
  const r = await fetch(`${SIGNER}/sign/payload`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + TOKEN },
    body: JSON.stringify({ role: 'updater', data_hex: msg }),
    signal: AbortSignal.timeout(15000),
  });
  const j = await r.json();
  if (j.status !== 'ok' || !j.signature) throw new Error('8787 sign failed');
  return j.signature;
}
async function n3UpdaterGas() {
  try {
    const j = await n3rpc('invokefunction', [
      `0x${GASH}`,
      'balanceOf',
      [{ type: 'Hash160', value: '0x' + N3_UPDATER_SH }],
    ]);
    return Number((j.stack && j.stack[0] && j.stack[0].value) || 0) / 1e8;
  } catch {
    return -1;
  }
}

async function pushNeoN3(prices, now) {
  const P = [],
    R = [],
    PX = [],
    TS = [],
    AH = [],
    SS = [];
  let skipped = 0,
    missing = 0;
  // Batched current-state read: one getAllFeedRecords invoke per cycle instead
  // of one getLatest per symbol. Falls back to the per-pair reads when the
  // batched invoke fails (e.g. an RPC that rejects the larger response).
  let recordMap = null;
  try {
    recordMap = parseGetAllFeedRecordsStack(
      await n3rpc('invokefunction', [`0x${N3_FEED}`, 'getAllFeedRecords', []])
    );
  } catch (e) {
    log('[neo-n3] getAllFeedRecords failed (falling back to per-pair reads): ' + e.message);
  }
  for (const s of SYMBOLS) {
    if (!(s in prices)) {
      missing++;
      continue;
    }
    const c = recordMap
      ? recordMap.get('TWELVEDATA:' + s) || { round: 0, price: 0, ts: 0 }
      : await n3cur(s);
    const px = Math.round(prices[s] * 1e6);
    const plan = planFeedUpdate(c, prices[s], now);
    if (!plan.push) {
      if (plan.rejected)
        log(
          `[neo-n3] ⚠️ rejected ${s} ${plan.rejected}: src=${prices[s]} on-chain=${c.price} (set MAX_DEVIATION_BPS=0 to override a real flash move)`
        );
      skipped++;
      continue;
    }
    const round = plan.round,
      ts = plan.ts;
    AH.push(createHash('sha256').update(`${s}|${px}|${ts}`).digest('hex').slice(0, 32));
    P.push('TWELVEDATA:' + s);
    R.push(round);
    PX.push(px);
    TS.push(ts);
    SS.push(0);
  }
  if (!P.length) {
    log(`[neo-n3] no updates (skipped ${skipped}, missing ${missing})`);
  } else {
    const script = sc.createScript({
      scriptHash: N3_FEED,
      operation: 'updateFeeds',
      args: [
        sc.ContractParam.array(...P.map((x) => sc.ContractParam.string(x))),
        sc.ContractParam.array(...R.map((x) => sc.ContractParam.integer(x))),
        sc.ContractParam.array(...PX.map((x) => sc.ContractParam.integer(x))),
        sc.ContractParam.array(...TS.map((x) => sc.ContractParam.integer(x))),
        sc.ContractParam.array(...AH.map((x) => sc.ContractParam.byteArray(x))),
        sc.ContractParam.array(...SS.map((x) => sc.ContractParam.integer(x))),
      ],
    });
    const count = await n3rpc('getblockcount', []);
    const txn = new tx.Transaction({
      signers: [{ account: N3_UPDATER_SH, scopes: tx.WitnessScope.CalledByEntry }],
      validUntilBlock: count + 500,
      script,
    });
    const inv = await n3rpc('invokescript', [
      u.HexString.fromHex(script).toBase64(),
      [{ account: '0x' + N3_UPDATER_SH, scopes: 'CalledByEntry' }],
    ]);
    if (inv.state !== 'HALT') {
      log('[neo-n3] invokescript FAULT (skip cycle): ' + inv.exception);
      return;
    }
    txn.systemFee = u.BigInteger.fromNumber(inv.gasconsumed);
    const verif = wallet.getVerificationScriptFromPublicKey(N3_UPDATER_PUB);
    txn.witnesses = [
      new tx.Witness({ invocationScript: '0c40' + '00'.repeat(64), verificationScript: verif }),
    ];
    const nf = await n3rpc('calculatenetworkfee', [
      u.HexString.fromHex(txn.serialize(true)).toBase64(),
    ]);
    txn.networkFee = u.BigInteger.fromNumber(nf.networkfee);
    txn.witnesses = [];
    const sig = await nitroSign(txn.getMessageForSigning(N3_MAGIC));
    txn.witnesses = [tx.Witness.fromSignature(sig, N3_UPDATER_PUB)];
    const res = await n3rpc('sendrawtransaction', [
      u.HexString.fromHex(txn.serialize(true)).toBase64(),
    ]);
    log(
      `[neo-n3] pushed ${P.length} pairs (skipped ${skipped}, missing ${missing}), fee ${(Number(txn.systemFee.toString()) / 1e8 + Number(txn.networkFee.toString()) / 1e8).toFixed(5)} GAS, txid ${res && res.hash}`
    );
  }
  const g = await n3UpdaterGas();
  if (g >= 0 && g < N3_GAS_WARN)
    log(
      `[neo-n3] ⚠️ LOW GAS: updater ${g.toFixed(3)} < ${N3_GAS_WARN} — refund 0x${N3_UPDATER_SH}`
    );
}

// ── Neo X (EVM) chain: MorpheusPriceFeed, signed by the configured key ─────────
const NEOX_PK = process.env.NEOX_FEED_PK;
const NEOX_RPC = process.env.NEOX_RPC || 'https://mainnet-1.rpc.banelabs.org';
const NEOX_CHAIN_ID = Number(process.env.NEOX_CHAIN_ID || 47763);
const NEOX_FEED = process.env.NEOX_FEED || '0x38DD6BCEBDD47f4234AE11760CEFB58f9ae6a3bB';
const NEOX_GAS_WARN = Number(process.env.NEOX_GAS_WARN || 5);
// Neo X pushes real EVM gas every cycle, so it runs a crypto-only subset of the
// feed by default (TradFi forex/commodity quotes are dropped to save gas). Falls
// back to the full SYMBOLS list if NEOX_SYMBOLS is unset, so behaviour is
// unchanged unless explicitly configured. Neo N3 always uses the full SYMBOLS.
const NEOX_SYMBOLS = (
  process.env.NEOX_SYMBOLS ||
  process.env.SYMBOLS ||
  'NEO-USD,GAS-USD,BTC-USD,ETH-USD'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const NEOX_ABI = [
  'function updateFeeds(string[] symbols, uint256[] prices, uint256[] timestamps, uint256[] roundIds) external',
  'function getLatest(string symbol) view returns (uint256 price, uint256 timestamp, uint256 roundId, bool exists)',
];

async function pushNeoX(prices, now) {
  const { ethers } = await import('ethers'); // lazy: only when NeoX enabled
  const provider = new ethers.JsonRpcProvider(NEOX_RPC, NEOX_CHAIN_ID);
  const wallet2 = new ethers.Wallet(NEOX_PK, provider);
  const c = new ethers.Contract(NEOX_FEED, NEOX_ABI, wallet2);
  const syms = [],
    px = [],
    ts = [],
    rounds = [];
  let skipped = 0,
    missing = 0;
  // Batched current-state reads: the per-symbol getLatest calls are independent
  // eth_call reads, so issue them in parallel (the symbol list is small and
  // bounded). Each read keeps its own zeroed-record fallback, and the results
  // are consumed in symbol order so the planned batch matches the sequential
  // path exactly.
  const reads = await Promise.all(
    NEOX_SYMBOLS.map(async (s) => {
      if (!(s in prices)) return { s, missing: true };
      let cur;
      try {
        cur = await c.getLatest('TWELVEDATA:' + s);
      } catch {
        cur = [0n, 0n, 0n, false];
      }
      return { s, cur };
    })
  );
  for (const read of reads) {
    if (read.missing) {
      missing++;
      continue;
    }
    const { s, cur } = read;
    // getLatest returns (price, timestamp, roundId, exists)
    const onChainPrice = Number(cur[0]) / 1e6;
    const plan = planFeedUpdate(
      { round: Number(cur[2]), price: onChainPrice, ts: Number(cur[1]) },
      prices[s],
      now
    );
    if (!plan.push) {
      if (plan.rejected)
        log(
          `[neox] ⚠️ rejected ${s} ${plan.rejected}: src=${prices[s]} on-chain=${onChainPrice} (set MAX_DEVIATION_BPS=0 to override a real flash move)`
        );
      skipped++;
      continue;
    }
    syms.push('TWELVEDATA:' + s);
    px.push(BigInt(Math.round(prices[s] * 1e6)));
    ts.push(BigInt(plan.ts));
    rounds.push(BigInt(plan.round));
  }
  if (!syms.length) {
    log(`[neox] no updates (skipped ${skipped}, missing ${missing})`);
  } else {
    const tx2 = await c.updateFeeds(syms, px, ts, rounds);
    const rc = await tx2.wait();
    log(
      `[neox] pushed ${syms.length} pairs (skipped ${skipped}, missing ${missing}), gasUsed ${rc.gasUsed.toString()}, tx ${tx2.hash}`
    );
  }
  const bal = Number(ethers.formatEther(await provider.getBalance(wallet2.address)));
  if (bal < NEOX_GAS_WARN)
    log(
      `[neox] ⚠️ LOW GAS: updater ${wallet2.address} ${bal.toFixed(3)} < ${NEOX_GAS_WARN} — fund it`
    );
}

// ── Multi-chain main loop ─────────────────────────────────────────────────────
// FEED_CHAINS (comma list) scopes a run to specific chains so each chain can run
// on its own timer cadence (e.g. neox every 2m, neo-n3 every 5m). Unset = all.
const FEED_CHAINS = (process.env.FEED_CHAINS || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const CHAINS = [
  { name: 'neo-n3', enabled: true, symbols: SYMBOLS, push: pushNeoN3 },
  { name: 'neox', enabled: !!NEOX_PK, symbols: NEOX_SYMBOLS, push: pushNeoX },
].filter((c) => FEED_CHAINS.length === 0 || FEED_CHAINS.includes(c.name));

// FEED_PUSHER_SKIP_MAIN=1 lets tests import planFeedUpdate/parseGetLatestStack
// without running a live push cycle; the systemd entrypoint never sets it, so
// `node feed-pusher.mjs` behaves exactly as before.
if (process.env.FEED_PUSHER_SKIP_MAIN !== '1') {
  (async () => {
    const now = Math.floor(Date.now() / 1000);
    // Fetch only the prices the enabled chains actually need (each chain pushes its
    // own symbol list). Per-chain timers scope a run to one chain, so the neox unit
    // only fetches its crypto-only subset — saving both EVM gas and TwelveData quota.
    const fetchSet = [...new Set(CHAINS.filter((c) => c.enabled).flatMap((c) => c.symbols))];
    if (!fetchSet.length) {
      log('no enabled chains/symbols (nothing to fetch)');
      return;
    }
    let prices;
    try {
      prices = await td(fetchSet);
    } catch (e) {
      log('TD fetch error (skip cycle): ' + e.message);
      return;
    }
    // Consecutive-cycle missing-symbol alerting: only symbols this run actually
    // requested are counted (per-chain timer units leave the other chain's
    // counters untouched). A TD outage skips the cycle above, so misses here
    // mean TwelveData answered without that symbol.
    const { counts, alerts } = trackMissingSymbols(readMissingState(), fetchSet, prices);
    writeMissingState(counts);
    for (const alert of alerts) {
      log(
        `⚠️ ALERT: ${alert.symbol} missing from TwelveData for ${alert.cycles} consecutive cycles — prune it from SYMBOLS or fix the feed`
      );
    }
    for (const chain of CHAINS) {
      if (!chain.enabled) continue;
      try {
        await chain.push(prices, now);
      } catch (e) {
        log(`[${chain.name}] push error (recovers next cycle): ${e.message}`);
      }
    }
  })().catch((e) => {
    log('FATAL (recovers next cycle): ' + e.message);
    process.exitCode = 1;
  });
}
