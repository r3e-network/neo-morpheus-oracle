'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Boxes, ArrowRight, Lock, Cpu, Shield, Copy } from 'lucide-react';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { NETWORKS } from '@/lib/onchain-data';
import { encryptJsonWithOraclePublicKey } from '@/lib/browser-encryption';
const neoGasHash = '0xd2a4cff31913016155e38e474a2c06d08be276cf';

function escapeForCSharp(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function encodeUtf8Base64(value: string) {
  const bytes = new TextEncoder().encode(value);
  if (typeof window === 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
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

function isHash160(value: string) {
  return /^0x[0-9a-fA-F]{40}$/.test(value.trim());
}

function isNeoMethodName(value: string) {
  return /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(value.trim());
}

type StarterStudioProps = {
  embedded?: boolean;
};

type PresetId =
  | 'oracle_quote'
  | 'oracle_private_api'
  | 'oracle_boolean'
  | 'compute_mask'
  | 'compute_modexp';

function buildDefaultConfidentialPatch(flow: string, useScript: boolean, script: string) {
  if (flow === 'oracle_provider') {
    if (useScript && script.trim()) {
      return JSON.stringify(
        {
          json_path: 'price',
          script: script.trim(),
          entry_point: 'process',
        },
        null,
        2
      );
    }
    return JSON.stringify({ json_path: 'price' }, null, 2);
  }

  if (flow === 'oracle_custom') {
    const payload: Record<string, unknown> = {
      headers: {
        Authorization: 'Bearer secret_token',
      },
      json_path: 'data.score',
    };
    if (useScript && script.trim()) {
      payload.script = script.trim();
      payload.entry_point = 'process';
    }
    return JSON.stringify(payload, null, 2);
  }

  if (flow === 'compute_builtin') {
    return JSON.stringify(
      {
        mode: 'builtin',
        function: 'privacy.mask',
        input: { value: '13812345678', unmasked_left: 3, unmasked_right: 4 },
        target_chain: 'neo_n3',
      },
      null,
      2
    );
  }

  return JSON.stringify(
    {
      mode: 'builtin',
      function: 'math.modexp',
      input: { base: '2', exponent: '10', modulus: '17' },
      target_chain: 'neo_n3',
    },
    null,
    2
  );
}

export function StarterStudio({ embedded = false }: StarterStudioProps) {
  const universalConsumer =
    NETWORKS.neo_n3.exampleConsumer || NETWORKS.neo_n3.callbackConsumer || '';
  const [flow, setFlow] = useState('oracle_provider');
  const [symbol, setSymbol] = useState('TWELVEDATA:NEO-USD');
  const [customUrl, setCustomUrl] = useState('https://postman-echo.com/get?probe=morpheus');
  const [jsonPath, setJsonPath] = useState('price');
  const [targetChain, setTargetChain] = useState('neo_n3');
  const [useEncrypted, setUseEncrypted] = useState(true);
  const [useScript, setUseScript] = useState(false);
  const [script, setScript] = useState('function process(data) { return Number(data.price) > 0; }');
  const [manualCallbackHash, setManualCallbackHash] = useState(universalConsumer);
  const [manualCallbackMethod, setManualCallbackMethod] = useState('onOracleResult');
  const [confidentialJson, setConfidentialJson] = useState(
    buildDefaultConfidentialPatch('oracle_provider', false, '')
  );
  const [encryptedBlob, setEncryptedBlob] = useState('');
  const [oracleKeyMeta, setOracleKeyMeta] = useState<any>(null);
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [encryptionError, setEncryptionError] = useState('');
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/oracle/public-key');
        const body = await response.json().catch(() => ({}));
        if (response.ok && body?.public_key) {
          setOracleKeyMeta(body);
        }
      } catch {
        // best effort only
      }
    })();
  }, []);

  useEffect(() => {
    setEncryptedBlob('');
    setConfidentialJson(buildDefaultConfidentialPatch(flow, useScript, script));
  }, [flow]);

  function applyPreset(preset: PresetId) {
    if (preset === 'oracle_quote') {
      setFlow('oracle_provider');
      setSymbol('TWELVEDATA:NEO-USD');
      setJsonPath('price');
      setTargetChain('neo_n3');
      setUseEncrypted(false);
      setUseScript(false);
      setScript('function process(data) { return Number(data.price) > 0; }');
      setConfidentialJson(buildDefaultConfidentialPatch('oracle_provider', false, ''));
      setEncryptedBlob('');
      return;
    }

    if (preset === 'oracle_private_api') {
      setFlow('oracle_custom');
      setCustomUrl('https://api.example.com/private-price');
      setJsonPath('data.price');
      setTargetChain('neo_n3');
      setUseEncrypted(true);
      setUseScript(false);
      setScript('function process(data) { return Number(data.price) > 0; }');
      setConfidentialJson(
        JSON.stringify(
          {
            headers: { Authorization: 'Bearer secret_token' },
            json_path: 'data.price',
          },
          null,
          2
        )
      );
      setEncryptedBlob('');
      return;
    }

    if (preset === 'oracle_boolean') {
      setFlow('oracle_custom');
      setCustomUrl('https://api.example.com/private-profile');
      setJsonPath('data.followers');
      setTargetChain('neo_n3');
      setUseEncrypted(true);
      setUseScript(true);
      const nextScript = 'function process(data) { return Number(data.followers) > 10000; }';
      setScript(nextScript);
      setConfidentialJson(
        JSON.stringify(
          {
            headers: { Authorization: 'Bearer secret_token' },
            json_path: 'data.followers',
            script: nextScript,
            entry_point: 'process',
          },
          null,
          2
        )
      );
      setEncryptedBlob('');
      return;
    }

    if (preset === 'compute_mask') {
      setFlow('compute_builtin');
      setTargetChain('neo_n3');
      setUseEncrypted(false);
      setUseScript(false);
      setConfidentialJson(buildDefaultConfidentialPatch('compute_builtin', false, ''));
      setEncryptedBlob('');
      return;
    }

    setFlow('compute_encrypted');
    setTargetChain('neo_n3');
    setUseEncrypted(true);
    setUseScript(false);
    setConfidentialJson(buildDefaultConfidentialPatch('compute_encrypted', false, ''));
    setEncryptedBlob('');
  }

  async function encryptPatch() {
    setIsEncrypting(true);
    setEncryptionError('');
    try {
      const keyMeta = oracleKeyMeta?.public_key
        ? oracleKeyMeta
        : await (async () => {
            const response = await fetch('/api/oracle/public-key');
            const body = await response.json();
            setOracleKeyMeta(body);
            return body;
          })();

      if (!keyMeta?.public_key) throw new Error('Oracle public key unavailable');
      const ciphertext = await encryptJsonWithOraclePublicKey(keyMeta.public_key, confidentialJson);
      setEncryptedBlob(ciphertext);
    } catch (error) {
      setEncryptedBlob('');
      setEncryptionError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsEncrypting(false);
    }
  }

  async function handleCopy(id: string, value: string) {
    await copyText(value);
    setCopiedItem(id);
    setTimeout(() => setCopiedItem(null), 1500);
  }

  const generated = useMemo(() => {
    const payload: Record<string, unknown> = { target_chain: targetChain };
    let requestType = 'privacy_oracle';

    if (flow === 'oracle_provider') {
      payload.symbol = symbol;
      if (useEncrypted) {
        payload.encrypted_payload = encryptedBlob || '<sealed confidential patch>';
      } else {
        if (jsonPath.trim()) payload.json_path = jsonPath.trim();
        if (useScript && script.trim()) {
          payload.script = script.trim();
          payload.entry_point = 'process';
        }
      }
      requestType = useEncrypted ? 'privacy_oracle' : 'oracle';
    } else if (flow === 'oracle_custom') {
      payload.url = customUrl;
      if (useEncrypted) {
        payload.encrypted_params = encryptedBlob || '<sealed confidential patch>';
      } else {
        if (jsonPath.trim()) payload.json_path = jsonPath.trim();
        if (useScript && script.trim()) {
          payload.script = script.trim();
          payload.entry_point = 'process';
        }
      }
      requestType = useEncrypted ? 'privacy_oracle' : 'oracle';
    } else if (flow === 'compute_builtin') {
      requestType = 'compute';
      if (useEncrypted) {
        payload.encrypted_payload =
          encryptedBlob || buildDefaultConfidentialPatch('compute_builtin', false, '');
      } else {
        payload.mode = 'builtin';
        payload.function = 'privacy.mask';
        payload.input = { value: '13812345678', unmasked_left: 3, unmasked_right: 4 };
      }
    } else {
      requestType = 'compute';
      payload.encrypted_payload =
        encryptedBlob || buildDefaultConfidentialPatch('compute_encrypted', false, '');
    }

    return { requestType, payload };
  }, [
    customUrl,
    encryptedBlob,
    flow,
    jsonPath,
    script,
    symbol,
    targetChain,
    useEncrypted,
    useScript,
  ]);

  const normalizedCallbackHash = manualCallbackHash.trim();
  const normalizedCallbackMethod = manualCallbackMethod.trim();
  const callbackHashForSnippet = isHash160(normalizedCallbackHash)
    ? normalizedCallbackHash
    : '<valid 0x-prefixed Hash160 callback contract>';
  const callbackMethodForSnippet = isNeoMethodName(normalizedCallbackMethod)
    ? normalizedCallbackMethod
    : '<validCallbackMethod>';
  const snippetIssues = useMemo(() => {
    const issues: string[] = [];
    if (!isHash160(normalizedCallbackHash)) {
      issues.push(
        'Enter a 0x-prefixed 20-byte callback contract hash before using wallet or RPC snippets.'
      );
    }
    if (!isNeoMethodName(normalizedCallbackMethod)) {
      issues.push('Enter a callback method name using letters, numbers, or underscores.');
    }
    if (useEncrypted && !encryptedBlob) {
      issues.push('Encrypt the confidential patch before submitting an encrypted flow.');
    }
    return issues;
  }, [encryptedBlob, normalizedCallbackHash, normalizedCallbackMethod, useEncrypted]);

  const payloadJson = JSON.stringify(generated.payload, null, 2);
  const compactPayloadJson = JSON.stringify(generated.payload);
  const payloadBase64 = useMemo(() => encodeUtf8Base64(compactPayloadJson), [compactPayloadJson]);
  const neoN3Snippet = `string payloadJson = "${escapeForCSharp(compactPayloadJson)}";

BigInteger requestId = (BigInteger)Contract.Call(
 OracleHash,
 "request",
 CallFlags.All,
 "${generated.requestType}",
 (ByteString)payloadJson,
 Runtime.ExecutingScriptHash,
 "onOracleResult"
);`;

  const neoRpcInvoke = JSON.stringify(
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'invokefunction',
      params: [
        NETWORKS.neo_n3.oracle,
        'request',
        [
          { type: 'String', value: generated.requestType },
          { type: 'ByteArray', value: payloadBase64 },
          { type: 'Hash160', value: callbackHashForSnippet },
          { type: 'String', value: callbackMethodForSnippet },
        ],
      ],
    },
    null,
    2
  );

  const callbackQueryTemplate = JSON.stringify(
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'invokefunction',
      params: [callbackHashForSnippet, 'getCallback', [{ type: 'Integer', value: '<requestId>' }]],
    },
    null,
    2
  );

  return (
    <div className={embedded ? 'fade-up' : 'fade-in'}>
      {!embedded && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
            <Boxes size={14} color="var(--neo-green)" />
            <span
              style={{
                fontSize: '0.7rem',
                fontWeight: 800,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: 0,
                fontFamily: 'var(--font-mono)',
              }}
            >
              INTERACTIVE STARTER STUDIO
            </span>
          </div>
          <h1>Starter Studio</h1>
        </>
      )}

      {embedded ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            borderBottom: '1px solid var(--border-dim)',
            paddingBottom: '1rem',
            marginBottom: '2rem',
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
              Starter Studio
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
              Choose a user flow, encrypt locally if needed, then generate payload JSON and Neo N3
              request snippets instantly.
            </p>
          </div>
        </div>
      ) : (
        <p
          className="lead"
          style={{
            fontSize: '1.1rem',
            color: 'var(--text-primary)',
            marginBottom: '2.5rem',
            lineHeight: 1.6,
          }}
        >
          Pick a user flow, choose a data source or built-in function, optionally encrypt the
          confidential patch in-browser, and Morpheus will generate the payload and Neo N3 request
          snippet you need next.
        </p>
      )}

      <div
        className="card-industrial"
        style={{
          padding: '1.25rem 1.5rem',
          borderLeft: '4px solid var(--neo-green)',
          marginBottom: '2rem',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          <button
            className="btn-secondary"
            style={{ border: '1px solid var(--border-dim)' }}
            onClick={() => applyPreset('oracle_quote')}
          >
            Preset: Public Quote
          </button>
          <button
            className="btn-secondary"
            style={{ border: '1px solid var(--border-dim)' }}
            onClick={() => applyPreset('oracle_private_api')}
          >
            Preset: Private API
          </button>
          <button
            className="btn-secondary"
            style={{ border: '1px solid var(--border-dim)' }}
            onClick={() => applyPreset('oracle_boolean')}
          >
            Preset: Boolean Check
          </button>
          <button
            className="btn-secondary"
            style={{ border: '1px solid var(--border-dim)' }}
            onClick={() => applyPreset('compute_mask')}
          >
            Preset: privacy.mask
          </button>
          <button
            className="btn-secondary"
            style={{ border: '1px solid var(--border-dim)' }}
            onClick={() => applyPreset('compute_modexp')}
          >
            Preset: Encrypted modexp
          </button>
        </div>
      </div>

      <div className="grid grid-2" style={{ gap: '2rem', alignItems: 'start' }}>
        <div className="card-industrial" style={{ padding: '1.75rem' }}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>1. Configure Flow</h3>

          <div style={{ display: 'grid', gap: '1rem' }}>
            <label>
              <div
                style={{
                  marginBottom: '0.35rem',
                  color: 'var(--text-secondary)',
                  fontSize: '0.85rem',
                }}
              >
                Flow
              </div>
              <select
                className="neo-select"
                value={flow}
                onChange={(event) => setFlow(event.target.value)}
              >
                <option value="oracle_provider">Oracle: Built-in Provider</option>
                <option value="oracle_custom">Oracle: Custom URL</option>
                <option value="compute_builtin">Compute: Built-in Function</option>
                <option value="compute_encrypted">Compute: Encrypted Built-in</option>
              </select>
            </label>

            <label>
              <div
                style={{
                  marginBottom: '0.35rem',
                  color: 'var(--text-secondary)',
                  fontSize: '0.85rem',
                }}
              >
                Target Chain
              </div>
              <select
                className="neo-select"
                value={targetChain}
                onChange={(event) => setTargetChain(event.target.value)}
              >
                <option value="neo_n3">Neo N3</option>
              </select>
            </label>

            {flow === 'oracle_provider' && (
              <>
                <label>
                  <div
                    style={{
                      marginBottom: '0.35rem',
                      color: 'var(--text-secondary)',
                      fontSize: '0.85rem',
                    }}
                  >
                    Source
                  </div>
                  <div
                    className="badge-outline"
                    style={{
                      minHeight: '44px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    Provider inferred from pair prefix
                  </div>
                </label>
                <label>
                  <div
                    style={{
                      marginBottom: '0.35rem',
                      color: 'var(--text-secondary)',
                      fontSize: '0.85rem',
                    }}
                  >
                    Canonical Pair Key
                  </div>
                  <input
                    className="neo-input"
                    value={symbol}
                    onChange={(event) => setSymbol(event.target.value)}
                  />
                </label>
              </>
            )}

            {flow === 'oracle_custom' && (
              <label>
                <div
                  style={{
                    marginBottom: '0.35rem',
                    color: 'var(--text-secondary)',
                    fontSize: '0.85rem',
                  }}
                >
                  Custom URL
                </div>
                <input
                  className="neo-input"
                  value={customUrl}
                  onChange={(event) => setCustomUrl(event.target.value)}
                />
              </label>
            )}

            {(flow === 'oracle_provider' || flow === 'oracle_custom') && !useEncrypted && (
              <>
                <label>
                  <div
                    style={{
                      marginBottom: '0.35rem',
                      color: 'var(--text-secondary)',
                      fontSize: '0.85rem',
                    }}
                  >
                    JSON Path
                  </div>
                  <input
                    className="neo-input"
                    value={jsonPath}
                    onChange={(event) => setJsonPath(event.target.value)}
                  />
                </label>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    color: 'var(--text-secondary)',
                    fontSize: '0.9rem',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={useScript}
                    onChange={(event) => setUseScript(event.target.checked)}
                  />
                  Enable custom JS reduction
                </label>
                {useScript && (
                  <textarea
                    className="code-editor"
                    value={script}
                    onChange={(event) => setScript(event.target.value)}
                    style={{ minHeight: '140px' }}
                  />
                )}
                {useScript && (
                  <div
                    style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}
                  >
                    If the inline script is too large for the on-chain payload, move it into a Neo
                    N3 contract getter and place a <code>script_ref</code> object into the
                    confidential JSON patch instead.
                  </div>
                )}
              </>
            )}

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                color: 'var(--text-secondary)',
                fontSize: '0.9rem',
              }}
            >
              <input
                type="checkbox"
                checked={useEncrypted}
                onChange={(event) => setUseEncrypted(event.target.checked)}
              />
              Seal sensitive fields before submission
            </label>

            <label>
              <div
                style={{
                  marginBottom: '0.35rem',
                  color: 'var(--text-secondary)',
                  fontSize: '0.85rem',
                }}
              >
                Direct Wallet Callback Hash
              </div>
              <input
                className="neo-input"
                value={manualCallbackHash}
                onChange={(event) => setManualCallbackHash(event.target.value)}
                aria-invalid={!isHash160(normalizedCallbackHash)}
                style={
                  !isHash160(normalizedCallbackHash)
                    ? { borderColor: 'rgba(239, 68, 68, 0.65)' }
                    : undefined
                }
              />
            </label>

            <label>
              <div
                style={{
                  marginBottom: '0.35rem',
                  color: 'var(--text-secondary)',
                  fontSize: '0.85rem',
                }}
              >
                Callback Method
              </div>
              <input
                className="neo-input"
                value={manualCallbackMethod}
                onChange={(event) => setManualCallbackMethod(event.target.value)}
                aria-invalid={!isNeoMethodName(normalizedCallbackMethod)}
                style={
                  !isNeoMethodName(normalizedCallbackMethod)
                    ? { borderColor: 'rgba(239, 68, 68, 0.65)' }
                    : undefined
                }
              />
            </label>

            {useEncrypted && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div
                    style={{
                      padding: '1rem',
                      background: '#000',
                      border: '1px solid var(--border-dim)',
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
                      ALGORITHM
                    </div>
                    <div
                      style={{
                        fontSize: '0.78rem',
                        color: '#fff',
                        fontFamily: 'var(--font-mono)',
                        wordBreak: 'break-word',
                      }}
                    >
                      {oracleKeyMeta?.algorithm || 'X25519-HKDF-SHA256-AES-256-GCM'}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: '1rem',
                      background: '#000',
                      border: '1px solid var(--border-dim)',
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
                      KEY SOURCE
                    </div>
                    <div
                      style={{ fontSize: '0.78rem', color: '#fff', fontFamily: 'var(--font-mono)' }}
                    >
                      {oracleKeyMeta?.key_source || 'loading'}
                    </div>
                  </div>
                </div>

                <label>
                  <div
                    style={{
                      marginBottom: '0.35rem',
                      color: 'var(--text-secondary)',
                      fontSize: '0.85rem',
                    }}
                  >
                    Confidential JSON Patch
                  </div>
                  <textarea
                    className="code-editor"
                    value={confidentialJson}
                    onChange={(event) => setConfidentialJson(event.target.value)}
                    style={{ minHeight: '180px' }}
                  />
                </label>

                <div
                  style={{
                    display: 'flex',
                    gap: '0.75rem',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  <button
                    className="btn-ata"
                    onClick={() => void encryptPatch()}
                    disabled={isEncrypting}
                    style={{ justifyContent: 'center' }}
                  >
                    {isEncrypting ? 'Encrypting...' : 'Encrypt Patch Locally'}
                  </button>
                  {encryptedBlob && (
                    <button
                      className="btn-secondary"
                      style={{ border: '1px solid var(--border-dim)' }}
                      onClick={() => void handleCopy('ciphertext', encryptedBlob)}
                    >
                      <Copy size={14} />{' '}
                      {copiedItem === 'ciphertext' ? 'Copied Ciphertext' : 'Copy Ciphertext'}
                    </button>
                  )}
                </div>

                {encryptionError && (
                  <div
                    role="status"
                    style={{
                      padding: '0.85rem 1rem',
                      background: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid rgba(239, 68, 68, 0.28)',
                      color: '#fecaca',
                      fontSize: '0.85rem',
                      lineHeight: 1.6,
                    }}
                  >
                    {encryptionError}
                  </div>
                )}

                {encryptedBlob && (
                  <div
                    style={{
                      padding: '1rem',
                      background: '#000',
                      border: '1px solid var(--border-dim)',
                      borderLeft: '2px solid var(--neo-green)',
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
                      SEALED BLOB
                    </div>
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--neo-green)',
                        wordBreak: 'break-all',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {encryptedBlob}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="card-industrial" style={{ padding: '1.75rem' }}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>2. Use The Output</h3>

          <div style={{ display: 'grid', gap: '1rem' }}>
            {snippetIssues.length > 0 && (
              <div
                role="status"
                style={{
                  padding: '1rem',
                  background: 'rgba(245, 158, 11, 0.08)',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                  color: '#fcd34d',
                  fontSize: '0.85rem',
                  lineHeight: 1.7,
                }}
              >
                {snippetIssues.map((issue) => (
                  <div key={issue}>{issue}</div>
                ))}
              </div>
            )}

            <div
              style={{ padding: '1rem', background: '#000', border: '1px solid var(--border-dim)' }}
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
                REQUEST TYPE
              </div>
              <div style={{ color: '#fff', fontFamily: 'var(--font-mono)' }}>
                {generated.requestType}
              </div>
            </div>

            <CodeBlock language="json" title="Payload JSON" code={payloadJson} />
            <CodeBlock language="csharp" title="Neo N3 Request Snippet" code={neoN3Snippet} />
            <CodeBlock
              language="text"
              title="Payload ByteArray (Base64 UTF-8)"
              code={payloadBase64}
            />
            <CodeBlock
              language="json"
              title="Neo N3 RPC invokeFunction Params"
              code={neoRpcInvoke}
            />
            <CodeBlock
              language="json"
              title="Callback Query Template"
              code={callbackQueryTemplate}
            />

            <div
              style={{ padding: '1rem', background: '#000', border: '1px solid var(--border-dim)' }}
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
                NEOLINE MANUAL ENTRY
              </div>
              <div style={{ color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                <div>
                  <strong style={{ color: '#fff' }}>Contract:</strong>{' '}
                  <code>{NETWORKS.neo_n3.oracle}</code>
                </div>
                <div>
                  <strong style={{ color: '#fff' }}>Method:</strong> <code>request</code>
                </div>
                <div>
                  <strong style={{ color: '#fff' }}>Arg 1 / String:</strong>{' '}
                  <code>{generated.requestType}</code>
                </div>
                <div>
                  <strong style={{ color: '#fff' }}>Arg 2 / ByteArray:</strong> use the base64
                  payload above
                </div>
                <div>
                  <strong style={{ color: '#fff' }}>Arg 3 / Hash160:</strong>{' '}
                  <code>{callbackHashForSnippet}</code>
                </div>
                <div>
                  <strong style={{ color: '#fff' }}>Arg 4 / String:</strong>{' '}
                  <code>{callbackMethodForSnippet}</code>
                </div>
              </div>
            </div>

            <div
              style={{ padding: '1rem', background: '#000', border: '1px solid var(--border-dim)' }}
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
                NEO N3 CALL ARGUMENTS
              </div>
              <div style={{ color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                <div>
                  <strong style={{ color: '#fff' }}>Arg 1:</strong>{' '}
                  <code>{generated.requestType}</code>
                </div>
                <div>
                  <strong style={{ color: '#fff' }}>Arg 2:</strong> UTF-8 payload JSON bytes
                </div>
                <div>
                  <strong style={{ color: '#fff' }}>Arg 3:</strong> callback contract ={' '}
                  <code>Runtime.ExecutingScriptHash</code> for your own consumer, or{' '}
                  <code>{callbackHashForSnippet}</code> for direct wallet testing
                </div>
                <div>
                  <strong style={{ color: '#fff' }}>Arg 4:</strong> callback method ={' '}
                  <code>{callbackMethodForSnippet}</code>
                </div>
                <div>
                  <strong style={{ color: '#fff' }}>Fee:</strong> <code>0.01 GAS</code>
                </div>
              </div>
            </div>

            <div
              style={{
                padding: '1rem',
                background: '#000',
                borderLeft: '4px solid var(--neo-green)',
                borderTop: '1px solid var(--border-dim)',
                borderRight: '1px solid var(--border-dim)',
                borderBottom: '1px solid var(--border-dim)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  marginBottom: '0.5rem',
                }}
              >
                <Shield size={16} color="var(--neo-green)" />
                <strong style={{ color: '#fff' }}>
                  Zero-Code {NETWORKS.neo_n3.environmentLabel} Test Mode
                </strong>
              </div>
              <div style={{ color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                <div>
                  1. Keep callback hash at <code>{universalConsumer}</code>.
                </div>
                <div>
                  2. Before calling <code>request</code>, pre-fund fee credit with a GAS transfer to{' '}
                  <code>{NETWORKS.neo_n3.oracle}</code>.
                </div>
                <div>
                  3. Neo N3 GAS token hash: <code>{neoGasHash}</code>.
                </div>
                <div>
                  4. Oracle will consume prepaid credit from the callback contract first, otherwise
                  from the requester address.
                </div>
                <div>
                  5. After submission, call <code>getCallback(requestId)</code> on{' '}
                  <code>{universalConsumer}</code>.
                </div>
              </div>
            </div>

            <div
              style={{
                padding: '1rem',
                background: '#000',
                borderLeft: '4px solid var(--neo-green)',
                borderTop: '1px solid var(--border-dim)',
                borderRight: '1px solid var(--border-dim)',
                borderBottom: '1px solid var(--border-dim)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  marginBottom: '0.5rem',
                }}
              >
                {generated.requestType.includes('compute') ? (
                  <Cpu size={16} color="var(--neo-green)" />
                ) : generated.requestType.includes('privacy') ? (
                  <Lock size={16} color="var(--neo-green)" />
                ) : (
                  <Shield size={16} color="var(--neo-green)" />
                )}
                <strong style={{ color: '#fff' }}>Callback Readback</strong>
              </div>
              <div style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                <div>
                  1. Submit the request through <code>{NETWORKS.neo_n3.oracle}</code>.
                </div>
                <div>
                  2. Read the emitted <code>requestId</code> from your transaction result.
                </div>
                <div>
                  3. If using the universal consumer, call <code>getCallback(requestId)</code> on{' '}
                  <code>{universalConsumer}</code>.
                </div>
                <div>
                  4. Verify <code>output_hash</code>, <code>attestation_hash</code>, and{' '}
                  <code>tee_attestation.report_data</code> in{' '}
                  <Link
                    href="/verifier"
                    style={{ color: 'var(--neo-green)', textDecoration: 'none' }}
                  >
                    Attestation Verifier
                  </Link>
                  .
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {!embedded && (
        <div className="grid grid-2" style={{ gap: '1.5rem', marginTop: '2.5rem' }}>
          <Link
            href="/docs/templates"
            className="card-industrial"
            style={{ padding: '1.75rem', textDecoration: 'none' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, fontSize: '1rem', color: '#fff' }}>
                Static Templates
              </span>
              <ArrowRight size={18} color="var(--neo-green)" />
            </div>
            <p style={{ color: 'var(--text-secondary)', marginTop: '0.85rem', marginBottom: 0 }}>
              Go back to the copy-ready template library if you just want canned payloads.
            </p>
          </Link>
          <Link
            href="/explorer"
            className="card-industrial"
            style={{ padding: '1.75rem', textDecoration: 'none' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, fontSize: '1rem', color: '#fff' }}>
                Open Explorer
              </span>
              <ArrowRight size={18} color="var(--neo-green)" />
            </div>
            <p style={{ color: 'var(--text-secondary)', marginTop: '0.85rem', marginBottom: 0 }}>
              Use the live Oracle Payload Builder and Enclave Sandbox after you choose a flow here.
            </p>
          </Link>
        </div>
      )}
    </div>
  );
}
