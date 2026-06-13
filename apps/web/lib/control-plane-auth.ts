import { timingSafeCompare, trimString } from '@neo-morpheus-oracle/shared/utils';
import { isAuthorizedAdminRequest } from './server-supabase';

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
  return timingSafeCompare(bearer, `Bearer ${sharedToken}`) || timingSafeCompare(admin, sharedToken);
}
