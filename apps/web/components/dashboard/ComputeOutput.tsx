'use client';

import { CheckCircle2, Copy } from 'lucide-react';
import { NETWORKS } from '@/lib/onchain-data';

interface GeneratedPackage {
  requestType: string;
  payload: Record<string, unknown>;
  payloadJson: string;
  neoN3Snippet: string;
}

interface ComputeOutputProps {
  generatedPackage: GeneratedPackage;
  payloadBase64: string;
  neoRpcInvoke: string;
  callbackQueryTemplate: string;
  copiedItem: string | null;
  onCopy: (id: string, value: string) => void;
}

export function ComputeOutput({
  generatedPackage,
  payloadBase64,
  neoRpcInvoke,
  callbackQueryTemplate,
  copiedItem,
  onCopy,
}: ComputeOutputProps) {
  return (
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
      <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            className="btn-secondary"
            style={{ border: '1px solid var(--border-dim)' }}
            onClick={() => onCopy('compute-payload', generatedPackage.payloadJson)}
          >
            <Copy size={14} />{' '}
            {copiedItem === 'compute-payload' ? 'Copied Payload' : 'Copy Payload JSON'}
          </button>
          <button
            className="btn-secondary"
            style={{ border: '1px solid var(--border-dim)' }}
            onClick={() => onCopy('compute-n3', generatedPackage.neoN3Snippet)}
          >
            <Copy size={14} /> {copiedItem === 'compute-n3' ? 'Copied N3' : 'Copy Neo N3 Snippet'}
          </button>
        </div>
        <div style={{ background: '#000', border: '1px solid var(--border-dim)', padding: '1rem' }}>
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
        <div style={{ background: '#000', border: '1px solid var(--border-dim)', padding: '1rem' }}>
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
  );
}
