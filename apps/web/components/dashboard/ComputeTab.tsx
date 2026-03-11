"use client";

import { useState } from "react";
import { Cpu, Play, FileCode, Database, Code, Fingerprint, Lock, ShieldAlert } from "lucide-react";

export function ComputeTab({ computeFunctions, setOutput }: any) {
  const [selectedFunc, setSelectedFunc] = useState<string>("");
  const [computeInput, setComputeInput] = useState('{"args": [1, 2, 3]}');
  const [userCode, setUserCode] = useState(`function process(data) {\n  // Sandbox Simulation\n  // Access mock data here\n  return data.args.reduce((a, b) => a + b, 0);\n}`);
  const [isSimulating, setIsSimulating] = useState(false);

  // Expanded set of professional templates reflecting built-in capabilities
  const mockTemplates = [
    { name: "hash.sha256", runtime: "JS", desc: "Standard SHA-256 hashing for any JSON payload.", cat: "Hash" },
    { name: "zkp.public_signal_hash", runtime: "JS", desc: "Deterministic digest over ZKP public signals.", cat: "ZKP" },
    { name: "math.modexp", runtime: "JS", desc: "Big integer modular exponentiation.", cat: "Math" },
    { name: "matrix.multiply", runtime: "JS", desc: "High-performance dense matrix multiplication.", cat: "Linear Algebra" },
    { name: "privacy.mask", runtime: "JS", desc: "Sensitive data masking with edge preservation.", cat: "Privacy" },
    { name: "privacy.add_noise", runtime: "JS", desc: "Laplace noise injection for differential privacy.", cat: "Privacy" },
    { name: "random.vrf_generator", runtime: "JS", desc: "Verifiable randomness using TEE entropy.", cat: "Entropy" }
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
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid var(--border-dim)', paddingBottom: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.03em', marginBottom: '0.5rem' }}>Enclave Sandbox</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Test your privacy logic locally before deploying to the prover network.</p>
        </div>
      </div>

      <div className="grid grid-2" style={{ alignItems: 'start', gap: '2rem' }}>
        <div className="card-industrial stagger-1" style={{ padding: '0' }}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-dim)', background: 'rgba(255,255,255,0.02)' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
              <Database className="text-neo" size={16} /> Functions Catalog
            </h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '600px', overflowY: 'auto' }}>
            {mockTemplates.map((f) => (
              <button
                key={f.name}
                onClick={() => {
                  setSelectedFunc(f.name);
                  if (f.name.includes("noise")) {
                    setUserCode(`function process(data) {\n  // data.args: { value: number, scale: number }\n  return { noisy_value: data.args.value + (Math.random() * data.args.scale) };\n}`);
                    setComputeInput('{\n  "args": {\n    "value": 100,\n    "scale": 5\n  }\n}');
                  } else if (f.name.includes("vrf")) {
                    setUserCode(`async function process(data) {\n  const res = await morpheus.get_vrf_random();\n  return res;\n}`);
                    setComputeInput('{\n  "args": {}\n}');
                  } else if (f.name.includes("mask")) {
                    setUserCode(`function process(data) {\n  const s = String(data.args.value);\n  return { masked_value: s.slice(0, 2) + "****" + s.slice(-2) };\n}`);
                    setComputeInput('{\n  "args": {\n    "value": "0x1234567890abcdef"\n  }\n}');
                  } else if (f.name.includes("hash")) {
                    setUserCode(`function process(data) {\n  // Mocking SHA-256 for local sandbox\n  return {\n    hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"\n  };\n}`);
                    setComputeInput('{\n  "args": {\n    "payload": "Hello Neo"\n  }\n}');
                  } else if (f.name.includes("modexp")) {
                    setUserCode(`function process(data) {\n  const { base, exp, mod } = data.args;\n  let res = 1;\n  for (let i = 0; i < exp; i++) {\n    res = (res * base) % mod;\n  }\n  return { modexp_result: res };\n}`);
                    setComputeInput('{\n  "args": {\n    "base": 5,\n    "exp": 3,\n    "mod": 13\n  }\n}');
                  } else if (f.name.includes("matrix")) {
                    setUserCode(`function process(data) {\n  // Mock simplified 2x2 matrix multiplication result for demo\n  return { \n    matrix_result: [[22, 28], [49, 64]] \n  };\n}`);
                    setComputeInput('{\n  "args": {\n    "m1": [[1, 2], [3, 4]],\n    "m2": [[5, 6], [7, 8]]\n  }\n}');
                  } else {
                    setUserCode(`function process(data) {\n  // Example: simple sum reduction\n  if (!data.args || !Array.isArray(data.args)) return 0;\n  return data.args.reduce((a, b) => a + b, 0);\n}`);
                    setComputeInput('{\n  "args": [1, 2, 3]\n}');
                  }
                }}
                style={{
                  width: '100%',
                  padding: '1.5rem',
                  border: 'none',
                  borderBottom: '1px solid var(--border-dim)',
                  background: selectedFunc === f.name ? 'rgba(0,255,163,0.05)' : 'transparent',
                  color: selectedFunc === f.name ? '#fff' : 'var(--text-secondary)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Fingerprint size={16} color={selectedFunc === f.name ? 'var(--neo-green)' : 'var(--text-muted)'} />
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', fontFamily: 'var(--font-mono)' }}>{f.name}</span>
                  </div>
                  <span className="badge-outline" style={{ color: 'var(--accent-purple)', borderColor: 'var(--accent-purple)' }}>{f.cat}</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: selectedFunc === f.name ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)', lineHeight: 1.5 }}>
                  {f.desc}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="card-industrial stagger-2" style={{ padding: '0', marginBottom: '2rem' }}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-dim)', background: 'rgba(255,255,255,0.02)' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                <Code className="text-neo" size={16} /> Sandbox Logic (JS)
              </h3>
            </div>
            <div style={{ padding: '1.5rem' }}>
              <textarea 
                className="code-editor" 
                value={userCode} 
                onChange={(e) => setUserCode(e.target.value)}
                style={{ minHeight: '220px', border: 'none', background: 'transparent', boxShadow: 'none', padding: '0' }}
              />
            </div>
          </div>

          <div className="card-industrial stagger-3" style={{ padding: '0' }}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-dim)', background: 'rgba(255,255,255,0.02)' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                <FileCode className="text-neo" size={16} /> Mock Input (JSON)
              </h3>
            </div>
            <div style={{ padding: '1.5rem' }}>
              <textarea 
                className="code-editor" 
                value={computeInput} 
                onChange={(e) => setComputeInput(e.target.value)}
                style={{ minHeight: '100px', border: 'none', background: 'transparent', boxShadow: 'none', padding: '0', marginBottom: '1.5rem' }}
              />
              <button className="btn-ata" style={{ width: '100%', justifyContent: 'center' }} onClick={handleExecute} disabled={isSimulating}>
                {isSimulating ? 'EXECUTING...' : 'RUN LOCAL SIMULATION'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
