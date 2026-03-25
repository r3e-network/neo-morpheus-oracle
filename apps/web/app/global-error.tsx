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
          background: '#050816',
          color: '#f8fafc',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        }}
      >
        <div
          style={{
            width: 'min(560px, calc(100vw - 32px))',
            padding: 32,
            borderRadius: 20,
            border: '1px solid rgba(148, 163, 184, 0.2)',
            background: 'rgba(15, 23, 42, 0.78)',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.35)',
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: '#38bdf8',
            }}
          >
            Morpheus Oracle
          </p>
          <h1 style={{ margin: '12px 0 10px', fontSize: 28, lineHeight: 1.15 }}>
            Something went wrong
          </h1>
          <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.7 }}>
            The failure was captured for investigation. You can retry the current route without
            leaving the app.
          </p>
          <button
            onClick={() => reset()}
            style={{
              marginTop: 20,
              border: 0,
              borderRadius: 999,
              padding: '12px 18px',
              fontWeight: 700,
              cursor: 'pointer',
              background: '#22c55e',
              color: '#04110a',
            }}
          >
            Retry
          </button>
        </div>
      </body>
    </html>
  );
}
