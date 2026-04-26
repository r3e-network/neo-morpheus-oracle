'use client';

import { Code2 } from 'lucide-react';
import { BUILTIN_FUNCTIONS } from '@/lib/docs-data';
import { NETWORKS } from '@/lib/onchain-data';

export default function DocsApiReference() {
  const oracleDomain = NETWORKS.neo_n3.domains.oracle || 'unassigned';

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
        <Code2 size={14} color="var(--neo-green)" />
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
          DEVELOPER REFERENCE
        </span>
      </div>
      <h1>API Reference</h1>

      <p
        className="lead"
        style={{ fontSize: '1.15rem', color: 'var(--text-primary)', marginBottom: '2.5rem' }}
      >
        Complete technical specifications for the Morpheus smart contracts and the Enclave
        Javascript SDK.
      </p>

      <h2>1. Smart Contract Interface (Neo N3 C#)</h2>
      <p>The active on-chain interface is the Neo N3 C# call pattern below.</p>

      <div
        style={{
          padding: '0',
          overflow: 'hidden',
          marginBottom: '2.5rem',
          background: '#000',
          border: '1px solid var(--border-dim)',
          borderRadius: '4px',
        }}
      >
        <div
          style={{
            padding: '1rem 1.5rem',
            borderBottom: '1px solid var(--border-dim)',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <span
            style={{
              fontSize: '0.8rem',
              fontWeight: 800,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-primary)',
              textTransform: 'uppercase',
              letterSpacing: 0,
            }}
          >
            Oracle Call Pattern
          </span>
        </div>
        <div style={{ padding: '1.5rem', background: '#0a0a0a', overflowX: 'auto' }}>
          <pre style={{ margin: 0, border: 'none', background: 'transparent' }}>
            <code
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8rem',
                lineHeight: 1.6,
                color: '#e5e5e5',
              }}
            >{`// ${NETWORKS.neo_n3.name} Oracle: ${NETWORKS.neo_n3.oracle}

string payloadJson = "{\"symbol\":\"TWELVEDATA:NEO-USD\",\"json_path\":\"price\",\"target_chain\":\"neo_n3\"}";

Contract.Call(
 MorpheusOracleHash,
 "request",
 CallFlags.All,
 "privacy_oracle",
 (ByteString)payloadJson,
 Runtime.ExecutingScriptHash,
 "onOracleResult"
);`}</code>
          </pre>
        </div>
      </div>

      <p>
        To interact with the Morpheus Oracle on {NETWORKS.neo_n3.name}, use{' '}
        <code>Contract.Call</code> against <code>{NETWORKS.neo_n3.oracle}</code> or NeoNS{' '}
        <code>{oracleDomain}</code>.
      </p>

      <h2>2. Enclave SDK (Javascript)</h2>
      <p>
        NeoDID now also exposes a W3C DID resolution route for public service discovery and subject
        namespaces:
      </p>

      <div
        style={{
          padding: '0',
          overflow: 'hidden',
          marginBottom: '2.5rem',
          background: '#000',
          border: '1px solid var(--border-dim)',
          borderRadius: '4px',
        }}
      >
        <div
          style={{
            padding: '1rem 1.5rem',
            borderBottom: '1px solid var(--border-dim)',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <span
            style={{
              fontSize: '0.8rem',
              fontWeight: 800,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-primary)',
              textTransform: 'uppercase',
              letterSpacing: 0,
            }}
          >
            GET /api/neodid/resolve
          </span>
        </div>
        <div style={{ padding: '1.5rem', background: '#0a0a0a', overflowX: 'auto' }}>
          <pre style={{ margin: 0, border: 'none', background: 'transparent' }}>
            <code
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8rem',
                lineHeight: 1.6,
                color: '#e5e5e5',
              }}
            >{`GET /api/neodid/resolve?did=did:morpheus:neo_n3:service:neodid
Accept: application/ld+json;profile="https://w3id.org/did-resolution"

GET /api/neodid/resolve?did=did:morpheus:neo_n3:vault:6d0656f6dd91469db1c90cc1e574380613f43738&format=document
Accept: application/did+ld+json`}</code>
          </pre>
        </div>
      </div>

      <p>
        The resolver exposes the public service DID document, TEE verifier JWK, registry anchors,
        and subject namespaces without leaking provider UIDs or nullifiers.
      </p>

      <h2>3. Enclave SDK (Javascript)</h2>
      <p>
        When using built-in compute, Morpheus exposes a fixed catalog of functions. Custom JS
        compute receives <code>input</code> and <code>helpers</code>; Oracle custom JS receives{' '}
        <code>data</code>, <code>context</code>, and <code>helpers</code>.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '1.5rem',
        }}
      >
        {BUILTIN_FUNCTIONS.map((fn) => (
          <div
            key={fn.name}
            style={{
              background: '#000',
              border: '1px solid var(--border-dim)',
              borderRadius: '4px',
              padding: '1.5rem',
              borderTop: '3px solid var(--accent-purple)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '0.75rem',
                alignItems: 'flex-start',
              }}
            >
              <code
                style={{
                  color: 'var(--neo-green)',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {fn.name}
              </code>
              <span
                className="badge-outline"
                style={{
                  color: 'var(--accent-purple)',
                  fontSize: '0.55rem',
                  padding: '0.2rem 0.5rem',
                  borderColor: 'var(--accent-purple)',
                  textTransform: 'uppercase',
                }}
              >
                {fn.category}
              </span>
            </div>
            <p
              style={{
                fontSize: '0.85rem',
                color: 'var(--text-secondary)',
                marginBottom: '1.5rem',
                lineHeight: 1.6,
              }}
            >
              {fn.desc}
            </p>
            <div
              style={{
                background: '#0a0a0a',
                padding: '1rem',
                borderRadius: '4px',
                border: '1px solid var(--border-dim)',
              }}
            >
              <div
                style={{
                  fontSize: '0.65rem',
                  color: 'var(--text-muted)',
                  marginBottom: '0.5rem',
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: 0,
                }}
              >
                // PARAMETERS
              </div>
              <div
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--text-primary)',
                  marginBottom: '1.5rem',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {fn.params}
              </div>

              <div
                style={{
                  fontSize: '0.65rem',
                  color: 'var(--text-muted)',
                  marginBottom: '0.5rem',
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: 0,
                }}
              >
                // EXAMPLE
              </div>
              <code
                style={{
                  display: 'block',
                  fontSize: '0.75rem',
                  color: '#fff',
                  wordBreak: 'break-all',
                  fontFamily: 'var(--font-mono)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {fn.example}
              </code>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
