'use client';

import { Launchpad } from '@/components/launchpad/Launchpad';

export default function LaunchpadPage() {
  return (
    <div className="container" style={{ padding: '2rem 0' }}>
      <Launchpad embedded />
    </div>
  );
}
