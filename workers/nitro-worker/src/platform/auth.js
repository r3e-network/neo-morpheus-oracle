import { env, json, trimString } from './core.js';
import { timingSafeEqual } from 'node:crypto';

function safeEqual(a, b) {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function requireAuth(request) {
  // PHALA_API_TOKEN / PHALA_SHARED_SECRET intentionally dropped: those Phala
  // credentials were revoked when the runtime migrated off Phala. Only the
  // current MORPHEUS_*/NITRO_* runtime tokens authorize worker requests.
  const expected = env('MORPHEUS_RUNTIME_TOKEN', 'NITRO_API_TOKEN', 'NITRO_SHARED_SECRET');
  const auth = trimString(
    request.headers.get('authorization') || request.headers.get('x-nitro-token')
  );
  if (!expected) {
    return { ok: false, response: json(503, { error: 'worker auth secret is not configured' }) };
  }
  if (safeEqual(auth, `Bearer ${expected}`) || safeEqual(auth, expected)) return { ok: true };
  return { ok: false, response: json(401, { error: 'unauthorized' }) };
}
