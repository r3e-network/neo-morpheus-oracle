import { appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import pkg from '@cityofzion/neon-js';
const { sc, wallet, tx, u } = pkg;

// ── Shared config ────────────────────────────────────────────────────────────
const TD_KEY = process.env.TD_KEY;
const THRESHOLD_BPS = Number(process.env.THRESHOLD_BPS || 10);
const MAX_STALE_SEC = Number(process.env.MAX_STALE_SEC || 1800);
const LOG = process.env.PUSH_LOG || '/opt/morpheus/nitro/feed-pusher.log';
const SYMBOLS = (process.env.SYMBOLS || 'NEO-USD,GAS-USD,BTC-USD,ETH-USD').split(',');
const log = (m) => { const line = `[${new Date().toISOString()}] ${m}`; try { appendFileSync(LOG, line + '\n'); } catch {} console.log(line); };

async function td(syms) {
  const t = syms.map((s) => s.replace('-', '/'));
  const r = await fetch(`https://api.twelvedata.com/price?symbol=${encodeURIComponent(t.join(','))}&apikey=${TD_KEY}`, { signal: AbortSignal.timeout(25000) });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { throw new Error('TwelveData non-JSON (HTTP ' + r.status + ')'); }
  const o = {};
  for (const s of syms) { const k = s.replace('-', '/'); const e = t.length === 1 ? j : j[k]; const v = e && e.price; if (v && !isNaN(Number(v))) o[s] = Number(v); }
  return o;
}

// ── Neo N3 (NeoVM) chain: MorpheusDataFeed, signed by the 8787 enclave updater ─
const N3_RPCS = (process.env.FEED_RPCS || 'https://mainnet1.neo.coz.io:443,https://api.n3index.dev/mainnet,https://rpc10.n3.nspcc.ru:10331').split(',').map((s) => s.trim()).filter(Boolean);
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
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(15000) });
      const text = await r.text(); let j;
      try { j = JSON.parse(text); } catch { throw new Error('non-JSON from ' + url.replace(/^https?:\/\//, '').split('/')[0]); }
      if (j.error) throw new Error(method + ': ' + JSON.stringify(j.error).slice(0, 120));
      return j.result;
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}
async function n3cur(pair) { const j = await n3rpc('invokefunction', [`0x${N3_FEED}`, 'getLatest', [{ type: 'String', value: 'TWELVEDATA:' + pair }]]); const v = j.state === 'HALT' ? j.stack && j.stack[0] && j.stack[0].value : null; return Array.isArray(v) ? { round: Number(v[1].value || 0), price: Number(v[2].value || 0) / 1e6, ts: Number(v[3].value || 0) } : { round: 0, price: 0, ts: 0 }; }
async function nitroSign(msg) { const r = await fetch(`${SIGNER}/sign/payload`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + TOKEN }, body: JSON.stringify({ role: 'updater', data_hex: msg }), signal: AbortSignal.timeout(15000) }); const j = await r.json(); if (j.status !== 'ok' || !j.signature) throw new Error('8787 sign failed'); return j.signature; }
async function n3UpdaterGas() { try { const j = await n3rpc('invokefunction', [`0x${GASH}`, 'balanceOf', [{ type: 'Hash160', value: '0x' + N3_UPDATER_SH }]]); return Number(j.stack && j.stack[0] && j.stack[0].value || 0) / 1e8; } catch { return -1; } }

