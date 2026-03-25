export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export async function onRequestError(...args: unknown[]) {
  const Sentry = await import('@sentry/nextjs');
  if (typeof Sentry.captureRequestError === 'function') {
    return (Sentry.captureRequestError as (...params: unknown[]) => unknown)(...args);
  }
}
