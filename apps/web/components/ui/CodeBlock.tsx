"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

import hljs from 'highlight.js';
import 'highlight.js/styles/atom-one-dark.css';

interface CodeBlockProps {
  code: string;
  language?: string;
  title?: string;
}

export function CodeBlock({ code, language = "plaintext", title }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Safely grab a language that HLJS supports, default to plaintext if missing
  const validLanguage = hljs.getLanguage(language) ? language : 'plaintext';
  const highlighted = hljs.highlight(code, { language: validLanguage }).value;

  return (
    <div style={{ position: 'relative', margin: '1.5rem 0', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border-dim)' }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        padding: '0.4rem 1rem', 
        background: '#111', 
        borderBottom: '1px solid #222' 
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.65rem', color: '#888', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
            {language}
          </span>
          {title && <span style={{ fontSize: '0.75rem', color: '#555', fontFamily: 'var(--font-mono)' }}>{title}</span>}
        </div>
        <button 
          onClick={handleCopy} 
          style={{ 
            background: 'transparent', 
            border: 'none', 
            color: copied ? 'var(--neo-green)' : '#666', 
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            transition: 'color 0.2s'
          }}
          title="Copy code"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
      </div>
      <div style={{ background: '#0a0a0a', padding: '1rem', overflowX: 'auto' }}>
        <pre style={{ margin: 0, background: 'transparent', padding: 0, border: 'none' }}>
          <code 
            className={`hljs language-${validLanguage}`}
            style={{ 
              fontFamily: 'var(--font-mono)', 
              fontSize: '0.8rem', 
              lineHeight: 1.6,
              background: 'transparent',
              padding: 0
            }}
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        </pre>
      </div>
    </div>
  );
}
