import './globals.css';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/Toast';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { Layout } from '@/components/ui/Layout';

import { resolveMetadataBase } from '@/lib/app-url';

const metadataBase = resolveMetadataBase(process.env.NEXT_PUBLIC_APP_URL);

export const metadata = {
  metadataBase,
  title: {
    default: 'Morpheus Oracle',
    template: '%s | Morpheus Oracle',
  },
  description: 'Confidential oracle, compute, and isolated datafeed infrastructure for Neo N3.',
  icons: {
    icon: '/logo.svg',
  },
  openGraph: {
    title: 'Morpheus Oracle',
    description: 'Confidential oracle infrastructure for Neo N3.',
    images: ['/og-card.svg'],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ErrorBoundary>
          <ToastProvider>
            <Layout>{children}</Layout>
          </ToastProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
