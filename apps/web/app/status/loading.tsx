import { Skeleton } from '@/components/ui/Skeleton';

export default function StatusLoading() {
  return (
    <div className="container" style={{ padding: 'calc(72px + 3rem) 0 4rem' }}>
      <Skeleton width="160px" height="14px" style={{ marginBottom: '1rem' }} />
      <Skeleton width="260px" height="36px" style={{ marginBottom: '0.75rem' }} />
      <Skeleton width="400px" height="18px" style={{ marginBottom: '2rem' }} />

      <Skeleton height="80px" style={{ marginBottom: '2rem', borderRadius: '4px' }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} height="72px" style={{ borderRadius: 0 }} />
        ))}
      </div>
    </div>
  );
}
