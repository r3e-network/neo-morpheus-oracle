'use client';

import { Dashboard } from '../../components/dashboard';
import { Layout } from '@/components/ui/Layout';

export default function ExplorerPage() {
  return (
    <Layout>
      <div className="container" style={{ padding: '2rem 0' }}>
        <Dashboard />
      </div>
    </Layout>
  );
}
