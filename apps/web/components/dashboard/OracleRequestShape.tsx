'use client';

import { Cpu } from 'lucide-react';

interface OracleRequestShapeProps {
  requestMode: string;
  setRequestMode: (value: string) => void;
  oracleTargetChain: string;
  setOracleTargetChain: (value: string) => void;
  providerSymbol: string;
  setProviderSymbol: (value: string) => void;
  oracleUrl: string;
  setOracleUrl: (value: string) => void;
  httpMethod: string;
  setHttpMethod: (value: string) => void;
  oracleJsonPath: string;
  setOracleJsonPath: (value: string) => void;
  walletCallbackHash: string;
  setWalletCallbackHash: (value: string) => void;
  walletCallbackMethod: string;
  setWalletCallbackMethod: (value: string) => void;
  useCustomScript: boolean;
  setUseCustomScript: (value: boolean) => void;
  oracleScript: string;
  setOracleScript: (value: string) => void;
  oracleScriptRefJson: string;
  setOracleScriptRefJson: (value: string) => void;
  onGeneratePackage: () => void;
}

export function OracleRequestShape({
  requestMode,
  setRequestMode,
  oracleTargetChain,
  setOracleTargetChain,
  providerSymbol,
  setProviderSymbol,
  oracleUrl,
  setOracleUrl,
  httpMethod,
  setHttpMethod,
  oracleJsonPath,
  setOracleJsonPath,
  walletCallbackHash,
  setWalletCallbackHash,
  walletCallbackMethod,
  setWalletCallbackMethod,
  useCustomScript,
  setUseCustomScript,
  oracleScript,
  setOracleScript,
  oracleScriptRefJson,
  setOracleScriptRefJson,
  onGeneratePackage,
}: OracleRequestShapeProps) {
  return (
    <div className="card-industrial stagger-2" style={{ padding: '0' }}>
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
          <Cpu className="text-neo" size={16} /> 2. On-Chain Request Shape
        </h3>
      </div>

      <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="grid grid-2" style={{ gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label">Request Mode</label>
            <select
              className="neo-select"
              value={requestMode}
              onChange={(event) => setRequestMode(event.target.value)}
            >
              <option value="provider">Built-in Provider</option>
              <option value="url">Custom URL</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Target Chain</label>
            <select
              className="neo-select"
              value={oracleTargetChain}
              onChange={(event) => setOracleTargetChain(event.target.value)}
            >
              <option value="neo_n3">Neo N3</option>
            </select>
          </div>
        </div>

        {requestMode === 'provider' ? (
          <div className="grid grid-2" style={{ gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Source</label>
              <div
                className="badge-outline"
                style={{
                  alignSelf: 'stretch',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                Provider inferred from pair prefix
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Canonical Pair Key</label>
              <input
                className="neo-input"
                value={providerSymbol}
                onChange={(event) => setProviderSymbol(event.target.value)}
                placeholder="TWELVEDATA:NEO-USD"
              />
            </div>
          </div>
        ) : (
          <>
            <div className="form-group">
              <label className="form-label">Custom URL</label>
              <input
                className="neo-input"
                value={oracleUrl}
                onChange={(event) => setOracleUrl(event.target.value)}
                placeholder="https://..."
              />
            </div>
            <div className="form-group">
              <label className="form-label">HTTP Method</label>
              <select
                className="neo-select"
                value={httpMethod}
                onChange={(event) => setHttpMethod(event.target.value)}
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
              </select>
            </div>
          </>
        )}

        <div className="form-group">
          <label className="form-label">JSON Path</label>
          <input
            className="neo-input"
            value={oracleJsonPath}
            onChange={(event) => setOracleJsonPath(event.target.value)}
            placeholder="price or data.score"
          />
        </div>

        <div className="grid grid-2" style={{ gap: '1rem' }}>
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

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            color: 'var(--text-secondary)',
            fontSize: '0.85rem',
          }}
        >
          <input
            type="checkbox"
            checked={useCustomScript}
            onChange={(event) => setUseCustomScript(event.target.checked)}
          />
          Include custom JS reduction (<code>process(data, context, helpers)</code>)
        </label>

        <div
          style={{
            padding: '0.9rem 1rem',
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
            PAYLOAD TEMPLATE
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {requestMode === 'provider'
              ? 'Built-in pair mode: the symbol already carries the source prefix, so only the canonical pair key needs to stay public.'
              : 'Custom URL mode: keep the URL public, and hide headers/query/body/json_path/script in encrypted_params when needed.'}
          </div>
        </div>

        {useCustomScript && (
          <div className="form-group">
            <label className="form-label">Oracle Script</label>
            <textarea
              className="code-editor"
              value={oracleScript}
              onChange={(event) => setOracleScript(event.target.value)}
              style={{ minHeight: '120px' }}
            />
            <div
              style={{
                fontSize: '0.72rem',
                color: 'var(--text-secondary)',
                marginTop: '0.75rem',
                marginBottom: '0.35rem',
                fontFamily: 'var(--font-mono)',
              }}
            >
              Optional script_ref JSON. If valid, it overrides the inline script and lets the worker
              read the function body from a Neo N3 contract getter.
            </div>
            <textarea
              className="code-editor"
              value={oracleScriptRefJson}
              onChange={(event) => setOracleScriptRefJson(event.target.value)}
              style={{ minHeight: '110px' }}
            />
          </div>
        )}

        <button
          className="btn-ata"
          style={{ width: '100%', justifyContent: 'center' }}
          onClick={onGeneratePackage}
        >
          Generate On-Chain Package
        </button>
      </div>
    </div>
  );
}
