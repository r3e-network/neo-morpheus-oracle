"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

interface CodeBlockProps {
  code: string;
  language?: string;
  title?: string;
}

export function CodeBlock({ code, language = "javascript", title }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="card-industrial" style={{ padding: '0', overflow: 'hidden', margin: '2rem 0' }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        padding: '0.75rem 1.5rem', 
        background: 'rgba(255,255,255,0.02)', 
        borderBottom: '1px solid var(--border-dim)' 
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {/* macOS window controls */}
          <div style={{ display: 'flex', gap: '6px', marginRight: '0.5rem' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ff5f56' }}></div>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ffbd2e' }}></div>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#27c93f' }}></div>
          </div>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 800, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            {language}
          </span>
          {title && <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{title}</span>}
        </div>
        <button 
          onClick={handleCopy} 
          style={{ 
            background: 'transparent', 
            border: 'none', 
            color: copied ? 'var(--neo-green)' : 'var(--text-muted)', 
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            transition: 'color 0.2s'
          }}
          title="Copy to clipboard"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      <pre style={{ 
        margin: 0, 
        padding: '1.5rem', 
        background: 'transparent', 
        border: 'none', 
        overflowX: 'auto' 
      }}>
        <code style={{ 
          fontFamily: 'var(--font-mono)', 
          fontSize: '0.85rem', 
          color: '#fff', 
          lineHeight: 1.6 
        }}>
          {code}
        </code>
      </pre>
    </div>
  );
}
