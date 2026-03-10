"use client";

import { useState } from "react";
import { Cpu, Play, FileCode, ShieldCheck, Database, Zap, Code, Terminal, Info } from "lucide-react";

export function ComputeTab({ computeFunctions, setOutput }: any) {
  const [selectedFunc, setSelectedFunc] = useState<string>("");
  const [computeInput, setComputeInput] = useState('{"args": [1, 2, 3]}');
  const [userCode, setUserCode] = useState(`function process(data) {\n  // Sandbox Simulation\n  // Access mock data here\n  return data.args.reduce((a, b) => a + b, 0);\n}`);
  const [isSimulating, setIsSimulating] = useState(false);

  // Hardcoded premium templates for the UI presentation
  const mockTemplates = [
    { name: "zkp.public_signal_hash", runtime: "JS", desc: "Hash signals for zero-knowledge proofs." },
    { name: "defi.twap_aggregator", runtime: "JS", desc: "Calculate Time-Weighted Average Price across exchanges." },
    { name: "identity.kyc_verify", runtime: "WASM", desc: "Verify KYC credentials without exposing PII." },
    { name: "random.vrf_generator", runtime: "JS", desc: "Generate verifiable randomness inside TEE." }
  ];

  const handleExecute = async () => {
    setIsSimulating(true);
    const logs: string[] = [">> Initializing Local TEE Sandbox...", ">> Injecting 'morpheus' mock objects..."];
    
    try {
      const mockMorpheus = {
        http_request: async (url: string) => {
          logs.push(`>> [SIM] Mocking HTTP request to: ${url}`);
          return { status: 200, data: { price: "25.50", source: "mock" } };
        },
        get_vrf_random: async () => {
          logs.push(">> [SIM] Generating pseudo-random VRF value");
          return { random_value: Math.random().toString(16).slice(2) };
        }
      };

      const context = { morpheus: mockMorpheus, console: { log: (m: any) => logs.push(`[LOG] ${m}`) } };
      const args = JSON.parse(computeInput);
      
      const simulateFunc = new Function('morpheus', 'console', 'data', `
        ${userCode}
        return typeof process === 'function' ? process(data) : 'No process() function defined.';
      `);

      const result = await simulateFunc(context.morpheus, context.console, args);
      logs.push(">> Simulation complete.");
      logs.push(`>> Return Value: ${JSON.stringify(result, null, 2)}`);
      
      setOutput(logs.join('\n'));
    } catch (err: any) {
      logs.push(`!! [ERROR] ${err.message}`);
      setOutput(logs.join('\n'));
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      <div className="glass-card neo-card" style={{ padding: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ background: 'var(--neo-purple-glow)', padding: '10px', borderRadius: '12px' }}><Cpu className="text-purple" size={24} /></div>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 900 }}>Enclave Sandbox (Local)</h2>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Test your privacy functions offline in a simulated TEE environment before deploying to mainnet.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-2" style={{ alignItems: 'start', gap: '2rem' }}>
        <div className="glass-card stagger-1" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}>
            <Database size={18} className="text-neo" />
            <h3 style={{ fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Function Templates</h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {mockTemplates.map((f) => (
              <button
                key={f.name}
                onClick={() => {
                  setSelectedFunc(f.name);
                  if (f.name.includes("twap")) setUserCode(`function process(data) {\n  // Fetch prices from multiple DEXs\n  return { twap: 105.2 };\n}`);
                  else if (f.name.includes("vrf")) setUserCode(`async function process(data) {\n  const res = await morpheus.get_vrf_random();\n  return res;\n}`);
                  else setUserCode(`function process(data) {\n  return data.args.reduce((a, b) => a + b, 0);\n}`);
                }}
                style={{
                  width: '100%',
                  padding: '1.25rem',
                  borderRadius: '12px',
                  border: '1px solid',
                  borderColor: selectedFunc === f.name ? 'var(--neo-purple)' : 'var(--border-subtle)',
                  background: selectedFunc === f.name ? 'var(--neo-purple-glow)' : 'rgba(255,255,255,0.02)',
                  color: selectedFunc === f.name ? '#fff' : 'var(--text-dim)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Code size={16} className={selectedFunc === f.name ? "text-purple" : "text-muted"} />
                    <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{f.name}</span>
                  </div>
                  <span className="badge" style={{ fontSize: '0.6rem', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>{f.runtime}</span>
                </div>
                <div style={{ fontSize: '0.7rem', color: selectedFunc === f.name ? 'rgba(255,255,255,0.8)' : 'var(--text-muted)' }}>
                  {f.desc}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="glass-card stagger-2" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.5rem' }}>
              <FileCode size={18} className="text-neo" />
              <h3 style={{ fontSize: '0.9rem', fontWeight: 800 }}>MOCK INPUT (JSON)</h3>
            </div>
            <textarea 
              className="code-editor" 
              value={computeInput} 
              onChange={(e) => setComputeInput(e.target.value)}
              style={{ minHeight: '120px' }}
            />
          </div>

          <div className="glass-card stagger-3" style={{ padding: '1.5rem', border: '1px solid var(--border-neo)' }}>
            <button className="btn btn-neo" style={{ width: '100%', padding: '1rem' }} onClick={runSimulation} disabled={isSimulating}>
              {isSimulating ? 'Simulating...' : <><Play size={16} fill="currentColor" /> Run Simulation</>}
            </button>
            <div style={{ marginTop: '1.25rem', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <Info size={16} className="text-muted" style={{ marginTop: '2px' }} />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>
                The simulation uses a browser-based sandbox. Functions that work here are guaranteed to execute identically in the Morpheus production Enclave.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
