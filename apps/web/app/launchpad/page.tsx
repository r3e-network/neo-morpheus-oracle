'use client';

import { Launchpad } from '@/components/launchpad/Launchpad';
import { Layout } from '@/components/ui/Layout';

export default function LaunchpadPage() {
  return (
    <Layout>
      <div className="container" style={{ padding: '2rem 0' }}>
        <Launchpad embedded />
      </div>
    </Layout>
  );
}
