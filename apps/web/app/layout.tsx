import './globals.css';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/Toast';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { Layout } from '@/components/ui/Layout';

const metadataBase = new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');

export const metadata = {
  metadataBase,
  title: {
    default: 'Morpheus Oracle',
    template: '%s | Morpheus Oracle',
  },
  description: 'Privacy Oracle, privacy compute, and datafeed network for Neo N3.',
  icons: {
    icon: '/logo.svg',
  },
  openGraph: {
    title: 'Morpheus Oracle',
    description: 'Truth infrastructure for Neo N3.',
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
