'use client';

import { useEffect, useMemo, useState } from 'react';

import { encryptJsonWithOraclePublicKey } from '@/lib/browser-encryption';
import { NETWORKS } from '@/lib/onchain-data';

import { OracleSettings } from './OracleSettings';
import { OracleRequestForm } from './OracleRequestForm';
import { OracleResponseViewer } from './OracleResponseViewer';

interface OracleTabProps {
  providers: any[];
  setOutput: (output: string) => void;
}

function escapeForCSharp(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function encodeUtf8Base64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return window.btoa(binary);
}

function copyText(value: string) {
  return navigator.clipboard.writeText(value);
}

export function OracleTab({ providers: _providers, setOutput }: OracleTabProps) {
  const defaultCallbackHash =
    NETWORKS.neo_n3.exampleConsumer || NETWORKS.neo_n3.callbackConsumer || '';
  const [requestMode, setRequestMode] = useState('provider');
  const [oracleUrl, setOracleUrl] = useState('https://postman-echo.com/get?probe=morpheus');
  const [providerSymbol, setProviderSymbol] = useState('TWELVEDATA:NEO-USD');
  const [httpMethod, setHttpMethod] = useState('GET');
  const [oracleEncryptedParams, setOracleEncryptedParams] = useState('');
  const [oracleConfidentialJson, setOracleConfidentialJson] = useState(
    '{\n "headers": {\n "Authorization": "Bearer secret_token"\n }\n}'
  );
  const [oracleScript, setOracleScript] = useState(
    "function process(data, context, helpers) {\\n return data.args.probe + '-script';\\n}"
  );
  const [oracleScriptRefJson, setOracleScriptRefJson] = useState(
    '{\\n \"contract_hash\": \"0x1111111111111111111111111111111111111111\",\\n \"method\": \"getScript\",\\n \"script_name\": \"scoreGate\"\\n}'
  );
  const [oracleJsonPath, setOracleJsonPath] = useState('price');
  const [useCustomScript, setUseCustomScript] = useState(false);
  const [oracleTargetChain, setOracleTargetChain] = useState('neo_n3');
  const [walletCallbackHash, setWalletCallbackHash] = useState(defaultCallbackHash);
  const [walletCallbackMethod, setWalletCallbackMethod] = useState('onOracleResult');
  const [oracleKeyMeta, setOracleKeyMeta] = useState<any>(null);
  const [oracleState, setOracleState] = useState<any>(null);
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [generatedRequest, setGeneratedRequest] = useState<{
    requestType: string;
    payload: Record<string, unknown>;
    payloadJson: string;
    neoN3Snippet: string;
  } | null>(null);
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  useEffect(() => {
    void loadOracleKey();
    void loadOracleState();
  }, []);

  useEffect(() => {
    if (requestMode === 'provider') {
      setOracleUrl('https://postman-echo.com/get?probe=morpheus');
      setHttpMethod('GET');
      setOracleJsonPath('price');
      if (useCustomScript) {
        setOracleScript(
          'function process(data, context, helpers) {\n return Number(data.price) > 0;\n}'
        );
      }
      if (!oracleEncryptedParams.trim()) {
        setOracleConfidentialJson('{\n "json_path": "price"\n}');
      }
      return;
    }

    setOracleUrl('https://postman-echo.com/get?probe=morpheus');
    setHttpMethod('GET');
    setOracleJsonPath('args.probe');
    if (useCustomScript) {
      setOracleScript(
        "function process(data, context, helpers) {\n return data.args.probe + '-script';\n}"
      );
    }
    if (!oracleEncryptedParams.trim()) {
      setOracleConfidentialJson(
        '{\n "headers": {\n "Authorization": "Bearer secret_token"\n },\n "json_path": "args.probe"\n}'
      );
    }
  }, [requestMode, useCustomScript]);

  function applyOraclePreset(
    preset: 'public_quote' | 'private_api' | 'boolean_check' | 'hidden_builtin'
  ) {
    if (preset === 'public_quote') {
      setRequestMode('provider');
      setProviderSymbol('TWELVEDATA:NEO-USD');
      setOracleJsonPath('price');
      setOracleTargetChain('neo_n3');
      setUseCustomScript(false);
      setOracleEncryptedParams('');
      setOracleConfidentialJson('{\n "json_path": "price"\n}');
      setOutput(
        `>> Loaded preset: Public Quote\n>> Built-in provider quote request for ${NETWORKS.neo_n3.name}.`
      );
      return;
    }

    if (preset === 'private_api') {
      setRequestMode('url');
      setOracleUrl('https://api.example.com/private-price');
      setHttpMethod('GET');
      setOracleJsonPath('data.price');
      setOracleTargetChain('neo_n3');
      setUseCustomScript(false);
      setOracleEncryptedParams('');
      setOracleConfidentialJson(
        '{\n "headers": {\n "Authorization": "Bearer secret_token"\n },\n "json_path": "data.price"\n}'
      );
      setOutput(
        '>> Loaded preset: Private API\n>> Encrypt the confidential JSON patch locally before submitting.'
      );
      return;
    }

    if (preset === 'boolean_check') {
      const nextScript =
        'function process(data, context, helpers) {\n return Number(data.followers || 0) > 10000;\n}';
      setRequestMode('url');
      setOracleUrl('https://api.example.com/private-profile');
      setHttpMethod('GET');
      setOracleJsonPath('data.followers');
      setOracleTargetChain('neo_n3');
      setUseCustomScript(true);
      setOracleScript(nextScript);
      setOracleEncryptedParams('');
      setOracleConfidentialJson(
        '{\n "headers": {\n "Authorization": "Bearer secret_token"\n },\n "json_path": "data.followers",\n "script": "function process(data, context, helpers) { return Number(data.followers || 0) > 10000; }",\n "entry_point": "process"\n}'
      );
      setOutput(
        '>> Loaded preset: Boolean Check\n>> This pattern returns only a boolean to the callback.'
      );
      return;
    }

    setRequestMode('provider');
    setProviderSymbol('TWELVEDATA:BTC-USD');
    setOracleJsonPath('price');
    setOracleTargetChain('neo_n3');
    setUseCustomScript(false);
    setOracleEncryptedParams('');
    setOracleConfidentialJson('{\n "json_path": "price",\n "target_chain": "neo_n3"\n}');
    setOutput(
      '>> Loaded preset: Hidden Built-in Params\n>> Encrypt the patch so helper fields stay private.'
    );
  }

  async function loadOracleKey() {
    try {
      const response = await fetch('/api/oracle/public-key');
      const body = await response.json().catch(() => ({}));
      if (response.ok && body?.public_key) {
        setOracleKeyMeta(body);
      }
    } catch (err) {
      console.error('Failed to load oracle public key', err);
    }
  }

  async function loadOracleState() {
    try {
      const response = await fetch('/api/onchain/state?limit=20');
      const body = await response.json().catch(() => ({}));
      setOracleState(body?.neo_n3?.oracle || null);
    } catch (err) {
      console.error('Failed to load on-chain oracle state', err);
    }
  }

  async function encryptConfidentialPatch() {
    setIsEncrypting(true);
    try {
      const keyMeta = oracleKeyMeta?.public_key
        ? oracleKeyMeta
        : await (async () => {
            const response = await fetch('/api/oracle/public-key');
            const body = await response.json();
            setOracleKeyMeta(body);
            return body;
          })();

      if (!keyMeta?.public_key) throw new Error('Public key not available');

      const ciphertext = await encryptJsonWithOraclePublicKey(
        keyMeta.public_key,
        oracleConfidentialJson
      );
      setOracleEncryptedParams(ciphertext);
      setOutput(
        '>> Confidential patch encrypted locally.\n>> Submit the generated payload through the on-chain Oracle contract.\n>> No live worker execution was triggered by this page.'
      );
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

    if (requestMode === 'provider') {
      payload.symbol = providerSymbol;
    } else {
      payload.url = oracleUrl;
      if ((httpMethod || 'GET').toUpperCase() !== 'GET') {
        payload.method = httpMethod.toUpperCase();
      }
    }

    if (oracleJsonPath.trim()) {
      payload.json_path = oracleJsonPath.trim();
    }
    if (useCustomScript && oracleScript.trim()) {
      try {
        const parsedScriptRef = oracleScriptRefJson.trim() ? JSON.parse(oracleScriptRefJson) : null;
        if (parsedScriptRef && typeof parsedScriptRef === 'object') {
          payload.script_ref = parsedScriptRef;
        } else {
          payload.script = oracleScript.trim();
        }
      } catch {
        payload.script = oracleScript.trim();
      }
    }
    if (oracleEncryptedParams.trim()) {
      payload.encrypted_params = oracleEncryptedParams.trim();
    }

    return payload;
  }

  function generateOnchainPackage() {
    const requestType = requestMode === 'provider' ? 'privacy_oracle' : 'oracle';
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

    setGeneratedRequest({
      requestType,
      payload,
      payloadJson,
      neoN3Snippet,
    });

    setOutput(
      [
        '>> Oracle request package generated.',
        `>> Request type: ${requestType}`,
        `>> Neo N3 request fee: ${oracleState?.request_fee_display || '0.01 GAS'}`,
        `>> Oracle contract: ${oracleState?.contract || NETWORKS.neo_n3.oracle}`,
        '>> Submit this payload through the on-chain Oracle contract. Do not call /oracle/smart-fetch directly from user flows.',
        '',
        payloadJson,
      ].join('\n')
    );
  }

  async function handleCopy(id: string, value: string) {
    await copyText(value);
    setCopiedItem(id);
    setTimeout(() => setCopiedItem(null), 1500);
  }

  const keySummary = useMemo(
    () => ({
      algorithm: oracleKeyMeta?.algorithm || 'X25519-HKDF-SHA256-AES-256-GCM',
      source: oracleKeyMeta?.key_source || 'unknown',
    }),
    [oracleKeyMeta]
  );

  const payloadBase64 = generatedRequest ? encodeUtf8Base64(generatedRequest.payloadJson) : '';
  const neoRpcInvoke = generatedRequest
    ? JSON.stringify(
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'invokefunction',
          params: [
            oracleState?.contract || NETWORKS.neo_n3.oracle,
            'request',
            [
              { type: 'String', value: generatedRequest.requestType },
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
    <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
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
            Oracle Payload Builder
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            Seal confidential fields locally, then generate the exact on-chain request payload and
            callback snippets.
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              fontSize: '0.65rem',
              color: 'var(--text-secondary)',
              fontWeight: 800,
              fontFamily: 'var(--font-mono)',
            }}
          >
            LIVE ORACLE
          </div>
          <div
            style={{
              fontSize: '0.8rem',
              color: 'var(--neo-green)',
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
            }}
          >
            {oracleState?.request_fee_display || '0.01 GAS'}
          </div>
        </div>
      </div>

      <div
        className="card-industrial"
        style={{ padding: '1.25rem 1.5rem', borderLeft: '4px solid var(--neo-green)' }}
      >
        <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          This page does <strong>not</strong> send a live Oracle request. It only encrypts locally
          and prepares a payload for on-chain submission through{' '}
          <code>{oracleState?.domain || NETWORKS.neo_n3.domains.oracle}</code>. You can also move{' '}
          <code>json_path</code> or <code>script</code> into the encrypted JSON if you want those
          fields hidden from the public transaction.
        </p>
      </div>

      <div
        className="card-industrial"
        style={{ padding: '1.25rem 1.5rem', borderLeft: '4px solid var(--accent-blue)' }}
      >
        <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          For a zero-code {NETWORKS.neo_n3.environmentLabel.toLowerCase()} test, set callback hash
          to <code>{defaultCallbackHash}</code>, keep callback method as <code>onOracleResult</code>
          , pre-fund <code>0.01 GAS</code> Oracle credit, submit the request, then read back with{' '}
          <code>getCallback(requestId)</code>.
        </p>
      </div>

      <OracleSettings onApplyPreset={applyOraclePreset} />

      <OracleRequestForm
        oracleConfidentialJson={oracleConfidentialJson}
        setOracleConfidentialJson={setOracleConfidentialJson}
        keySummary={keySummary}
        isEncrypting={isEncrypting}
        oracleKeyMeta={oracleKeyMeta}
        oracleEncryptedParams={oracleEncryptedParams}
        setOracleEncryptedParams={setOracleEncryptedParams}
        onEncryptPatch={encryptConfidentialPatch}
        requestMode={requestMode}
        setRequestMode={setRequestMode}
        oracleTargetChain={oracleTargetChain}
        setOracleTargetChain={setOracleTargetChain}
        providerSymbol={providerSymbol}
        setProviderSymbol={setProviderSymbol}
        oracleUrl={oracleUrl}
        setOracleUrl={setOracleUrl}
        httpMethod={httpMethod}
        setHttpMethod={setHttpMethod}
        oracleJsonPath={oracleJsonPath}
        setOracleJsonPath={setOracleJsonPath}
        walletCallbackHash={walletCallbackHash}
        setWalletCallbackHash={setWalletCallbackHash}
        walletCallbackMethod={walletCallbackMethod}
        setWalletCallbackMethod={setWalletCallbackMethod}
        useCustomScript={useCustomScript}
        setUseCustomScript={setUseCustomScript}
        oracleScript={oracleScript}
        setOracleScript={setOracleScript}
        oracleScriptRefJson={oracleScriptRefJson}
        setOracleScriptRefJson={setOracleScriptRefJson}
        onGeneratePackage={generateOnchainPackage}
      />

      {generatedRequest && (
        <OracleResponseViewer
          generatedRequest={generatedRequest}
          oracleState={oracleState}
          walletCallbackHash={walletCallbackHash}
          walletCallbackMethod={walletCallbackMethod}
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
