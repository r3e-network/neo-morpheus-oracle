"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DEFAULT_FEED_SYMBOLS } from "@/lib/feed-defaults";
import { ProviderConfigPanel } from "./provider-config-panel";
import { RelayerOpsPanel } from "./relayer-ops-panel";

type JsonRecord = Record<string, unknown>;

function isRecord(v: unknown): v is JsonRecord {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}
function formatJson(v: unknown) {
  return typeof v === "string" ? v : JSON.stringify(v, null, 2);
}
function extractError(data: unknown, fb = "请求失败") {
  if (isRecord(data) && typeof data.error === "string" && data.error) return data.error;
  if (typeof data === "string" && data) return data;
  return fb;
}
function decodeBase64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
function encodeBytesToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
async function encryptWithOracleKey(pubKeyBase64: string, plaintext: string) {
  const spki = decodeBase64ToBytes(pubKeyBase64);
  const cryptoKey = await crypto.subtle.importKey("spki", spki, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
  const encrypted = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, cryptoKey, new TextEncoder().encode(plaintext));
  return encodeBytesToBase64(encrypted);
}
async function callJson(path: string, init: RequestInit = {}) {
  const res = await fetch(path, {
    ...init,
    headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
  });
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, data: text ? JSON.parse(text) : null }; }
  catch { return { ok: res.ok, status: res.status, data: text }; }
}

