import { getPublicWorkflowCatalog } from '@/lib/workflow-runtime';

export async function GET() {
  return Response.json(getPublicWorkflowCatalog());
}
