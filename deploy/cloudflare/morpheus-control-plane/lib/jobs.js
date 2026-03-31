import { trimString } from '@neo-morpheus-oracle/shared/utils';

const REQUEUE_GRACE_MS = 60_000;

function normalizeJobStatus(value) {
  return trimString(value).toLowerCase();
}

async function insertJob(env, record) {
  const { supabaseFetch } = await import('./supabase.js');
  const response = await supabaseFetch(env, '/morpheus_control_plane_jobs', {
    method: 'POST',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify(record),
  });
  if (!response.ok) {
    throw new Error(`job insert failed: ${response.status} ${await response.text()}`);
  }
  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] : rows;
}

async function patchJob(env, jobId, network, fields) {
  const { supabaseFetch } = await import('./supabase.js');
  const response = await supabaseFetch(
    env,
    `/morpheus_control_plane_jobs?id=eq.${jobId}&network=eq.${network}`,
    {
      method: 'PATCH',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify({
        ...fields,
        updated_at: new Date().toISOString(),
      }),
    }
  );
  if (!response.ok) {
    throw new Error(`job patch failed: ${response.status} ${await response.text()}`);
  }
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function loadJob(env, jobId, network) {
  const { supabaseFetch } = await import('./supabase.js');
  const response = await supabaseFetch(
    env,
    `/morpheus_control_plane_jobs?id=eq.${jobId}&network=eq.${network}&select=*`
  );
  if (!response.ok) {
    throw new Error(`job fetch failed: ${response.status} ${await response.text()}`);
  }
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : rows;
}

export { insertJob, patchJob, loadJob, normalizeJobStatus, REQUEUE_GRACE_MS };
