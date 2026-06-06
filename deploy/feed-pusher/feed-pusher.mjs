import { appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import pkg from '@cityofzion/neon-js';
const { sc, wallet, tx, u } = pkg;
const RPCS = (process.env.FEED_RPCS || 'https://mainnet1.neo.coz.io:443,https://api.n3index.dev/mainnet,https://rpc10.n3.nspcc.ru:10331').split(',').map(s=>s.trim()).filter(Boolean);
const MAGIC = Number(process.env.FEED_MAGIC || 860833102);
const FEED = '03013f49c42a14546c8bbe58f9d434c3517fccab';
const GASH = 'd2a4cff31913016155e38e474a2c06d08be276cf';
const UPDATER_PUB = '02f63e3f618d8f6995eb85279a03361beb715d25d3b97407c73c351d26ba849744';
const UPDATER_SH = '9fb28bdacfaa7fcc0a4d660d0dc990b0e7d46118';
const SIGNER = process.env.SIGNER_URL || 'http://127.0.0.1:8787';
const TD_KEY = process.env.TD_KEY;
const TOKEN = process.env.RUNTIME_TOKEN;
const THRESHOLD_BPS = Number(process.env.THRESHOLD_BPS || 10);
const MAX_STALE_SEC = Number(process.env.MAX_STALE_SEC || 1800);
const GAS_WARN = Number(process.env.GAS_WARN || 8);
const LOG = process.env.PUSH_LOG || '/opt/morpheus/nitro/feed-pusher.log';
const SYMBOLS = (process.env.SYMBOLS || 'NEO-USD,GAS-USD,BTC-USD,ETH-USD').split(',');
const log = m => { const line = `[${new Date().toISOString()}] ${m}`; try{appendFileSync(LOG, line+'\n');}catch{} console.log(line); };
// RPC with multi-node failover (skips nodes returning non-JSON/HTML or errors)
async function rpc(method,params){
  let lastErr;
  for(const url of RPCS){
    try{
      const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(15000)});
      const text=await r.text(); let j;
      try{ j=JSON.parse(text); }catch{ throw new Error('non-JSON from '+url.replace(/^https?:\/\//,'').split('/')[0]); }
      if(j.error) throw new Error(method+': '+JSON.stringify(j.error).slice(0,120));
      return j.result;
    }catch(e){ lastErr=e; }
  }
  throw lastErr;
}
async function td(syms){const t=syms.map(s=>s.replace('-','/'));const r=await fetch(`https://api.twelvedata.com/price?symbol=${encodeURIComponent(t.join(','))}&apikey=${TD_KEY}`,{signal:AbortSignal.timeout(25000)});const text=await r.text();let j;try{j=JSON.parse(text);}catch{throw new Error('TwelveData non-JSON (HTTP '+r.status+')');}const o={};for(const s of syms){const k=s.replace('-','/');const e=(t.length===1)?j:j[k];const v=e&&e.price;if(v&&!isNaN(Number(v)))o[s]=Number(v);}return o;}
async function cur(pair){const j=await rpc('invokefunction',[`0x${FEED}`,'getLatest',[{type:'String',value:'TWELVEDATA:'+pair}]]);const v=j.state==='HALT'?j.stack&&j.stack[0]&&j.stack[0].value:null;return Array.isArray(v)?{round:Number(v[1].value||0),price:Number(v[2].value||0)/1e6,ts:Number(v[3].value||0)}:{round:0,price:0,ts:0};}
async function nitroSign(msg){const r=await fetch(`${SIGNER}/sign/payload`,{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+TOKEN},body:JSON.stringify({role:'updater',data_hex:msg}),signal:AbortSignal.timeout(15000)});const j=await r.json();if(j.status!=='ok'||!j.signature)throw new Error('8787 sign failed');return j.signature;}
async function updaterGas(){try{const j=await rpc('invokefunction',[`0x${GASH}`,'balanceOf',[{type:'Hash160',value:'0x'+UPDATER_SH}]]);return Number(j.stack&&j.stack[0]&&j.stack[0].value||0)/1e8;}catch{return -1;}}
(async()=>{
  const now=Math.floor(Date.now()/1000);
  let prices; try{prices=await td(SYMBOLS);}catch(e){log('TD fetch error (skip cycle): '+e.message);return;}
  const P=[],R=[],PX=[],TS=[],AH=[],SS=[]; let skipped=0,missing=0;
  for(const s of SYMBOLS){
    if(!(s in prices)){missing++;continue;}
    let c; try{c=await cur(s);}catch(e){log('getLatest fail '+s+' (skip cycle): '+e.message);return;}
    const px=Math.round(prices[s]*1e6);
    const recent=c.round>0 && (now-c.round)<MAX_STALE_SEC;
    const unchanged=c.price>0 && Math.abs(prices[s]-c.price)/c.price*10000 < THRESHOLD_BPS;
    if(recent && unchanged){skipped++;continue;}
    const round=Math.max(c.round+1,now), ts=Math.max(c.ts,now);
    AH.push(createHash('sha256').update(`${s}|${px}|${ts}`).digest('hex').slice(0,32));
    P.push('TWELVEDATA:'+s);R.push(round);PX.push(px);TS.push(ts);SS.push(0);
  }
  if(!P.length){log(`no updates (skipped ${skipped}, missing ${missing})`);}
  else{
    const script=sc.createScript({scriptHash:FEED,operation:'updateFeeds',args:[
      sc.ContractParam.array(...P.map(x=>sc.ContractParam.string(x))),
      sc.ContractParam.array(...R.map(x=>sc.ContractParam.integer(x))),
      sc.ContractParam.array(...PX.map(x=>sc.ContractParam.integer(x))),
      sc.ContractParam.array(...TS.map(x=>sc.ContractParam.integer(x))),
      sc.ContractParam.array(...AH.map(x=>sc.ContractParam.byteArray(x))),
      sc.ContractParam.array(...SS.map(x=>sc.ContractParam.integer(x))) ]});
    const count=await rpc('getblockcount',[]);
    const txn=new tx.Transaction({signers:[{account:UPDATER_SH,scopes:tx.WitnessScope.CalledByEntry}],validUntilBlock:count+500,script});
    const inv=await rpc('invokescript',[u.HexString.fromHex(script).toBase64(),[{account:'0x'+UPDATER_SH,scopes:'CalledByEntry'}]]);
    if(inv.state!=='HALT'){log('invokescript FAULT (skip cycle): '+inv.exception);return;}
    txn.systemFee=u.BigInteger.fromNumber(inv.gasconsumed);
    const verif=wallet.getVerificationScriptFromPublicKey(UPDATER_PUB);
    txn.witnesses=[new tx.Witness({invocationScript:'0c40'+'00'.repeat(64),verificationScript:verif})];
    const nf=await rpc('calculatenetworkfee',[u.HexString.fromHex(txn.serialize(true)).toBase64()]);txn.networkFee=u.BigInteger.fromNumber(nf.networkfee);txn.witnesses=[];
    const sig=await nitroSign(txn.getMessageForSigning(MAGIC));
    txn.witnesses=[tx.Witness.fromSignature(sig,UPDATER_PUB)];
    const res=await rpc('sendrawtransaction',[u.HexString.fromHex(txn.serialize(true)).toBase64()]);
    log(`pushed ${P.length} pairs (skipped ${skipped}, missing ${missing}), fee ${(Number(txn.systemFee.toString())/1e8+Number(txn.networkFee.toString())/1e8).toFixed(5)} GAS, txid ${res&&res.hash}`);
  }
  const g=await updaterGas(); if(g>=0 && g<GAS_WARN) log(`⚠️ LOW GAS: updater balance ${g.toFixed(3)} GAS < ${GAS_WARN} — refund 0x${UPDATER_SH}`);
})().catch(e=>{log('FATAL (recovers next cycle): '+e.message);process.exitCode=1;});
