'use client';

import { useState } from 'react';
import { NETWORKS } from '@/lib/onchain-data';

import { ComputeFunctions } from './ComputeFunctions';
import { ComputeEditor } from './ComputeEditor';
import { ComputeOutput } from './ComputeOutput';

function encodeUtf8Base64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return window.btoa(binary);
}

function escapeForCSharp(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
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

      <ComputeFunctions selectedFunc={selectedFunc} onSelectPreset={applyComputePreset} />

      <ComputeEditor
        userCode={userCode}
        setUserCode={setUserCode}
        scriptRefJson={scriptRefJson}
        setScriptRefJson={setScriptRefJson}
        computeInput={computeInput}
        setComputeInput={setComputeInput}
        walletCallbackHash={walletCallbackHash}
        setWalletCallbackHash={setWalletCallbackHash}
        walletCallbackMethod={walletCallbackMethod}
        setWalletCallbackMethod={setWalletCallbackMethod}
        isSimulating={isSimulating}
        onExecute={handleExecute}
        onGeneratePackage={generateOnchainPackage}
      />

      {generatedPackage && (
        <ComputeOutput
          generatedPackage={generatedPackage}
          payloadBase64={payloadBase64}
          neoRpcInvoke={neoRpcInvoke}
          callbackQueryTemplate={callbackQueryTemplate}
          copiedItem={copiedItem}
          onCopy={handleCopy}
        />
      )}
    </div>
  );
}
