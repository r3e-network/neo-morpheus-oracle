import { isAuthorizedAdminRequest } from './server-supabase';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function isAuthorizedControlPlaneRequest(request: Request) {
  if (
    isAuthorizedAdminRequest(request, 'relayer_ops') ||
    isAuthorizedAdminRequest(request, 'provider_config')
  ) {
    return true;
  }

  const sharedToken = trimString(
    process.env.PHALA_API_TOKEN || process.env.PHALA_SHARED_SECRET || ''
  );
  if (!sharedToken) return false;
  const bearer = trimString(request.headers.get('authorization'));
  const admin = trimString(request.headers.get('x-admin-api-key'));
  return bearer === `Bearer ${sharedToken}` || admin === sharedToken;
}
