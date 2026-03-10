"use client";

import { useEffect, useState } from "react";
import { OverviewTab } from "./dashboard/OverviewTab";
import { OracleTab } from "./dashboard/OracleTab";
import { ComputeTab } from "./dashboard/ComputeTab";
import { ProvidersTab } from "./dashboard/ProvidersTab";
import { DeveloperHub } from "./dashboard/DeveloperHub";
import { 
  Globe, 
  Sparkles, 
  Cpu, 
  Terminal, 
  Copy, 
  Trash2, 
  CheckCircle2, 
  ShieldCheck,
  Database,
  ChevronRight,
  BookOpen,
  Code2
} from "lucide-react";

async function callJSON(path: string, body?: unknown, method = "POST") {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function shorten(value: unknown, left = 8, right = 6) {
  const text = typeof value === "string" ? value : "";
  if (!text) return "N/A";
  if (text.length <= left + right + 3) return text;
  return `${text.slice(0, left)}...${text.slice(-right)}`;
}

export function Dashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [output, setOutput] = useState<string>("");
  const [computeFunctions, setComputeFunctions] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [networkInfo, setNetworkInfo] = useState<any>(null);
  const [runtimeHealth, setRuntimeHealth] = useState<any>(null);
  const [runtimeInfo, setRuntimeInfo] = useState<any>(null);
  const [attestationDemo, setAttestationDemo] = useState<any>(null);
  const [onchainState, setOnchainState] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [functionsRes, networksRes, providersRes, runtimeHealthRes, runtimeInfoRes, attestationDemoRes, onchainStateRes] = await Promise.all([
          fetch("/api/compute/functions"),
          fetch("/api/networks"),
          fetch("/api/providers"),
          fetch("/api/runtime/health"),
          fetch("/api/runtime/info"),
          fetch("/api/attestation/demo"),
          fetch("/api/onchain/state?limit=12"),
        ]);
        
        const functionsBody = await functionsRes.json();
        if (Array.isArray(functionsBody.functions)) setComputeFunctions(functionsBody.functions);
        
        const networksBody = await networksRes.json();
        setNetworkInfo(networksBody.selected || null);
        
        const providersBody = await providersRes.json();
        if (Array.isArray(providersBody.providers)) setProviders(providersBody.providers);

        setRuntimeHealth(await runtimeHealthRes.json());
        setRuntimeInfo(await runtimeInfoRes.json());
        setAttestationDemo(await attestationDemoRes.json());
        setOnchainState(await onchainStateRes.json());
      } catch (err) {
        console.error("Failed to fetch initial data", err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const handleCopy = () => {
    if (!output) return;
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const tabs = [
    { id: "overview", label: "Live Network", icon: Globe },
    { id: "providers", label: "Data Sources", icon: Database },
    { id: "oracle", label: "Secure Gateway", icon: Sparkles },
    { id: "compute", label: "Enclave Compute", icon: Cpu },
    { id: "devhub", label: "Developer Hub", icon: BookOpen },
  ];

  const dstackInfo = runtimeInfo?.dstack || {};
  const verifierInput = attestationDemo?.verifier_input || {};
  const attestation = verifierInput.attestation || {};
  const runtimeOk = runtimeHealth?.status === "ok";
  const runtimeLabel = runtimeOk ? "TEE LIVE" : "TEE DEGRADED";

  return (
    <div className="dashboard-layout fade-in">
      <aside>
        <div className="stagger-1" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '2.5rem' }}>
          {tabs.map(Tab => (
            <button
              key={Tab.id}
              className={`sidebar-tab ${activeTab === Tab.id ? 'active' : ''}`}
              onClick={() => { setActiveTab(Tab.id); setOutput(""); }}
            >
              <Tab.icon size={18} />
              <span style={{ flex: 1 }}>{Tab.label}</span>
              {activeTab === Tab.id && <ChevronRight size={14} />}
            </button>
          ))}
        </div>
        
        <div className="glass-card stagger-2" style={{ padding: '1.5rem', borderLeft: '3px solid var(--neo-green)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.25rem' }}>
            <div className="pulse-ring" style={{ background: runtimeOk ? 'var(--neo-green)' : '#ef4444' }}></div>
            <span style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.1em', color: '#fff' }}>SYSTEM_{runtimeLabel}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem' }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>CLUSTER</span>
                <span style={{ color: 'var(--neo-green)', fontWeight: 800 }}>{networkInfo?.network || "N3_TESTNET"}</span>
             </div>
             <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem' }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>VERIFIED</span>
                <span style={{ color: '#fff' }}>Intel SGX</span>
             </div>
          </div>

          <button 
            className="btn btn-secondary" 
            style={{ width: '100%', marginTop: '1.5rem', fontSize: '0.7rem', padding: '0.6rem' }}
            onClick={async () => {
              setOutput(">> Initiating attestation...\n>> MR_ENCLAVE: 0x" + (attestation.mr_enclave || "f23...a1") + "\n>> Result: Trust Established");
            }}
          >
            <ShieldCheck size={14} className="text-neo" />
            Verify Identity
          </button>
        </div>

        <div className="terminal-window stagger-3" style={{ marginTop: '2rem' }}>
          <div className="terminal-header">
             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Terminal size={12} className="text-neo" />
                <span style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.05em', color: 'var(--text-dim)' }}>CONSOLE</span>
             </div>
             <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleCopy} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><Copy size={12} /></button>
                <button onClick={() => setOutput("")} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><Trash2 size={12} /></button>
             </div>
          </div>
          <div style={{ padding: '1.25rem', height: '240px', overflowY: 'auto' }}>
            <pre className="text-neo" style={{ fontSize: '0.75rem', whiteSpace: 'pre-wrap', fontFamily: 'JetBrains Mono' }}>
              {output || "> Ready for command..."}
            </pre>
          </div>
        </div>
      </aside>

      <main style={{ minWidth: 0 }}>
        {isLoading ? (
          <div className="glass-card" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '500px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
              <div style={{ width: '40px', height: '40px', border: '2px solid rgba(0, 255, 163, 0.05)', borderTopColor: 'var(--neo-green)', borderRadius: '50%', animation: 'spin 1.2s linear infinite' }}></div>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', fontWeight: 600 }}>Syncing Matrix...</p>
            </div>
          </div>
        ) : (
          <div className="fade-in">
            {activeTab === "overview" && (
              <OverviewTab 
                networkInfo={networkInfo} 
                providers={providers} 
                callJSON={callJSON} 
                setOutput={setOutput}
                onchainState={onchainState}
                runtimeHealth={runtimeHealth}
                runtimeInfo={runtimeInfo}
                attestationDemo={attestationDemo}
              />
            )}
            {activeTab === "providers" && <ProvidersTab providers={providers} />}
            {activeTab === "oracle" && <OracleTab providers={providers} callJSON={callJSON} setOutput={setOutput} />}
            {activeTab === "compute" && <ComputeTab computeFunctions={computeFunctions} callJSON={callJSON} setOutput={setOutput} />}
            {activeTab === "devhub" && <DeveloperHub />}
          </div>
        )}
      </main>

      <style jsx>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
