'use client';

import { useState } from 'react';
import {
  Cpu,
  FileCode,
  Database,
  Code,
  Fingerprint,
  Lock,
  ShieldAlert,
  Copy,
  CheckCircle2,
  Zap,
} from 'lucide-react';
import { NETWORKS } from '@/lib/onchain-data';

function encodeUtf8Base64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return window.btoa(binary);
}

export function ComputeTab({ computeFunctions: _computeFunctions, setOutput }: any) {
  const defaultCallbackHash =
    NETWORKS.neo_n3.exampleConsumer || NETWORKS.neo_n3.callbackConsumer || '';
  const [selectedFunc, setSelectedFunc] = useState<string>('');
  const [computeInput, setComputeInput] = useState('{\n  "values": [1, 2, 3]\n}');
  const [userCode, setUserCode] = useState(
    `function process(input, helpers) {\\n  const values = Array.isArray(input.values) ? input.values : [];\\n  return {\\n    total: values.reduce((sum, value) => sum + Number(value || 0), 0),\\n    generated_at: helpers.getCurrentTimestamp(),\\n  };\\n}`
  );
  const [scriptRefJson, setScriptRefJson] = useState(
    '{\\n  \"contract_hash\": \"0x1111111111111111111111111111111111111111\",\\n  \"method\": \"getScript\",\\n  \"script_name\": \"sum\"\\n}'
  );
  const [isSimulating, setIsSimulating] = useState(false);
  const [generatedPackage, setGeneratedPackage] = useState<{
    requestType: string;
    payload: Record<string, unknown>;
    payloadJson: string;
    neoN3Snippet: string;
  } | null>(null);
  const [walletCallbackHash, setWalletCallbackHash] = useState(defaultCallbackHash);
  const [walletCallbackMethod, setWalletCallbackMethod] = useState('onOracleResult');
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  const mockTemplates = [
    {
      name: 'script.sum',
      runtime: 'JS',
      desc: 'Custom JS entry point using the actual process(input, helpers) signature.',
      cat: 'Custom JS',
    },
    {
      name: 'script.timestamp',
      runtime: 'JS',
      desc: 'Uses the injected helper set to timestamp results.',
      cat: 'Helpers',
    },
    {
      name: 'script.base64_decode',
      runtime: 'JS',
      desc: 'Uses helpers.base64Decode for deterministic input transforms.',
      cat: 'Helpers',
    },
    {
      name: 'builtin.math.modexp',
      runtime: 'Builtin',
      desc: 'Reference payload shape for modular exponentiation.',
      cat: 'Math',
    },
    {
      name: 'builtin.matrix.multiply',
      runtime: 'Builtin',
      desc: 'Reference payload shape for matrix multiplication.',
      cat: 'Linear Algebra',
    },
    {
      name: 'builtin.privacy.mask',
      runtime: 'Builtin',
      desc: 'Reference payload shape for masking a sensitive string.',
      cat: 'Privacy',
    },
    {
      name: 'builtin.zkp.public_signal_hash',
      runtime: 'Builtin',
      desc: 'Reference payload shape for a ZKP digest helper.',
      cat: 'ZKP',
    },
    {
      name: 'builtin.zkp.groth16.verify',
      runtime: 'Builtin',
      desc: 'Reference payload shape for Groth16 proof verification.',
      cat: 'ZKP',
    },
    {
      name: 'builtin.zkp.zerc20.single_withdraw.verify',
      runtime: 'Builtin',
      desc: 'Reference payload shape for zERC20 single-withdraw proof preflight.',
      cat: 'ZKP',
    },
    {
      name: 'wasm.reference',
      runtime: 'WASM',
      desc: 'Use WASM when you need stronger isolation and a 30s bounded runtime.',
      cat: 'WASM',
    },
  ];

  function escapeForCSharp(value: string) {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function applyComputePreset(name: string) {
    setSelectedFunc(name);
    if (name.includes('timestamp')) {
      setUserCode(
        `function process(input, helpers) {\n  return {\n    label: input.label || "demo",\n    generated_at: helpers.getCurrentTimestamp(),\n  };\n}`
      );
      setComputeInput('{\n  "label": "demo-run"\n}');
      return;
    }
    if (name.includes('base64_decode')) {
      setUserCode(
        `function process(input, helpers) {\n  return {\n    decoded: helpers.base64Decode(input.value || ""),\n  };\n}`
      );
      setComputeInput('{\n  "value": "bmVvLW1vcnBoZXVz"\n}');
      return;
    }
    if (name.includes('privacy.mask')) {
      setUserCode(
        `// Builtin payload reference\nfunction process(input, helpers) {\n  return {\n    mode: "builtin",\n    function: "privacy.mask",\n    input: { value: "0x1234567890abcdef", unmasked_left: 2, unmasked_right: 2 }\n  };\n}`
      );
      setComputeInput('{\n  "note": "reference only"\n}');
      return;
    }
    if (name.includes('public_signal_hash')) {
      setUserCode(
        `// Builtin payload reference\nfunction process(input, helpers) {\n  return {\n    mode: "builtin",\n    function: "zkp.public_signal_hash",\n    input: { circuit_id: "demo", signals: [1, 2, 3] }\n  };\n}`
      );
      setComputeInput('{\n  "note": "reference only"\n}');
      return;
    }
    if (name.includes('groth16.verify')) {
      setUserCode(
        `// Builtin payload reference\nfunction process(input, helpers) {\n  return {\n    mode: "builtin",\n    function: "zkp.groth16.verify",\n    input: {\n      verifying_key: { protocol: "groth16", curve: "bn128" },\n      public_signals: ["1", "2"],\n      proof: { pi_a: [], pi_b: [], pi_c: [] }\n    }\n  };\n}`
      );
      setComputeInput('{\n  "note": "reference only"\n}');
      return;
    }
    if (name.includes('zerc20.single_withdraw.verify')) {
      setUserCode(
        `// Builtin payload reference\nfunction process(input, helpers) {\n  return {\n    mode: "builtin",\n    function: "zkp.zerc20.single_withdraw.verify",\n    input: {\n      skip_proof_verification: true,\n      public_inputs: {\n        recipient: "0x1111111111111111111111111111111111111111",\n        withdraw_value: "1000000",\n        tree_root: "0x2222222222222222222222222222222222222222222222222222222222222222",\n        path_indices: "0x01",\n        blacklisted_root: "0x3333333333333333333333333333333333333333333333333333333333333333"\n      }\n    }\n  };\n}`
      );
      setComputeInput('{\n  "note": "reference only"\n}');
      return;
    }
    if (name.includes('modexp')) {
      setUserCode(
        `// Builtin payload reference\nfunction process(input, helpers) {\n  return {\n    mode: "builtin",\n    function: "math.modexp",\n    input: { base: "5", exponent: "3", modulus: "13" }\n  };\n}`
      );
      setComputeInput('{\n  "note": "reference only"\n}');
      return;
    }
    if (name.includes('matrix')) {
      setUserCode(
        `// Builtin payload reference\nfunction process(input, helpers) {\n  return {\n    mode: "builtin",\n    function: "matrix.multiply",\n    input: { left: [[1, 2], [3, 4]], right: [[5, 6], [7, 8]] }\n  };\n}`
      );
      setComputeInput('{\n  "note": "reference only"\n}');
      return;
    }
    if (name.includes('wasm')) {
      setUserCode(
        `// WASM is the recommended path for stronger isolation.\nfunction process(input, helpers) {\n  return {\n    mode: "wasm",\n    note: "Compile a .wasm module and place it into wasm_base64."\n  };\n}`
      );
      setComputeInput('{\n  "note": "reference only"\n}');
      return;
    }
    setUserCode(
      `function process(input, helpers) {\n  const values = Array.isArray(input.values) ? input.values : [];\n  return {\n    total: values.reduce((sum, value) => sum + Number(value || 0), 0),\n    generated_at: helpers.getCurrentTimestamp(),\n  };\n}`
    );
    setComputeInput('{\n  "values": [1, 2, 3]\n}');
  }

  async function handleCopy(id: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedItem(id);
    setTimeout(() => setCopiedItem(null), 1500);
  }

  const handleExecute = async () => {
    setIsSimulating(true);
    const logs: string[] = [
      '>> Initializing local authoring sandbox...',
      '>> This simulation does not contact the live worker or the blockchain.',
    ];

    try {
      const helpers = {
        getCurrentTimestamp: () => Math.floor(Date.now() / 1000),
        base64Decode: (value: string) => {
          if (typeof window !== 'undefined') return window.atob(value);
          return Buffer.from(value, 'base64').toString('utf8');
        },
      };

      const input = JSON.parse(computeInput);

      const simulateFunc = new Function(
        'helpers',
        'input',
        `
        ${userCode}
        return typeof process === 'function'
          ? process(input, helpers)
          : 'No process(input, helpers) function defined.';
      `
      );

      const result = await simulateFunc(helpers, input);
      logs.push('>> Simulation complete.');
      logs.push(`>> Return Value: ${JSON.stringify(result, null, 2)}`);

      setOutput(logs.join('\n'));
    } catch (err: any) {
      logs.push(`!! [ERROR] ${err.message}`);
      setOutput(logs.join('\n'));
    } finally {
      setIsSimulating(false);
    }
  };

  const generateOnchainPackage = () => {
    let payload: Record<string, unknown>;

    if (selectedFunc.includes('privacy.mask')) {
      payload = {
        mode: 'builtin',
        function: 'privacy.mask',
        input: { value: '0x1234567890abcdef', unmasked_left: 2, unmasked_right: 2 },
        target_chain: 'neo_n3',
      };
    } else if (selectedFunc.includes('public_signal_hash')) {
      payload = {
        mode: 'builtin',
        function: 'zkp.public_signal_hash',
        input: { circuit_id: 'demo', signals: [1, 2, 3] },
        target_chain: 'neo_n3',
      };
    } else if (selectedFunc.includes('modexp')) {
      payload = {
        mode: 'builtin',
        function: 'math.modexp',
        input: { base: '5', exponent: '3', modulus: '13' },
        target_chain: 'neo_n3',
      };
    } else if (selectedFunc.includes('matrix')) {
      payload = {
        mode: 'builtin',
        function: 'matrix.multiply',
        input: {
          left: [
            [1, 2],
            [3, 4],
          ],
          right: [
            [5, 6],
            [7, 8],
          ],
        },
        target_chain: 'neo_n3',
      };
    } else if (selectedFunc.includes('wasm')) {
      payload = {
        mode: 'wasm',
        wasm_base64: '<compiled wasm module>',
        input: { note: 'replace with real input' },
        target_chain: 'neo_n3',
      };
    } else {
      let parsedInput: Record<string, unknown> = {};
      try {
        parsedInput = JSON.parse(computeInput);
      } catch {
        parsedInput = {};
      }
      let parsedScriptRef: Record<string, unknown> | null = null;
      try {
        parsedScriptRef = scriptRefJson.trim() ? JSON.parse(scriptRefJson) : null;
      } catch {
        parsedScriptRef = null;
      }
      payload = {
        mode: 'script',
        entry_point: 'process',
        input: parsedInput,
        target_chain: 'neo_n3',
      };
      if (parsedScriptRef && typeof parsedScriptRef === 'object') {
        payload.script_ref = parsedScriptRef;
      } else {
        payload.script = userCode;
      }
    }

    const payloadJson = JSON.stringify(payload, null, 2);
    const compactPayloadJson = JSON.stringify(payload);
    const neoN3Snippet = `string payloadJson = "${escapeForCSharp(compactPayloadJson)}";

BigInteger requestId = (BigInteger)Contract.Call(
    OracleHash,
    "request",
    CallFlags.All,
    "compute",
    (ByteString)payloadJson,
    Runtime.ExecutingScriptHash,
    "onOracleResult"
);`;

    setGeneratedPackage({
      requestType: 'compute',
      payload,
      payloadJson,
      neoN3Snippet,
    });

    setOutput(
      [
        '>> Compute request package generated.',
        '>> Request type: compute',
        `>> Oracle contract: ${NETWORKS.neo_n3.oracle}`,
        '>> Submit this payload through the on-chain Oracle contract.',
        '',
        payloadJson,
      ].join('\n')
    );
  };

  const payloadBase64 = generatedPackage
    ? encodeUtf8Base64(JSON.stringify(generatedPackage.payload))
    : '';
  const neoRpcInvoke = generatedPackage
    ? JSON.stringify(
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'invokefunction',
          params: [
            NETWORKS.neo_n3.oracle,
            'request',
            [
              { type: 'String', value: 'compute' },
              { type: 'ByteArray', value: payloadBase64 },
              { type: 'Hash160', value: walletCallbackHash },
              { type: 'String', value: walletCallbackMethod },
            ],
          ],
        },
        null,
        2
      )
    : '';
  const callbackQueryTemplate = JSON.stringify(
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'invokefunction',
      params: [walletCallbackHash, 'getCallback', [{ type: 'Integer', value: '<requestId>' }]],
    },
    null,
    2
  );

  return (
    <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          borderBottom: '1px solid var(--border-dim)',
          paddingBottom: '1rem',
        }}
      >
        <div>
          <h2
            style={{
              fontSize: '2rem',
              fontWeight: 900,
              letterSpacing: '-0.03em',
              marginBottom: '0.5rem',
            }}
          >
            Enclave Sandbox
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            Author custom JS payloads locally using the same function signatures that the live
            runtime expects.
          </p>
        </div>
      </div>

      <div className="card-industrial" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
          <Zap size={18} color="var(--neo-green)" />
          <h3
            style={{
              margin: 0,
              fontSize: '0.95rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              fontFamily: 'var(--font-mono)',
            }}
          >
            Scenario Presets
          </h3>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          <button
            className="btn-secondary"
            style={{ border: '1px solid var(--border-dim)' }}
            onClick={() => applyComputePreset('builtin.privacy.mask')}
          >
            <Lock size={14} /> privacy.mask
          </button>
          <button
            className="btn-secondary"
            style={{ border: '1px solid var(--border-dim)' }}
            onClick={() => applyComputePreset('builtin.math.modexp')}
          >
            <Cpu size={14} /> math.modexp
          </button>
          <button
            className="btn-secondary"
            style={{ border: '1px solid var(--border-dim)' }}
            onClick={() => applyComputePreset('builtin.zkp.public_signal_hash')}
          >
            <Database size={14} /> zkp.public_signal_hash
          </button>
          <button
            className="btn-secondary"
            style={{ border: '1px solid var(--border-dim)' }}
            onClick={() => applyComputePreset('builtin.zkp.groth16.verify')}
          >
            <ShieldAlert size={14} /> zkp.groth16.verify
          </button>
          <button
            className="btn-secondary"
            style={{ border: '1px solid var(--border-dim)' }}
            onClick={() => applyComputePreset('builtin.zkp.zerc20.single_withdraw.verify')}
          >
            <ShieldAlert size={14} /> zerc20.verify
          </button>
          <button
            className="btn-secondary"
            style={{ border: '1px solid var(--border-dim)' }}
            onClick={() => applyComputePreset('builtin.matrix.multiply')}
          >
            <Database size={14} /> matrix.multiply
          </button>
          <button
            className="btn-secondary"
            style={{ border: '1px solid var(--border-dim)' }}
            onClick={() => applyComputePreset('wasm.reference')}
          >
            <FileCode size={14} /> wasm.reference
          </button>
        </div>
      </div>

      <div className="grid grid-2" style={{ alignItems: 'start', gap: '2rem' }}>
        <div className="card-industrial stagger-1" style={{ padding: '0' }}>
          <div
            style={{
              padding: '1.5rem',
              borderBottom: '1px solid var(--border-dim)',
              background: 'rgba(255,255,255,0.02)',
            }}
          >
            <h3
              style={{
                fontSize: '0.9rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                textTransform: 'uppercase',
                fontFamily: 'var(--font-mono)',
              }}
            >
              <Database className="text-neo" size={16} /> Functions Catalog
            </h3>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '600px',
              overflowY: 'auto',
            }}
          >
            {mockTemplates.map((f) => (
              <button
                key={f.name}
                onClick={() => applyComputePreset(f.name)}
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
                  gap: '8px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    width: '100%',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Fingerprint
                      size={16}
                      color={selectedFunc === f.name ? 'var(--neo-green)' : 'var(--text-muted)'}
                    />
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {f.name}
                    </span>
                  </div>
                  <span
                    className="badge-outline"
                    style={{ color: 'var(--accent-purple)', borderColor: 'var(--accent-purple)' }}
                  >
                    {f.cat}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: selectedFunc === f.name ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)',
                    lineHeight: 1.5,
                  }}
                >
                  {f.desc}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="card-industrial stagger-2" style={{ padding: '0', marginBottom: '2rem' }}>
            <div
              style={{
                padding: '1.5rem',
                borderBottom: '1px solid var(--border-dim)',
                background: 'rgba(255,255,255,0.02)',
              }}
            >
              <h3
                style={{
                  fontSize: '0.9rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  textTransform: 'uppercase',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <Code className="text-neo" size={16} /> Sandbox Logic (JS)
              </h3>
            </div>
            <div style={{ padding: '1.5rem' }}>
              <textarea
                className="code-editor"
                value={userCode}
                onChange={(e) => setUserCode(e.target.value)}
                style={{
                  minHeight: '220px',
                  border: 'none',
                  background: 'transparent',
                  boxShadow: 'none',
                  padding: '0',
                }}
              />
              <div
                style={{
                  marginTop: '1rem',
                  paddingTop: '1rem',
                  borderTop: '1px solid var(--border-dim)',
                }}
              >
                <div
                  style={{
                    fontSize: '0.65rem',
                    color: 'var(--text-secondary)',
                    fontWeight: 800,
                    marginBottom: '0.35rem',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  OPTIONAL SCRIPT_REF (OVERRIDES INLINE SCRIPT)
                </div>
                <textarea
                  className="code-editor"
                  value={scriptRefJson}
                  onChange={(e) => setScriptRefJson(e.target.value)}
                  style={{
                    minHeight: '120px',
                    border: 'none',
                    background: 'transparent',
                    boxShadow: 'none',
                    padding: '0',
                  }}
                />
              </div>
            </div>
          </div>

          <div className="card-industrial stagger-3" style={{ padding: '0' }}>
            <div
              style={{
                padding: '1.5rem',
                borderBottom: '1px solid var(--border-dim)',
                background: 'rgba(255,255,255,0.02)',
              }}
            >
              <h3
                style={{
                  fontSize: '0.9rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  textTransform: 'uppercase',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <FileCode className="text-neo" size={16} /> Mock Input (JSON)
              </h3>
            </div>
            <div style={{ padding: '1.5rem' }}>
              <div className="grid grid-2" style={{ gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Wallet / Direct Test Callback Hash</label>
                  <input
                    className="neo-input"
                    value={walletCallbackHash}
                    onChange={(event) => setWalletCallbackHash(event.target.value)}
                    placeholder="0x..."
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Callback Method</label>
                  <input
                    className="neo-input"
                    value={walletCallbackMethod}
                    onChange={(event) => setWalletCallbackMethod(event.target.value)}
                    placeholder="onOracleResult"
                  />
                </div>
              </div>
              <textarea
                className="code-editor"
                value={computeInput}
                onChange={(e) => setComputeInput(e.target.value)}
                style={{
                  minHeight: '100px',
                  border: 'none',
                  background: 'transparent',
                  boxShadow: 'none',
                  padding: '0',
                  marginBottom: '1.5rem',
                }}
              />
              <button
                className="btn-ata"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={handleExecute}
                disabled={isSimulating}
              >
                {isSimulating ? 'EXECUTING...' : 'RUN LOCAL AUTHORING CHECK'}
              </button>
              <button
                className="btn-secondary"
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  marginTop: '0.75rem',
                  border: '1px solid var(--border-dim)',
                }}
                onClick={generateOnchainPackage}
              >
                Generate On-Chain Compute Package
              </button>
            </div>
          </div>
        </div>
      </div>

      {generatedPackage && (
        <div className="card-industrial stagger-3" style={{ padding: '0' }}>
          <div
            style={{
              padding: '1.5rem',
              borderBottom: '1px solid var(--border-dim)',
              background: 'rgba(255,255,255,0.02)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <h3
                style={{
                  fontSize: '0.9rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  fontFamily: 'var(--font-mono)',
                  marginBottom: '0.25rem',
                }}
              >
                Generated Compute Package
              </h3>
              <div
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                requestType = {generatedPackage.requestType}
              </div>
            </div>
            <div
              className="badge-outline"
              style={{ color: 'var(--neo-green)', borderColor: 'var(--neo-green)' }}
            >
              <CheckCircle2 size={12} style={{ marginRight: '6px' }} />
              READY
            </div>
          </div>
          <div
            style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}
          >
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                className="btn-secondary"
                style={{ border: '1px solid var(--border-dim)' }}
                onClick={() => handleCopy('compute-payload', generatedPackage.payloadJson)}
              >
                <Copy size={14} />{' '}
                {copiedItem === 'compute-payload' ? 'Copied Payload' : 'Copy Payload JSON'}
              </button>
              <button
                className="btn-secondary"
                style={{ border: '1px solid var(--border-dim)' }}
                onClick={() => handleCopy('compute-n3', generatedPackage.neoN3Snippet)}
              >
                <Copy size={14} />{' '}
                {copiedItem === 'compute-n3' ? 'Copied N3' : 'Copy Neo N3 Snippet'}
              </button>
            </div>
            <div
              style={{ background: '#000', border: '1px solid var(--border-dim)', padding: '1rem' }}
            >
              <div
                style={{
                  fontSize: '0.65rem',
                  color: 'var(--text-secondary)',
                  fontWeight: 800,
                  marginBottom: '0.5rem',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                PAYLOAD JSON
              </div>
              <pre
                style={{
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  color: 'var(--neo-green)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.78rem',
                }}
              >
                {generatedPackage.payloadJson}
              </pre>
            </div>
            <div className="grid grid-2" style={{ gap: '1rem' }}>
              <div
                style={{
                  background: '#000',
                  border: '1px solid var(--border-dim)',
                  padding: '1rem',
                }}
              >
                <div
                  style={{
                    fontSize: '0.65rem',
                    color: 'var(--text-secondary)',
                    fontWeight: 800,
                    marginBottom: '0.5rem',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  PAYLOAD BYTEARRAY (BASE64 UTF-8)
                </div>
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    color: 'var(--neo-green)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.78rem',
                  }}
                >
                  {payloadBase64}
                </pre>
              </div>
              <div
                style={{
                  background: '#000',
                  border: '1px solid var(--border-dim)',
                  padding: '1rem',
                }}
              >
                <div
                  style={{
                    fontSize: '0.65rem',
                    color: 'var(--text-secondary)',
                    fontWeight: 800,
                    marginBottom: '0.5rem',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  NEO N3 RPC invokeFunction
                </div>
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    color: '#fff',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.78rem',
                  }}
                >
                  {neoRpcInvoke}
                </pre>
              </div>
            </div>
            <div className="grid grid-2" style={{ gap: '1rem' }}>
              <div
                style={{
                  background: '#000',
                  border: '1px solid var(--border-dim)',
                  padding: '1rem',
                }}
              >
                <div
                  style={{
                    fontSize: '0.65rem',
                    color: 'var(--text-secondary)',
                    fontWeight: 800,
                    marginBottom: '0.5rem',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  NEO N3 SUBMISSION
                </div>
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    color: '#fff',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.78rem',
                  }}
                >
                  {generatedPackage.neoN3Snippet}
                </pre>
              </div>
              <div
                style={{
                  background: '#000',
                  border: '1px solid var(--border-dim)',
                  padding: '1rem',
                }}
              >
                <div
                  style={{
                    fontSize: '0.65rem',
                    color: 'var(--text-secondary)',
                    fontWeight: 800,
                    marginBottom: '0.5rem',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  CALLBACK READBACK
                </div>
                <div style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  <div>
                    1. Submit to <code>{NETWORKS.neo_n3.oracle}</code> with request type{' '}
                    <code>compute</code>.
                  </div>
                  <div>
                    2. Read the emitted <code>requestId</code>.
                  </div>
                  <div>
                    3. Read the kernel-managed result path first, or query your optional callback
                    adapter&apos;s <code>getCallback(requestId)</code> and use the template below.
                  </div>
                </div>
              </div>
            </div>
            <div
              style={{ background: '#000', border: '1px solid var(--border-dim)', padding: '1rem' }}
            >
              <div
                style={{
                  fontSize: '0.65rem',
                  color: 'var(--text-secondary)',
                  fontWeight: 800,
                  marginBottom: '0.5rem',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                CALLBACK QUERY TEMPLATE
              </div>
              <pre
                style={{
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  color: '#fff',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.78rem',
                }}
              >
                {callbackQueryTemplate}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
