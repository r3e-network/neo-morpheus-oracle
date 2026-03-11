"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Copy, Cpu, Lock, Zap, Shield } from "lucide-react";

import { encryptJsonWithOraclePublicKey } from "@/lib/browser-encryption";
import { NETWORKS } from "@/lib/onchain-data";

interface OracleTabProps {
  providers: any[];
  setOutput: (output: string) => void;
}

function escapeForCSharp(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function encodeUtf8Base64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return window.btoa(binary);
}

function copyText(value: string) {
  return navigator.clipboard.writeText(value);
}

export function OracleTab({ providers, setOutput }: OracleTabProps) {
  const [requestMode, setRequestMode] = useState("provider");
  const [oracleUrl, setOracleUrl] = useState("https://postman-echo.com/get?probe=morpheus");
  const [providerSymbol, setProviderSymbol] = useState("NEO-USD");
  const [httpMethod, setHttpMethod] = useState("GET");
  const [oracleEncryptedParams, setOracleEncryptedParams] = useState("");
  const [oracleConfidentialJson, setOracleConfidentialJson] = useState('{\n  "headers": {\n    "Authorization": "Bearer secret_token"\n  }\n}');
  const [oracleScript, setOracleScript] = useState("function process(data, context, helpers) {\n  return data.args.probe + '-script';\n}");
  const [oracleJsonPath, setOracleJsonPath] = useState("price");
  const [useCustomScript, setUseCustomScript] = useState(false);
  const [oracleTargetChain, setOracleTargetChain] = useState("neo_n3");
  const [provider, setProvider] = useState("twelvedata");
  const [walletCallbackHash, setWalletCallbackHash] = useState("0x89b05cac00804648c666b47ecb1c57bc185821b7");
  const [walletCallbackMethod, setWalletCallbackMethod] = useState("onOracleResult");
  const [oracleKeyMeta, setOracleKeyMeta] = useState<any>(null);
  const [oracleState, setOracleState] = useState<any>(null);
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [generatedRequest, setGeneratedRequest] = useState<{
    requestType: string;
    payload: Record<string, unknown>;
    payloadJson: string;
    neoN3Snippet: string;
    neoXSnippet: string;
  } | null>(null);
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  useEffect(() => {
    void loadOracleKey();
    void loadOracleState();
  }, []);

  useEffect(() => {
    if (requestMode === "provider") {
      setOracleUrl("https://postman-echo.com/get?probe=morpheus");
      setHttpMethod("GET");
      setOracleJsonPath("price");
      if (useCustomScript) {
        setOracleScript("function process(data, context, helpers) {\n  return Number(data.price) > 0;\n}");
      }
      if (!oracleEncryptedParams.trim()) {
        setOracleConfidentialJson('{\n  "json_path": "price"\n}');
      }
      return;
    }

    setOracleUrl("https://postman-echo.com/get?probe=morpheus");
    setHttpMethod("GET");
    setOracleJsonPath("args.probe");
    if (useCustomScript) {
      setOracleScript("function process(data, context, helpers) {\n  return data.args.probe + '-script';\n}");
    }
    if (!oracleEncryptedParams.trim()) {
      setOracleConfidentialJson('{\n  "headers": {\n    "Authorization": "Bearer secret_token"\n  },\n  "json_path": "args.probe"\n}');
    }
  }, [requestMode, useCustomScript]); // eslint-disable-line react-hooks/exhaustive-deps

  function applyOraclePreset(preset: "public_quote" | "private_api" | "boolean_check" | "hidden_builtin") {
    if (preset === "public_quote") {
      setRequestMode("provider");
      setProvider("twelvedata");
      setProviderSymbol("NEO-USD");
      setOracleJsonPath("price");
      setOracleTargetChain("neo_n3");
      setUseCustomScript(false);
      setOracleEncryptedParams("");
      setOracleConfidentialJson('{\n  "json_path": "price"\n}');
      setOutput(">> Loaded preset: Public Quote\n>> Built-in provider quote request for Neo N3.");
      return;
    }

    if (preset === "private_api") {
      setRequestMode("url");
      setOracleUrl("https://api.example.com/private-price");
      setHttpMethod("GET");
      setOracleJsonPath("data.price");
      setOracleTargetChain("neo_n3");
      setUseCustomScript(false);
      setOracleEncryptedParams("");
      setOracleConfidentialJson('{\n  "headers": {\n    "Authorization": "Bearer secret_token"\n  },\n  "json_path": "data.price"\n}');
      setOutput(">> Loaded preset: Private API\n>> Encrypt the confidential JSON patch locally before submitting.");
      return;
    }

    if (preset === "boolean_check") {
      const nextScript = "function process(data, context, helpers) {\n  return Number(data.followers || 0) > 10000;\n}";
      setRequestMode("url");
      setOracleUrl("https://api.example.com/private-profile");
      setHttpMethod("GET");
      setOracleJsonPath("data.followers");
      setOracleTargetChain("neo_n3");
      setUseCustomScript(true);
      setOracleScript(nextScript);
      setOracleEncryptedParams("");
      setOracleConfidentialJson('{\n  "headers": {\n    "Authorization": "Bearer secret_token"\n  },\n  "json_path": "data.followers",\n  "script": "function process(data, context, helpers) { return Number(data.followers || 0) > 10000; }",\n  "entry_point": "process"\n}');
      setOutput(">> Loaded preset: Boolean Check\n>> This pattern returns only a boolean to the callback.");
      return;
    }

    setRequestMode("provider");
    setProvider("twelvedata");
    setProviderSymbol("BTC-USD");
    setOracleJsonPath("price");
    setOracleTargetChain("neo_n3");
    setUseCustomScript(false);
    setOracleEncryptedParams("");
    setOracleConfidentialJson('{\n  "json_path": "price",\n  "target_chain": "neo_n3"\n}');
    setOutput(">> Loaded preset: Hidden Built-in Params\n>> Encrypt the patch so helper fields stay private.");
  }

  async function loadOracleKey() {
    try {
      const response = await fetch("/api/oracle/public-key");
      const body = await response.json().catch(() => ({}));
      if (response.ok && body?.public_key) {
        setOracleKeyMeta(body);
      }
    } catch (err) {
      console.error("Failed to load oracle public key", err);
    }
  }

  async function loadOracleState() {
    try {
      const response = await fetch("/api/onchain/state?limit=20");
      const body = await response.json().catch(() => ({}));
      setOracleState(body?.neo_n3?.oracle || null);
    } catch (err) {
      console.error("Failed to load on-chain oracle state", err);
    }
  }

  async function encryptConfidentialPatch() {
    setIsEncrypting(true);
    try {
      const keyMeta = oracleKeyMeta?.public_key ? oracleKeyMeta : await (async () => {
        const response = await fetch("/api/oracle/public-key");
        const body = await response.json();
        setOracleKeyMeta(body);
        return body;
      })();

      if (!keyMeta?.public_key) throw new Error("Public key not available");

      const ciphertext = await encryptJsonWithOraclePublicKey(keyMeta.public_key, oracleConfidentialJson);
      setOracleEncryptedParams(ciphertext);
      setOutput(">> Confidential patch encrypted locally.\n>> Submit the generated payload through the on-chain Oracle contract.\n>> No live worker execution was triggered by this page.");
    } catch (err: any) {
      setOutput(`!! Encryption Error: ${err.message}`);
    } finally {
      setIsEncrypting(false);
    }
  }

  function buildOraclePayload() {
    const payload: Record<string, unknown> = {
      target_chain: oracleTargetChain,
    };

    if (requestMode === "provider") {
      payload.provider = provider;
      payload.symbol = providerSymbol;
    } else {
      payload.url = oracleUrl;
      if ((httpMethod || "GET").toUpperCase() !== "GET") {
        payload.method = httpMethod.toUpperCase();
      }
    }

    if (oracleJsonPath.trim()) {
      payload.json_path = oracleJsonPath.trim();
    }
    if (useCustomScript && oracleScript.trim()) {
      payload.script = oracleScript.trim();
    }
    if (oracleEncryptedParams.trim()) {
      payload.encrypted_params = oracleEncryptedParams.trim();
    }

    return payload;
  }

  function buildRequestType() {
    return requestMode === "provider" ? "privacy_oracle" : "oracle";
  }

  function generateOnchainPackage() {
    const requestType = buildRequestType();
    const payload = buildOraclePayload();
    const payloadJson = JSON.stringify(payload);
    const escapedPayloadJson = escapeForCSharp(payloadJson);

    const neoN3Snippet = `string payloadJson = "${escapedPayloadJson}";

BigInteger requestId = (BigInteger)Contract.Call(
    OracleHash,
    "request",
    CallFlags.All,
    "${requestType}",
    (ByteString)payloadJson,
    Runtime.ExecutingScriptHash,
    "onOracleResult"
);`;

    const neoXSnippet = `bytes memory payload = abi.encodePacked('${payloadJson.replace(/'/g, "\\'")}');
uint256 fee = oracle.requestFee();
uint256 requestId = oracle.request{value: fee}(
    "${requestType}",
    payload,
    address(this),
    "onOracleResult"
);`;

    setGeneratedRequest({
      requestType,
      payload,
      payloadJson,
      neoN3Snippet,
      neoXSnippet,
    });

    setOutput([
      ">> Oracle request package generated.",
      `>> Request type: ${requestType}`,
      `>> Neo N3 request fee: ${oracleState?.request_fee_display || "0.01 GAS"}`,
      `>> Oracle contract: ${oracleState?.contract || NETWORKS.neo_n3.oracle}`,
      ">> Submit this payload through the on-chain Oracle contract. Do not call /oracle/smart-fetch directly from user flows.",
      "",
      payloadJson,
    ].join("\n"));
  }

  async function handleCopy(id: string, value: string) {
    await copyText(value);
    setCopiedItem(id);
    setTimeout(() => setCopiedItem(null), 1500);
  }

  const keySummary = useMemo(() => ({
    algorithm: oracleKeyMeta?.algorithm || "X25519-HKDF-SHA256-AES-256-GCM",
    source: oracleKeyMeta?.key_source || "unknown",
  }), [oracleKeyMeta]);

  const payloadBase64 = generatedRequest ? encodeUtf8Base64(generatedRequest.payloadJson) : "";
  const neoRpcInvoke = generatedRequest ? JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "invokefunction",
    params: [
      oracleState?.contract || NETWORKS.neo_n3.oracle,
      "request",
      [
        { type: "String", value: generatedRequest.requestType },
        { type: "ByteArray", value: payloadBase64 },
        { type: "Hash160", value: walletCallbackHash },
        { type: "String", value: walletCallbackMethod },
      ],
    ],
  }, null, 2) : "";
  const callbackQueryTemplate = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "invokefunction",
    params: [
      walletCallbackHash,
      "getCallback",
      [
        { type: "Integer", value: "<requestId>" },
      ],
    ],
  }, null, 2);

  return (
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid var(--border-dim)', paddingBottom: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.03em', marginBottom: '0.5rem' }}>Oracle Payload Builder</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Seal confidential fields locally, then generate the exact on-chain request payload and callback snippets.</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>LIVE ORACLE</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--neo-green)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{oracleState?.request_fee_display || "0.01 GAS"}</div>
        </div>
      </div>

      <div className="card-industrial" style={{ padding: '1.25rem 1.5rem', borderLeft: '4px solid var(--neo-green)' }}>
        <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          This page does <strong>not</strong> send a live Oracle request. It only encrypts locally and prepares a payload for
          on-chain submission through <code>{oracleState?.domain || NETWORKS.neo_n3.domains.oracle}</code>.
          You can also move <code>json_path</code> or <code>script</code> into the encrypted JSON if you want those fields hidden from the public transaction.
        </p>
      </div>

      <div className="card-industrial" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
          <Zap size={18} color="var(--neo-green)" />
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>Scenario Presets</h3>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          <button className="btn-secondary" style={{ border: '1px solid var(--border-dim)' }} onClick={() => applyOraclePreset("public_quote")}>
            <Shield size={14} /> Public Quote
          </button>
          <button className="btn-secondary" style={{ border: '1px solid var(--border-dim)' }} onClick={() => applyOraclePreset("private_api")}>
            <Lock size={14} /> Private API
          </button>
          <button className="btn-secondary" style={{ border: '1px solid var(--border-dim)' }} onClick={() => applyOraclePreset("boolean_check")}>
            <Cpu size={14} /> Boolean Check
          </button>
          <button className="btn-secondary" style={{ border: '1px solid var(--border-dim)' }} onClick={() => applyOraclePreset("hidden_builtin")}>
            <Lock size={14} /> Hidden Built-in Params
          </button>
        </div>
      </div>

      <div className="grid grid-2" style={{ alignItems: 'start', gap: '2rem' }}>
        <div className="card-industrial stagger-1" style={{ padding: '0' }}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-dim)', background: 'rgba(255,255,255,0.02)' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
              <Lock className="text-neo" size={16} /> 1. Local Encryption
            </h3>
          </div>

          <div style={{ padding: '1.5rem' }}>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Confidential JSON Patch</span>
                <span style={{ color: 'var(--accent-purple)' }}>Browser Only</span>
              </label>
              <textarea
                className="code-editor"
                value={oracleConfidentialJson}
                onChange={(event) => setOracleConfidentialJson(event.target.value)}
                style={{ minHeight: '180px' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div style={{ padding: '1rem', background: '#000', border: '1px solid var(--border-dim)' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 800, marginBottom: '0.35rem', fontFamily: 'var(--font-mono)' }}>ALGORITHM</div>
                <div style={{ fontSize: '0.78rem', color: '#fff', fontFamily: 'var(--font-mono)', wordBreak: 'break-word' }}>{keySummary.algorithm}</div>
              </div>
              <div style={{ padding: '1rem', background: '#000', border: '1px solid var(--border-dim)' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 800, marginBottom: '0.35rem', fontFamily: 'var(--font-mono)' }}>KEY SOURCE</div>
                <div style={{ fontSize: '0.78rem', color: '#fff', fontFamily: 'var(--font-mono)' }}>{keySummary.source}</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <button className="btn-ata" style={{ flex: 1, justifyContent: 'center' }} onClick={encryptConfidentialPatch} disabled={isEncrypting || !oracleKeyMeta}>
                {isEncrypting ? "Encrypting..." : "Encrypt Patch"}
              </button>
              {oracleEncryptedParams && (
                <button className="btn-secondary" style={{ padding: '0.75rem 1rem', border: '1px solid var(--border-dim)' }} onClick={() => setOracleEncryptedParams("")}>
                  Clear
                </button>
              )}
            </div>

            {oracleEncryptedParams && (
              <div style={{ marginTop: '1rem', padding: '1rem', background: '#000', border: '1px solid var(--border-dim)', borderLeft: '2px solid var(--neo-green)' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 800, marginBottom: '0.5rem', fontFamily: 'var(--font-mono)' }}>ENCRYPTED PARAMS</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--neo-green)', wordBreak: 'break-all', fontFamily: 'var(--font-mono)' }}>
                  {oracleEncryptedParams}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="card-industrial stagger-2" style={{ padding: '0' }}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-dim)', background: 'rgba(255,255,255,0.02)' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
              <Cpu className="text-neo" size={16} /> 2. On-Chain Request Shape
            </h3>
          </div>

          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="grid grid-2" style={{ gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Request Mode</label>
                <select className="neo-select" value={requestMode} onChange={(event) => setRequestMode(event.target.value)}>
                  <option value="provider">Built-in Provider</option>
                  <option value="url">Custom URL</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Target Chain</label>
                <select className="neo-select" value={oracleTargetChain} onChange={(event) => setOracleTargetChain(event.target.value)}>
                  <option value="neo_n3">Neo N3</option>
                  <option value="neo_x">Neo X (reference)</option>
                </select>
              </div>
            </div>

            {requestMode === "provider" ? (
              <div className="grid grid-2" style={{ gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Provider</label>
                  <select className="neo-select" value={provider} onChange={(event) => setProvider(event.target.value)}>
                    {providers.map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Symbol</label>
                  <input className="neo-input" value={providerSymbol} onChange={(event) => setProviderSymbol(event.target.value)} placeholder="NEO-USD" />
                </div>
              </div>
            ) : (
              <>
                <div className="form-group">
                  <label className="form-label">Custom URL</label>
                  <input className="neo-input" value={oracleUrl} onChange={(event) => setOracleUrl(event.target.value)} placeholder="https://..." />
                </div>
                <div className="form-group">
                  <label className="form-label">HTTP Method</label>
                  <select className="neo-select" value={httpMethod} onChange={(event) => setHttpMethod(event.target.value)}>
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                  </select>
                </div>
              </>
            )}

            <div className="form-group">
              <label className="form-label">JSON Path</label>
              <input className="neo-input" value={oracleJsonPath} onChange={(event) => setOracleJsonPath(event.target.value)} placeholder="price or data.score" />
            </div>

            <div className="grid grid-2" style={{ gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Wallet / Direct Test Callback Hash</label>
                <input className="neo-input" value={walletCallbackHash} onChange={(event) => setWalletCallbackHash(event.target.value)} placeholder="0x..." />
              </div>
              <div className="form-group">
                <label className="form-label">Callback Method</label>
                <input className="neo-input" value={walletCallbackMethod} onChange={(event) => setWalletCallbackMethod(event.target.value)} placeholder="onOracleResult" />
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              <input type="checkbox" checked={useCustomScript} onChange={(event) => setUseCustomScript(event.target.checked)} />
              Include custom JS reduction (<code>process(data, context, helpers)</code>)
            </label>

            <div style={{ padding: '0.9rem 1rem', background: '#000', border: '1px solid var(--border-dim)' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 800, marginBottom: '0.35rem', fontFamily: 'var(--font-mono)' }}>PAYLOAD TEMPLATE</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {requestMode === "provider"
                  ? "Built-in provider mode: keep provider + symbol public, and optionally hide json_path or script inside encrypted_params."
                  : "Custom URL mode: keep the URL public, and hide headers/query/body/json_path/script in encrypted_params when needed."}
              </div>
            </div>

            {useCustomScript && (
              <div className="form-group">
                <label className="form-label">Oracle Script</label>
                <textarea className="code-editor" value={oracleScript} onChange={(event) => setOracleScript(event.target.value)} style={{ minHeight: '120px' }} />
              </div>
            )}

            <button className="btn-ata" style={{ width: '100%', justifyContent: 'center' }} onClick={generateOnchainPackage}>
              Generate On-Chain Package
            </button>
          </div>
        </div>
      </div>

      {generatedRequest && (
        <div className="card-industrial stagger-3" style={{ padding: '0' }}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-dim)', background: 'rgba(255,255,255,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 800, textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: '0.25rem' }}>3. Generated Request Package</h3>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>requestType = {generatedRequest.requestType}</div>
            </div>
            <div className="badge-outline" style={{ color: 'var(--neo-green)', borderColor: 'var(--neo-green)' }}>
              <CheckCircle2 size={12} style={{ marginRight: '6px' }} />
              READY
            </div>
          </div>

          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button className="btn-secondary" style={{ border: '1px solid var(--border-dim)' }} onClick={() => handleCopy("payload", generatedRequest.payloadJson)}>
                <Copy size={14} /> {copiedItem === "payload" ? "Copied Payload" : "Copy Payload JSON"}
              </button>
              <button className="btn-secondary" style={{ border: '1px solid var(--border-dim)' }} onClick={() => handleCopy("n3", generatedRequest.neoN3Snippet)}>
                <Copy size={14} /> {copiedItem === "n3" ? "Copied N3" : "Copy Neo N3 Snippet"}
              </button>
              <button className="btn-secondary" style={{ border: '1px solid var(--border-dim)' }} onClick={() => handleCopy("neox", generatedRequest.neoXSnippet)}>
                <Copy size={14} /> {copiedItem === "neox" ? "Copied Neo X" : "Copy Neo X Snippet"}
              </button>
            </div>

            <div className="grid grid-2" style={{ gap: '1rem' }}>
              <div style={{ padding: '1rem', background: '#000', border: '1px solid var(--border-dim)' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 800, marginBottom: '0.35rem', fontFamily: 'var(--font-mono)' }}>ORACLE CONTRACT</div>
                <div style={{ fontSize: '0.8rem', color: '#fff', fontFamily: 'var(--font-mono)', wordBreak: 'break-word' }}>{oracleState?.contract || NETWORKS.neo_n3.oracle}</div>
              </div>
              <div style={{ padding: '1rem', background: '#000', border: '1px solid var(--border-dim)' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 800, marginBottom: '0.35rem', fontFamily: 'var(--font-mono)' }}>REQUEST FEE</div>
                <div style={{ fontSize: '0.8rem', color: '#fff', fontFamily: 'var(--font-mono)' }}>{oracleState?.request_fee_display || "0.01 GAS"}</div>
              </div>
            </div>

            <div style={{ background: '#000', border: '1px solid var(--border-dim)', padding: '1rem' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 800, marginBottom: '0.5rem', fontFamily: 'var(--font-mono)' }}>PAYLOAD JSON</div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--neo-green)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                {JSON.stringify(generatedRequest.payload, null, 2)}
              </pre>
            </div>

            <div className="grid grid-2" style={{ gap: '1rem' }}>
              <div style={{ background: '#000', border: '1px solid var(--border-dim)', padding: '1rem' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 800, marginBottom: '0.5rem', fontFamily: 'var(--font-mono)' }}>PAYLOAD BYTEARRAY (BASE64 UTF-8)</div>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--neo-green)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{payloadBase64}</pre>
              </div>
              <div style={{ background: '#000', border: '1px solid var(--border-dim)', padding: '1rem' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 800, marginBottom: '0.5rem', fontFamily: 'var(--font-mono)' }}>NEO N3 RPC invokeFunction</div>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{neoRpcInvoke}</pre>
              </div>
            </div>

            <div className="grid grid-2" style={{ gap: '1rem' }}>
              <div style={{ background: '#000', border: '1px solid var(--border-dim)', padding: '1rem' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 800, marginBottom: '0.5rem', fontFamily: 'var(--font-mono)' }}>NEO N3 SUBMISSION</div>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{generatedRequest.neoN3Snippet}</pre>
              </div>
              <div style={{ background: '#000', border: '1px solid var(--border-dim)', padding: '1rem' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 800, marginBottom: '0.5rem', fontFamily: 'var(--font-mono)' }}>NEO X REFERENCE</div>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{generatedRequest.neoXSnippet}</pre>
              </div>
            </div>

            <div className="grid grid-2" style={{ gap: '1rem' }}>
              <div style={{ background: '#000', border: '1px solid var(--border-dim)', padding: '1rem' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 800, marginBottom: '0.5rem', fontFamily: 'var(--font-mono)' }}>NEO N3 CALL ARGUMENTS</div>
                <div style={{ color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                  <div><strong style={{ color: '#fff' }}>Arg 1:</strong> <code>{generatedRequest.requestType}</code></div>
                  <div><strong style={{ color: '#fff' }}>Arg 2:</strong> UTF-8 payload JSON bytes</div>
                  <div><strong style={{ color: '#fff' }}>Arg 3:</strong> callback contract = <code>Runtime.ExecutingScriptHash</code></div>
                  <div><strong style={{ color: '#fff' }}>Arg 4:</strong> callback method = <code>onOracleResult</code></div>
                  <div><strong style={{ color: '#fff' }}>Fee:</strong> <code>{oracleState?.request_fee_display || "0.01 GAS"}</code></div>
                </div>
              </div>
              <div style={{ background: '#000', border: '1px solid var(--border-dim)', padding: '1rem' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 800, marginBottom: '0.5rem', fontFamily: 'var(--font-mono)' }}>CALLBACK READBACK</div>
                <div style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  <div>1. Submit to <code>{oracleState?.contract || NETWORKS.neo_n3.oracle}</code>.</div>
                  <div>2. Read the emitted <code>requestId</code>.</div>
                  <div>3. Query your consumer contract&apos;s <code>getCallback(requestId)</code> or use the template below.</div>
                  <div>4. Verify <code>output_hash</code>, <code>attestation_hash</code>, and <code>tee_attestation.report_data</code> in the verifier.</div>
                </div>
              </div>
            </div>

            <div style={{ background: '#000', border: '1px solid var(--border-dim)', padding: '1rem' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 800, marginBottom: '0.5rem', fontFamily: 'var(--font-mono)' }}>CALLBACK QUERY TEMPLATE</div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{callbackQueryTemplate}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
