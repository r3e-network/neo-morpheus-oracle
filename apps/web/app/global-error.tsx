'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#000000',
          color: '#ffffff',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <div
          style={{
            width: 'min(540px, calc(100vw - 32px))',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 20px',
              background: 'rgba(239, 68, 68, 0.05)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: '4px',
              marginBottom: '2rem',
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: '#ef4444',
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              }}
            >
              SYSTEM ERROR
            </span>
          </div>
          <h1
            style={{
              margin: '0 0 12px',
              fontSize: 'clamp(2rem, 5vw, 3rem)',
              fontWeight: 800,
              letterSpacing: '-0.04em',
              lineHeight: 1.1,
            }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              margin: '0 auto 2rem',
              color: '#a1a1aa',
              lineHeight: 1.7,
              fontSize: '1rem',
              maxWidth: '420px',
            }}
          >
            An unexpected error occurred. The failure has been captured for investigation. You can
            retry the current route without leaving the application.
          </p>
          {error?.digest && (
            <p
              style={{
                margin: '0 0 2rem',
                fontSize: '0.75rem',
                color: '#52525b',
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              }}
            >
              Digest: {error.digest}
            </p>
          )}
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => reset()}
              style={{
                border: 0,
                borderRadius: '2px',
                padding: '0.85rem 2rem',
                fontWeight: 700,
                cursor: 'pointer',
                background: '#ffffff',
                color: '#000000',
                fontSize: '0.8rem',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              Retry
            </button>
            <a
              href="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '0.85rem 2rem',
                border: '1px solid #333333',
                borderRadius: '2px',
                color: '#ffffff',
                textDecoration: 'none',
                fontWeight: 700,
                fontSize: '0.8rem',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              Go Home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