export function Dashboard() {
  const [activeTab, setActiveTab] = useState("status");
  
  // Status State
  const [webHealth, setWebHealth] = useState<unknown>(null);
  const [workerHealth, setWorkerHealth] = useState<unknown>(null);
  const [runtimeInfo, setRuntimeInfo] = useState<unknown>(null);
  const [statusMsg, setStatusMsg] = useState("");

  // Feeds
  const [feedCatalog, setFeedCatalog] = useState<string[]>([]);
  const [feedDetail, setFeedDetail] = useState<unknown>(null);
  const [selectedPair, setSelectedPair] = useState("NEO-USD");
  const [feedMsg, setFeedMsg] = useState("");

  // Encrypt
  const [pubKey, setPubKey] = useState<string | null>(null);
  const [plainSecret, setPlainSecret] = useState("");
  const [encSecret, setEncSecret] = useState("");
  const [patchText, setPatchText] = useState("{}");
  const [encPatch, setEncPatch] = useState("");
  const [encMsg, setEncMsg] = useState("");

  // Oracle
  const [oracleMode, setOracleMode] = useState("provider");
  const [oracleUrl, setOracleUrl] = useState("https://api.example.com/data");
  const [oracleResponse, setOracleResponse] = useState<unknown>(null);
  const [oracleMsg, setOracleMsg] = useState("");

  // Compute
  const [computeScript, setComputeScript] = useState("function run(data) { return data; }");
  const [computeResult, setComputeResult] = useState<unknown>(null);
  const [computeMsg, setComputeMsg] = useState("");

  // Attest
  const [verifyResult, setVerifyResult] = useState<unknown>(null);
  const [verifyMsg, setVerifyMsg] = useState("");

  useEffect(() => { void initData(); }, []);

  async function initData() {
    setStatusMsg("刷新中...");
    try {
      const [w, wk, r, f, pk] = await Promise.all([
        callJson("/api/health"), callJson("/api/runtime/health"), callJson("/api/runtime/info"),
        callJson("/api/feeds/catalog"), callJson("/api/oracle/public-key")
      ]);
      setWebHealth(w.data); setWorkerHealth(wk.data); setRuntimeInfo(r.data);
      if (f.ok && isRecord(f.data) && Array.isArray(f.data.pairs)) setFeedCatalog(f.data.pairs as string[]);
      if (pk.ok && isRecord(pk.data) && typeof pk.data.public_key === "string") setPubKey(pk.data.public_key);
      setStatusMsg("状态已更新。");
    } catch { setStatusMsg("刷新失败"); }
  }

  async function loadFeed() {
    setFeedMsg("加载中...");
    const res = await callJson(`/api/feeds/${encodeURIComponent(selectedPair)}?project_slug=demo`);
    setFeedDetail(res.data);
    setFeedMsg(res.ok ? "价格源加载成功" : extractError(res.data));
  }

  async function encryptSecret() {
    if (!pubKey) return setEncMsg("未获预言机公钥");
    try { setEncSecret(await encryptWithOracleKey(pubKey, plainSecret)); setEncMsg("已加密凭证。"); }
    catch { setEncMsg("加密失败。"); }
  }
  async function encryptPatch() {
    if (!pubKey) return setEncMsg("未获预言机公钥");
    try { setEncPatch(await encryptWithOracleKey(pubKey, patchText)); setEncMsg("已加密补丁参数。"); }
    catch { setEncMsg("加密此参数补丁失败。"); }
  }

  async function runOracle() {
    setOracleMsg("请求预言机...");
    const payload = oracleMode === "provider" ? { project_slug: "demo", provider: "twelvedata", symbol: selectedPair } : { url: oracleUrl, method: "GET" };
    const res = await callJson("/api/oracle/query", { method: "POST", body: JSON.stringify(payload) });
    setOracleResponse(res.data);
    setOracleMsg(res.ok ? "请求完成" : extractError(res.data));
  }

  async function runCompute() {
    setComputeMsg("执行计算中...");
    const res = await callJson("/api/compute/execute", { method: "POST", body: JSON.stringify({ mode: "script", script: computeScript }) });
    setComputeResult(res.data);
    setComputeMsg(res.ok ? "计算成功" : extractError(res.data));
  }

  async function verifyDemo() {
    setVerifyMsg("读取演示证明...");
    const res = await callJson("/api/attestation/demo");
    setVerifyResult(res.data);
    setVerifyMsg(res.ok ? "读取成功" : "读取失败");
  }

  return (
    <div className="dashboard-layout" style={{ display: 'flex', gap: '32px', alignItems: 'flex-start' }}>
      <div className="sidebar-nav" style={{ position: 'sticky', top: '96px', display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '220px' }}>
        {[
          { id: 'status', label: '预言机状态', icon: '⚡' },
          { id: 'encrypt', label: '数据加密', icon: '🔐' },
          { id: 'feeds', label: '价格源看板', icon: '📊' },
          { id: 'oracle', label: '智能请求', icon: '🔮' },
          { id: 'compute', label: '隐私计算', icon: '💻' },
          { id: 'attestation', label: 'TEE 验证', icon: '🛡️' },
          { id: 'ops', label: '系统运维', icon: '⚙️' }
        ].map(tab => (
          <button
            key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{
              background: activeTab === tab.id ? 'rgba(0, 229, 153, 0.1)' : 'transparent',
              borderColor: activeTab === tab.id ? 'rgba(0, 229, 153, 0.3)' : 'transparent',
              color: activeTab === tab.id ? 'var(--neo-green)' : 'var(--text-secondary)',
              padding: '14px 20px', textAlign: 'left', borderRadius: '12px', cursor: 'pointer',
              border: '1px solid', transition: 'all 0.2s', display: 'flex', gap: '10px', alignItems: 'center', fontWeight: activeTab === tab.id ? '600' : '500'
            }}
            className="sidebar-tab"
          >
            <span>{tab.icon}</span> <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="console-content" style={{ flex: 1, minWidth: 0 }}>
        {activeTab === 'status' && (
          <section className="console-section" style={{ animation: "fadeIn 0.3s ease" }}>
            <div className="console-section-header">
              <div><span className="console-kicker">运行状态</span><h2>预言机网络状态</h2><p>追踪 Web API 连通性、Phala Worker 健康度、TEE 原生身份、支持的价格源目录以及当前的运行时架构，尽在一个视图。</p></div>
              <button className="btn btn-outline btn-inline" onClick={initData}>刷新状态</button>
            </div>
            <p>{statusMsg}</p>
            <div className="grid grid-2">
              <div className="card"><h3>Worker 运行时状态</h3><pre>{formatJson({ webHealth, workerHealth })}</pre></div>
              <div className="card"><h3>TEE 原生身份认证</h3><small>由 Worker 暴露的当前 dstack / tappd 元数据信息。</small><pre>{formatJson(runtimeInfo)}</pre></div>
            </div>
          </section>
        )}

        {activeTab === 'encrypt' && (
          <section className="console-section" style={{ animation: "fadeIn 0.3s ease" }}>
            <div className="console-section-header">
              <div><span className="console-kicker">客户端加密</span><h2>数据加密控制台</h2><p>获取预言机的 RSA-OAEP 公钥，直接在浏览器本地加密您的敏感数据，并生成用于隐私预言机或计算网的机密数据补丁。</p></div>
            </div>
            <p>{encMsg}</p>
            <div className="grid grid-2">
               <div className="card"><h3>预言机公钥</h3><pre>{pubKey || "获取中..."}</pre></div>
               <div className="card">
                 <h3>API 密钥加密器</h3>
                 <textarea value={plainSecret} onChange={e => setPlainSecret(e.target.value)} placeholder="输入凭证..." />
                 <button className="btn btn-primary" onClick={encryptSecret}>执行加密</button>
                 <pre>{encSecret || "加密后密文..."}</pre>
               </div>
               <div className="card">
                 <h3>全局参数补丁加密</h3>
                 <textarea value={patchText} onChange={e => setPatchText(e.target.value)} placeholder="输入JSON补丁..." />
                 <button className="btn btn-primary" onClick={encryptPatch}>加密数据补丁</button>
                 <pre>{encPatch || "加密后补丁..."}</pre>
               </div>
            </div>
          </section>
        )}

        {activeTab === 'feeds' && (
          <section className="console-section" style={{ animation: "fadeIn 0.3s ease" }}>
            <div className="console-section-header">
              <div><span className="console-kicker">实时行情</span><h2>价格源数据看板</h2><p>浏览当前受支持的交易对目录，检查实时的链下报价，并直观比较所有可用 Provider 对于任意交易对的直接输出。</p></div>
            </div>
            <div className="grid grid-2">
              <div className="card">
                <h3>选择交易对</h3>
                <select value={selectedPair} onChange={e => setSelectedPair(e.target.value)}>
                  {feedCatalog.length ? feedCatalog.map(p => <option key={p} value={p}>{p}</option>) : <option>NEO-USD</option>}
                </select>
                <button className="btn btn-primary" onClick={loadFeed}>加载选定交易对</button>
                <p>{feedMsg}</p>
              </div>
              <div className="card"><h3>所选交易对聚合详情</h3><pre>{formatJson(feedDetail)}</pre></div>
            </div>
          </section>
        )}

        {activeTab === 'oracle' && (
          <section className="console-section" style={{ animation: "fadeIn 0.3s ease" }}>
            <div className="console-section-header">
              <div><span className="console-kicker">隐私预言机</span><h2>可信预言机请求构建器</h2><p>构建公开或机密的预言机请求，附加您刚加密的凭证或 JSON 补丁参数，并实时检查带有 TEE 验证的最终回调数据。</p></div>
            </div>
            <div className="grid grid-2">
              <div className="card">
                <h3>构建控制面板</h3>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                  <button className="btn btn-outline" onClick={() => setOracleMode("provider")}>内置 Provider</button>
                  <button className="btn btn-outline" onClick={() => setOracleMode("custom")}>自定义 URL</button>
                </div>
                {oracleMode === "custom" && <input value={oracleUrl} onChange={e => setOracleUrl(e.target.value)} placeholder="URL..." />}
                <button className="btn btn-primary" onClick={runOracle}>标准查询</button>
                <p>{oracleMsg}</p>
              </div>
              <div className="card"><h3>最新一次的预言机响应</h3><pre>{formatJson(oracleResponse)}</pre></div>
            </div>
          </section>
        )}

        {activeTab === 'compute' && (
          <section className="console-section" style={{ animation: "fadeIn 0.3s ease" }}>
            <div className="console-section-header">
              <div><span className="console-kicker">隐私计算</span><h2>隐私验证机计算工作台</h2><p>执行内置的密码学运算，或上传您的自定义脚本执行环境。</p></div>
            </div>
            <div className="grid grid-2">
               <div className="card">
                 <h3>执行构建器</h3>
                 <textarea value={computeScript} onChange={e=>setComputeScript(e.target.value)} />
                 <button className="btn btn-primary" onClick={runCompute}>开启机密计算</button>
                 <p>{computeMsg}</p>
               </div>
               <div className="card"><h3>最后一次计算返回</h3><pre>{formatJson(computeResult)}</pre></div>
            </div>
          </section>
        )}

        {activeTab === 'attestation' && (
          <section className="console-section" style={{ animation: "fadeIn 0.3s ease" }}>
             <div className="console-section-header">
              <div><span className="console-kicker">远程证明</span><h2>原生 TEE 验证探针</h2><p>探测并检查当前的 TEE 可信身份、加载 Worker 测算证明演示，或校验数据真实性。</p></div>
            </div>
            <div className="grid grid-2">
              <div className="card">
                <button className="btn btn-primary" onClick={verifyDemo}>加载演示 (Demo)</button>
                <p>{verifyMsg}</p>
              </div>
              <div className="card"><h3>实时验证核对结果</h3><pre>{formatJson(verifyResult)}</pre></div>
            </div>
          </section>
        )}

        {activeTab === 'ops' && (
          <section className="console-section" style={{ animation: "fadeIn 0.3s ease" }}>
             <div className="console-section-header">
              <div><span className="console-kicker">高级操作运维</span><h2>节点服务商与 Relayer 中继运维</h2></div>
            </div>
            <ProviderConfigPanel />
            <RelayerOpsPanel />
          </section>
        )}
      </div>
    </div>
  );
}