async function pushNeoN3(prices, now) {
  const P = [], R = [], PX = [], TS = [], AH = [], SS = []; let skipped = 0, missing = 0;
  for (const s of SYMBOLS) {
    if (!(s in prices)) { missing++; continue; }
    const c = await n3cur(s);
    const px = Math.round(prices[s] * 1e6);
    const recent = c.round > 0 && now - c.round < MAX_STALE_SEC;
    const unchanged = c.price > 0 && (Math.abs(prices[s] - c.price) / c.price) * 10000 < THRESHOLD_BPS;
    if (recent && unchanged) { skipped++; continue; }
    const round = Math.max(c.round + 1, now), ts = Math.max(c.ts, now);
    AH.push(createHash('sha256').update(`${s}|${px}|${ts}`).digest('hex').slice(0, 32));
    P.push('TWELVEDATA:' + s); R.push(round); PX.push(px); TS.push(ts); SS.push(0);
  }
  if (!P.length) { log(`[neo-n3] no updates (skipped ${skipped}, missing ${missing})`); }
  else {
    const script = sc.createScript({ scriptHash: N3_FEED, operation: 'updateFeeds', args: [
      sc.ContractParam.array(...P.map((x) => sc.ContractParam.string(x))),
      sc.ContractParam.array(...R.map((x) => sc.ContractParam.integer(x))),
      sc.ContractParam.array(...PX.map((x) => sc.ContractParam.integer(x))),
      sc.ContractParam.array(...TS.map((x) => sc.ContractParam.integer(x))),
      sc.ContractParam.array(...AH.map((x) => sc.ContractParam.byteArray(x))),
      sc.ContractParam.array(...SS.map((x) => sc.ContractParam.integer(x))) ] });
    const count = await n3rpc('getblockcount', []);
    const txn = new tx.Transaction({ signers: [{ account: N3_UPDATER_SH, scopes: tx.WitnessScope.CalledByEntry }], validUntilBlock: count + 500, script });
    const inv = await n3rpc('invokescript', [u.HexString.fromHex(script).toBase64(), [{ account: '0x' + N3_UPDATER_SH, scopes: 'CalledByEntry' }]]);
    if (inv.state !== 'HALT') { log('[neo-n3] invokescript FAULT (skip cycle): ' + inv.exception); return; }
    txn.systemFee = u.BigInteger.fromNumber(inv.gasconsumed);
    const verif = wallet.getVerificationScriptFromPublicKey(N3_UPDATER_PUB);
    txn.witnesses = [new tx.Witness({ invocationScript: '0c40' + '00'.repeat(64), verificationScript: verif })];
    const nf = await n3rpc('calculatenetworkfee', [u.HexString.fromHex(txn.serialize(true)).toBase64()]); txn.networkFee = u.BigInteger.fromNumber(nf.networkfee); txn.witnesses = [];
    const sig = await nitroSign(txn.getMessageForSigning(N3_MAGIC));
    txn.witnesses = [tx.Witness.fromSignature(sig, N3_UPDATER_PUB)];
    const res = await n3rpc('sendrawtransaction', [u.HexString.fromHex(txn.serialize(true)).toBase64()]);
    log(`[neo-n3] pushed ${P.length} pairs (skipped ${skipped}, missing ${missing}), fee ${(Number(txn.systemFee.toString()) / 1e8 + Number(txn.networkFee.toString()) / 1e8).toFixed(5)} GAS, txid ${res && res.hash}`);
  }
  const g = await n3UpdaterGas(); if (g >= 0 && g < N3_GAS_WARN) log(`[neo-n3] ⚠️ LOW GAS: updater ${g.toFixed(3)} < ${N3_GAS_WARN} — refund 0x${N3_UPDATER_SH}`);
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
const NEOX_SYMBOLS = (process.env.NEOX_SYMBOLS || process.env.SYMBOLS || 'NEO-USD,GAS-USD,BTC-USD,ETH-USD')
  .split(',').map((s) => s.trim()).filter(Boolean);
const NEOX_ABI = [
  'function updateFeeds(string[] symbols, uint256[] prices, uint256[] timestamps, uint256[] roundIds) external',
  'function getLatest(string symbol) view returns (uint256 price, uint256 timestamp, uint256 roundId, bool exists)',
];

async function pushNeoX(prices, now) {
  const { ethers } = await import('ethers'); // lazy: only when NeoX enabled
  const provider = new ethers.JsonRpcProvider(NEOX_RPC, NEOX_CHAIN_ID);
  const wallet2 = new ethers.Wallet(NEOX_PK, provider);
  const c = new ethers.Contract(NEOX_FEED, NEOX_ABI, wallet2);
  const syms = [], px = [], ts = [], rounds = []; let skipped = 0, missing = 0;
  for (const s of NEOX_SYMBOLS) {
    if (!(s in prices)) { missing++; continue; }
    let cur; try { cur = await c.getLatest('TWELVEDATA:' + s); } catch { cur = [0n, 0n, 0n, false]; }
    const curPrice = Number(cur[0]) / 1e6, curRound = Number(cur[2]);
    const recent = curRound > 0 && now - curRound < MAX_STALE_SEC;
    const unchanged = curPrice > 0 && (Math.abs(prices[s] - curPrice) / curPrice) * 10000 < THRESHOLD_BPS;
    if (recent && unchanged) { skipped++; continue; }
    syms.push('TWELVEDATA:' + s); px.push(BigInt(Math.round(prices[s] * 1e6))); ts.push(BigInt(now)); rounds.push(BigInt(Math.max(curRound + 1, now)));
  }
  if (!syms.length) { log(`[neox] no updates (skipped ${skipped}, missing ${missing})`); }
  else {
    const tx2 = await c.updateFeeds(syms, px, ts, rounds);
    const rc = await tx2.wait();
    log(`[neox] pushed ${syms.length} pairs (skipped ${skipped}, missing ${missing}), gasUsed ${rc.gasUsed.toString()}, tx ${tx2.hash}`);
  }
  const bal = Number(ethers.formatEther(await provider.getBalance(wallet2.address)));
  if (bal < NEOX_GAS_WARN) log(`[neox] ⚠️ LOW GAS: updater ${wallet2.address} ${bal.toFixed(3)} < ${NEOX_GAS_WARN} — fund it`);
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

(async () => {
  const now = Math.floor(Date.now() / 1000);
  // Fetch only the prices the enabled chains actually need (each chain pushes its
  // own symbol list). Per-chain timers scope a run to one chain, so the neox unit
  // only fetches its crypto-only subset — saving both EVM gas and TwelveData quota.
  const fetchSet = [...new Set(CHAINS.filter((c) => c.enabled).flatMap((c) => c.symbols))];
  if (!fetchSet.length) { log('no enabled chains/symbols (nothing to fetch)'); return; }
  let prices; try { prices = await td(fetchSet); } catch (e) { log('TD fetch error (skip cycle): ' + e.message); return; }
  for (const chain of CHAINS) {
    if (!chain.enabled) continue;
    try { await chain.push(prices, now); } catch (e) { log(`[${chain.name}] push error (recovers next cycle): ${e.message}`); }
  }
})().catch((e) => { log('FATAL (recovers next cycle): ' + e.message); process.exitCode = 1; });
