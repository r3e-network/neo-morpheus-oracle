import { getServerSupabaseClient, resolveSupabaseNetwork } from '@/lib/server-supabase';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
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
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return Response.json({ error: 'job not found' }, { status: 404 });
  }

  return Response.json(data);
}
