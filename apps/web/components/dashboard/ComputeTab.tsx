"use client";

import { useState } from "react";
import { Cpu, Play, FileCode, Database, Code, Fingerprint, Lock, ShieldAlert } from "lucide-react";

export function ComputeTab({ computeFunctions, setOutput }: any) {
  const [selectedFunc, setSelectedFunc] = useState<string>("");
  const [computeInput, setComputeInput] = useState('{\n  "values": [1, 2, 3]\n}');
  const [userCode, setUserCode] = useState(`function process(input, helpers) {\n  const values = Array.isArray(input.values) ? input.values : [];\n  return {\n    total: values.reduce((sum, value) => sum + Number(value || 0), 0),\n    generated_at: helpers.getCurrentTimestamp(),\n  };\n}`);
  const [isSimulating, setIsSimulating] = useState(false);

  const mockTemplates = [
    { name: "script.sum", runtime: "JS", desc: "Custom JS entry point using the actual process(input, helpers) signature.", cat: "Custom JS" },
    { name: "script.timestamp", runtime: "JS", desc: "Uses the injected helper set to timestamp results.", cat: "Helpers" },
    { name: "script.base64_decode", runtime: "JS", desc: "Uses helpers.base64Decode for deterministic input transforms.", cat: "Helpers" },
    { name: "builtin.math.modexp", runtime: "Builtin", desc: "Reference payload shape for modular exponentiation.", cat: "Math" },
    { name: "builtin.matrix.multiply", runtime: "Builtin", desc: "Reference payload shape for matrix multiplication.", cat: "Linear Algebra" },
    { name: "builtin.privacy.mask", runtime: "Builtin", desc: "Reference payload shape for masking a sensitive string.", cat: "Privacy" },
    { name: "builtin.zkp.public_signal_hash", runtime: "Builtin", desc: "Reference payload shape for a ZKP digest helper.", cat: "ZKP" },
    { name: "wasm.reference", runtime: "WASM", desc: "Use WASM when you need stronger isolation and a 30s bounded runtime.", cat: "WASM" }
  ];

  const handleExecute = async () => {
    setIsSimulating(true);
    const logs: string[] = [">> Initializing local authoring sandbox...", ">> This simulation does not contact the live worker or the blockchain."];
    
    try {
      const helpers = {
        getCurrentTimestamp: () => Math.floor(Date.now() / 1000),
        base64Decode: (value: string) => {
          if (typeof window !== "undefined") return window.atob(value);
          return Buffer.from(value, "base64").toString("utf8");
        },
      };

      const input = JSON.parse(computeInput);
      
      const simulateFunc = new Function('helpers', 'input', `
        ${userCode}
        return typeof process === 'function'
          ? process(input, helpers)
          : 'No process(input, helpers) function defined.';
      `);

      const result = await simulateFunc(helpers, input);
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
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Author custom JS payloads locally using the same function signatures that the live runtime expects.</p>
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
                  if (f.name.includes("timestamp")) {
                    setUserCode(`function process(input, helpers) {\n  return {\n    label: input.label || "demo",\n    generated_at: helpers.getCurrentTimestamp(),\n  };\n}`);
                    setComputeInput('{\n  "label": "demo-run"\n}');
                  } else if (f.name.includes("base64_decode")) {
                    setUserCode(`function process(input, helpers) {\n  return {\n    decoded: helpers.base64Decode(input.value || ""),\n  };\n}`);
                    setComputeInput('{\n  "value": "bmVvLW1vcnBoZXVz"\n}');
                  } else if (f.name.includes("privacy.mask")) {
                    setUserCode(`// Builtin payload reference\n// Submit this through requestType="compute"\n// with mode="builtin" and function="privacy.mask"\nfunction process(input, helpers) {\n  return {\n    mode: "builtin",\n    function: "privacy.mask",\n    input: { value: "0x1234567890abcdef", unmasked_left: 2, unmasked_right: 2 }\n  };\n}`);
                    setComputeInput('{\n  "note": "reference only"\n}');
                  } else if (f.name.includes("public_signal_hash")) {
                    setUserCode(`// Builtin payload reference\nfunction process(input, helpers) {\n  return {\n    mode: "builtin",\n    function: "zkp.public_signal_hash",\n    input: { circuit_id: "demo", signals: [1, 2, 3] }\n  };\n}`);
                    setComputeInput('{\n  "note": "reference only"\n}');
                  } else if (f.name.includes("modexp")) {
                    setUserCode(`// Builtin payload reference\nfunction process(input, helpers) {\n  return {\n    mode: "builtin",\n    function: "math.modexp",\n    input: { base: "5", exponent: "3", modulus: "13" }\n  };\n}`);
                    setComputeInput('{\n  "note": "reference only"\n}');
                  } else if (f.name.includes("matrix")) {
                    setUserCode(`// Builtin payload reference\nfunction process(input, helpers) {\n  return {\n    mode: "builtin",\n    function: "matrix.multiply",\n    input: { left: [[1, 2], [3, 4]], right: [[5, 6], [7, 8]] }\n  };\n}`);
                    setComputeInput('{\n  "note": "reference only"\n}');
                  } else if (f.name.includes("wasm")) {
                    setUserCode(`// WASM is the recommended path for stronger isolation.\n// Build a module and submit it through the on-chain Oracle/Compute request.\nfunction process(input, helpers) {\n  return {\n    mode: "wasm",\n    note: "Compile a .wasm module and place it into wasm_base64."\n  };\n}`);
                    setComputeInput('{\n  "note": "reference only"\n}');
                  } else {
                    setUserCode(`function process(input, helpers) {\n  const values = Array.isArray(input.values) ? input.values : [];\n  return {\n    total: values.reduce((sum, value) => sum + Number(value || 0), 0),\n    generated_at: helpers.getCurrentTimestamp(),\n  };\n}`);
                    setComputeInput('{\n  "values": [1, 2, 3]\n}');
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
                {isSimulating ? 'EXECUTING...' : 'RUN LOCAL AUTHORING CHECK'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
