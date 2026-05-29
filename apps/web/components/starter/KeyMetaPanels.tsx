'use client';

type KeyMetaPanelsProps = {
  oracleKeyMeta: any;
};

export function KeyMetaPanels({ oracleKeyMeta }: KeyMetaPanelsProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
      <div
        style={{
          padding: '1rem',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-dim)',
          borderRadius: 'var(--ns-radius-md)',
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
            color: 'var(--text-primary)',
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
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-dim)',
          borderRadius: 'var(--ns-radius-md)',
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
          style={{
            fontSize: '0.78rem',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {oracleKeyMeta?.key_source || 'loading'}
        </div>
      </div>
    </div>
  );
}
