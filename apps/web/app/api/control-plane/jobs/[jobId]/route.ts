import { getServerSupabaseClient, resolveSupabaseNetwork } from '@/lib/server-supabase';
import { isAuthorizedControlPlaneRequest } from '@/lib/control-plane-auth';
import { decorateControlPlaneJob } from '@/lib/workflow-runtime';
import { trimString } from '@/lib/strings';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  // Job rows carry payload/result/error/metadata (incl. metadata.client_ip), so
  // this control-plane read must be operator-authenticated — knowing the opaque
  // job UUID is not authorization. Matches the sibling control-plane routes.
  if (!isAuthorizedControlPlaneRequest(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { jobId } = await context.params;
  const normalizedJobId = trimString(jobId);
  if (!normalizedJobId) {
    return Response.json({ error: 'job id is required' }, { status: 400 });
  }

  const supabase = getServerSupabaseClient();
  if (!supabase) {
    return Response.json({ error: 'Supabase is not configured' }, { status: 500 });
  }

  const url = new URL(request.url);
  const network = resolveSupabaseNetwork(url.searchParams.get('network'));
  const { data, error } = await supabase
    .from('morpheus_control_plane_jobs')
    .select('*')
    .eq('id', normalizedJobId)
    .eq('network', network)
    .maybeSingle();

  if (error) {
    return Response.json({ error: 'failed to load job' }, { status: 500 });
  }
  if (!data) {
    return Response.json({ error: 'job not found' }, { status: 404 });
  }

  return Response.json(decorateControlPlaneJob(data as Record<string, unknown>));
}
