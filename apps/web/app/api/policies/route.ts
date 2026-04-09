import { getPublicPolicyCatalog } from '@/lib/workflow-runtime';

export async function GET() {
  return Response.json(getPublicPolicyCatalog());
}
