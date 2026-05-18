'use client';

import { useEffect, useRef, useState } from 'react';
import { invokeMorpheusOracleRequest } from '@/lib/nep21';
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

interface ComputeTabProps {
  computeFunctions?: unknown;
  setOutput: (value: string) => void;
}

interface SafeAuthoringPreviewInput {
  selectedFunc: string;
  input: Record<string, unknown>;
  userCode: string;
  scriptRefJson: string;
}

function decodeBase64(value: string) {
  if (typeof window !== 'undefined') return window.atob(value);
  return Buffer.from(value, 'base64').toString('utf8');
}

function parseScriptRef(scriptRefJson: string) {
  try {
    const parsed = scriptRefJson.trim() ? JSON.parse(scriptRefJson) : null;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function buildSafeAuthoringPreview({
  selectedFunc,
  input,
  userCode,
  scriptRefJson,
}: SafeAuthoringPreviewInput) {
  if (selectedFunc.includes('timestamp')) {
    return {
      label: typeof input.label === 'string' && input.label.trim() ? input.label : 'request',
      generated_at: Math.floor(Date.now() / 1000),
    };
  }

  if (selectedFunc.includes('base64_decode')) {
    return {
      decoded: decodeBase64(typeof input.value === 'string' ? input.value : ''),
    };
  }

  if (selectedFunc.includes('privacy.mask')) {
    return {
      mode: 'builtin',
      function: 'privacy.mask',
      input,
    };
  }

  if (selectedFunc.includes('public_signal_hash')) {
    return {
      mode: 'builtin',
      function: 'zkp.public_signal_hash',
      input,
    };
  }

  if (selectedFunc.includes('groth16.verify')) {
    return {
      mode: 'builtin',
      function: 'zkp.groth16.verify',
      input,
    };
  }

  if (selectedFunc.includes('zerc20.single_withdraw.verify')) {
    return {
      mode: 'builtin',
      function: 'zkp.zerc20.single_withdraw.verify',
      input,
    };
  }

  if (selectedFunc.includes('modexp')) {
    return {
      mode: 'builtin',
      function: 'math.modexp',
      input,
    };
  }

  if (selectedFunc.includes('matrix')) {
    return {
      mode: 'builtin',
      function: 'matrix.multiply',
      input,
    };
  }

  if (selectedFunc.includes('wasm')) {
    return {
      mode: 'wasm',
      note: 'WASM payload shape validated; browser authoring check does not execute modules.',
    };
  }

  const scriptRef = parseScriptRef(scriptRefJson);
  return {
    mode: 'script',
    entry_point: 'process',
    input,
    script_ref: scriptRef,
    inline_script_bytes: scriptRef ? 0 : new TextEncoder().encode(userCode).length,
    executed: false,
  };
}

export function ComputeTab({ computeFunctions: _computeFunctions, setOutput }: ComputeTabProps) {
  const defaultCallbackHash =
    NETWORKS.neo_n3.exampleConsumer || NETWORKS.neo_n3.callbackConsumer || '';
  const [selectedFunc, setSelectedFunc] = useState<string>('');
  const [computeInput, setComputeInput] = useState('{}');
  const [userCode, setUserCode] = useState(
    `function process(input, helpers) {\n return {\n received: input,\n generated_at: helpers.getCurrentTimestamp(),\n };\n}`
  );
  const [scriptRefJson, setScriptRefJson] = useState('');
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
  const [isWalletSubmitting, setIsWalletSubmitting] = useState(false);
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
    };
  }, []);

  function applyComputePreset(name: string) {
    setSelectedFunc(name);
    if (name.includes('timestamp')) {
      setUserCode(
        `function process(input, helpers) {\n return {\n label: input.label,\n generated_at: helpers.getCurrentTimestamp(),\n };\n}`
      );
      setComputeInput('{\n "label": ""\n}');
      return;
    }
    if (name.includes('base64_decode')) {
      setUserCode(
        `function process(input, helpers) {\n return {\n decoded: helpers.base64Decode(input.value || ""),\n };\n}`
      );
      setComputeInput('{\n "value": ""\n}');
      return;
    }
    if (name.includes('privacy.mask')) {
      setUserCode(
        `function process(input, helpers) {\n return {\n mode: "builtin",\n function: "privacy.mask",\n input\n };\n}`
      );
      setComputeInput('{\n "value": "",\n "unmasked_left": 0,\n "unmasked_right": 0\n}');
      return;
    }
    if (name.includes('public_signal_hash')) {
      setUserCode(
        `function process(input, helpers) {\n return {\n mode: "builtin",\n function: "zkp.public_signal_hash",\n input\n };\n}`
      );
      setComputeInput('{\n "circuit_id": "",\n "signals": []\n}');
      return;
    }
    if (name.includes('groth16.verify')) {
      setUserCode(
        `function process(input, helpers) {\n return {\n mode: "builtin",\n function: "zkp.groth16.verify",\n input\n };\n}`
      );
      setComputeInput('{\n "verifying_key": {},\n "public_signals": [],\n "proof": {}\n}');
      return;
    }
    if (name.includes('zerc20.single_withdraw.verify')) {
      setUserCode(
        `function process(input, helpers) {\n return {\n mode: "builtin",\n function: "zkp.zerc20.single_withdraw.verify",\n input\n };\n}`
      );
      setComputeInput('{\n "public_inputs": {},\n "proof": {}\n}');
      return;
    }
    if (name.includes('modexp')) {
      setUserCode(
        `function process(input, helpers) {\n return {\n mode: "builtin",\n function: "math.modexp",\n input\n };\n}`
      );
      setComputeInput('{\n "base": "",\n "exponent": "",\n "modulus": ""\n}');
      return;
    }
    if (name.includes('matrix')) {
      setUserCode(
        `function process(input, helpers) {\n return {\n mode: "builtin",\n function: "matrix.multiply",\n input\n };\n}`
      );
      setComputeInput('{\n "left": [],\n "right": []\n}');
      return;
    }
    if (name.includes('wasm')) {
      setUserCode(
        `// WASM is the recommended path for stronger isolation.\nfunction process(input, helpers) {\n return {\n mode: "wasm",\n note: "Compile a .wasm module and place it into wasm_base64."\n };\n}`
      );
      setComputeInput('{\n "wasm_base64": "",\n "input": {}\n}');
      return;
    }
    setUserCode(
      `function process(input, helpers) {\n return {\n received: input,\n generated_at: helpers.getCurrentTimestamp(),\n };\n}`
    );
    setComputeInput('{}');
  }

  async function handleCopy(id: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedItem(id);
    } catch {
      setOutput('Copy failed. Check browser clipboard permissions and try again.');
    }
    if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
    copyResetTimer.current = setTimeout(() => setCopiedItem(null), 1500);
  }

  async function submitGeneratedWithWallet() {
    if (!generatedPackage) return;
    setIsWalletSubmitting(true);
    try {
      const result = await invokeMorpheusOracleRequest({
        oracleHash: NETWORKS.neo_n3.oracle,
        requestType: generatedPackage.requestType,
        payloadBase64,
        callbackHash: walletCallbackHash,
        callbackMethod: walletCallbackMethod,
      });
      setOutput(
        [
          '>> NEP-21 wallet submitted Compute request.',
          `>> Transaction: ${(result as any)?.txid || JSON.stringify(result)}`,
          '>> Read the emitted requestId, then query the callback readback template.',
        ].join('\n')
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setOutput(`!! NEP-21 wallet submit failed: ${message}`);
    } finally {
      setIsWalletSubmitting(false);
    }
  }

  const handleExecute = async () => {
    setIsSimulating(true);
    const logs: string[] = [
      '>> Validating local authoring payload...',
      '>> This check does not execute edited JavaScript, contact the live worker, or touch the blockchain.',
    ];

    try {
      const input = JSON.parse(computeInput) as Record<string, unknown>;
      const result = buildSafeAuthoringPreview({ selectedFunc, input, userCode, scriptRefJson });
      logs.push('>> Authoring check complete.');
      logs.push(`>> Preview: ${JSON.stringify(result, null, 2)}`);

      setOutput(logs.join('\n'));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logs.push(`!! [ERROR] ${message}`);
      setOutput(logs.join('\n'));
    } finally {
      setIsSimulating(false);
    }
  };

  const generateOnchainPackage = () => {
    let payload: Record<string, unknown>;
    let parsedInput: Record<string, unknown> = {};
    try {
      parsedInput = JSON.parse(computeInput);
      if (!parsedInput || typeof parsedInput !== 'object' || Array.isArray(parsedInput)) {
        throw new Error('Compute input must be a JSON object.');
      }
    } catch (err: unknown) {
      setOutput(`!! [ERROR] ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    if (selectedFunc.includes('privacy.mask')) {
      payload = {
        mode: 'builtin',
        function: 'privacy.mask',
        input: parsedInput,
        target_chain: 'neo_n3',
      };
    } else if (selectedFunc.includes('public_signal_hash')) {
      payload = {
        mode: 'builtin',
        function: 'zkp.public_signal_hash',
        input: parsedInput,
        target_chain: 'neo_n3',
      };
    } else if (selectedFunc.includes('modexp')) {
      payload = {
        mode: 'builtin',
        function: 'math.modexp',
        input: parsedInput,
        target_chain: 'neo_n3',
      };
    } else if (selectedFunc.includes('matrix')) {
      payload = {
        mode: 'builtin',
        function: 'matrix.multiply',
        input: parsedInput,
        target_chain: 'neo_n3',
      };
    } else if (selectedFunc.includes('wasm')) {
      payload = {
        mode: 'wasm',
        wasm_base64: typeof parsedInput.wasm_base64 === 'string' ? parsedInput.wasm_base64 : '',
        input:
          parsedInput.input && typeof parsedInput.input === 'object' && !Array.isArray(parsedInput.input)
            ? (parsedInput.input as Record<string, unknown>)
            : {},
        target_chain: 'neo_n3',
      };
    } else {
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
              letterSpacing: 0,
              marginBottom: '0.5rem',
            }}
          >
            Private Compute
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            Author JS, builtin, and WASM request packages using the same payload shapes that the
            live confidential runtime expects.
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
          isWalletSubmitting={isWalletSubmitting}
          onSubmitWithWallet={submitGeneratedWithWallet}
        />
      )}
    </div>
  );
}
