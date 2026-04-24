import { getServerSupabaseClient } from '@/lib/server-supabase';
import { recordOperationLog } from '@/lib/operation-logs';
import { getSelectedNetworkKey, networkRegistry, resolveSelectedNetworkKey } from '@/lib/networks';

type OperationLogLookupRow = {
  route: string | null;
  category: string | null;
  created_at: string | null;
  http_status: number | null;
  request_id: string | null;
  target_chain: string | null;
  response_payload: unknown;
};

function normalizeHex(value: unknown) {
  const normalized = String(value || '')
    .trim()
    .replace(/^0x/i, '')
    .toLowerCase();
  return /^[0-9a-f]{64}$/.test(normalized) ? normalized : '';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function decodeBase64Utf8(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    return Buffer.from(raw, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function extractEnvelopeByAttestationHash(
  input: unknown,
  targetHash: string
): Record<string, unknown> | null {
  if (Array.isArray(input)) {
    for (const entry of input) {
      const found = extractEnvelopeByAttestationHash(entry, targetHash);
      if (found) return found;
    }
    return null;
  }

  if (!isPlainObject(input)) return null;

  const verification = isPlainObject(input.verification) ? input.verification : null;
  const directHash = normalizeHex(input.attestation_hash);
  const verificationHash = normalizeHex(verification?.attestation_hash);
  if (directHash === targetHash || verificationHash === targetHash) {
    return input;
  }

  for (const value of Object.values(input)) {
    const found = extractEnvelopeByAttestationHash(value, targetHash);
    if (found) return found;
  }
  return null;
}

function buildVerifierInput(envelope: Record<string, unknown>, fallbackHash: string) {
  const verification = isPlainObject(envelope.verification) ? envelope.verification : {};
  const teeAttestation =
    (isPlainObject(verification.tee_attestation) ? verification.tee_attestation : null) ||
    (isPlainObject(envelope.tee_attestation) ? envelope.tee_attestation : null) ||
    (isPlainObject(envelope.attestation) ? envelope.attestation : null) ||
    null;

  return {
    envelope,
    attestation: teeAttestation,
    expected_output_hash:
      String(verification.output_hash || envelope.output_hash || '').trim() || null,
    expected_attestation_hash:
      String(
        verification.attestation_hash || envelope.attestation_hash || `0x${fallbackHash}`
      ).trim() || `0x${fallbackHash}`,
    expected_compose_hash:
      String((teeAttestation as Record<string, unknown> | null)?.compose_hash || '').trim() || null,
    expected_app_id:
      String((teeAttestation as Record<string, unknown> | null)?.app_id || '').trim() || null,
    expected_instance_id:
      String((teeAttestation as Record<string, unknown> | null)?.instance_id || '').trim() || null,
  };
}

async function lookupOperationLogs(attestationHash: string, networkKey: 'mainnet' | 'testnet') {
  const supabase = getServerSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('morpheus_operation_logs')
    .select('route, category, created_at, http_status, request_id, target_chain, response_payload')
    .eq('network', networkKey)
    .order('created_at', { ascending: false })
    .limit(250);

  if (error) throw error;

  const rows = (data as OperationLogLookupRow[] | null) || [];

  return rows
    .map((row) => {
      const envelope = extractEnvelopeByAttestationHash(row.response_payload, attestationHash);
      if (!envelope) return null;
      return {
        source: 'operation_log',
        route: row.route,
        category: row.category,
        created_at: row.created_at,
        http_status: row.http_status,
        request_id: row.request_id,
        target_chain: row.target_chain,
        verifier_input: buildVerifierInput(envelope, attestationHash),
      };
    })
    .filter(Boolean);
}

function buildFeedLookupUrl(networkKey: 'mainnet' | 'testnet') {
  const registry = networkRegistry[networkKey];
  const contractHash = String(registry.neo_n3?.contracts?.morpheus_datafeed || '').trim();
  if (!contractHash) return '';
  const n3IndexNetwork = networkKey === 'mainnet' ? 'mainnet' : 'testnet';
  return `https://api.n3index.dev/rest/v1/contract_notifications?network=eq.${n3IndexNetwork}&contract_hash=eq.${contractHash}&event_name=eq.FeedUpdated&limit=200&order=block_index.desc`;
}

async function lookupFeedNotifications(attestationHash: string, networkKey: 'mainnet' | 'testnet') {
  const lookupUrl = buildFeedLookupUrl(networkKey);
  if (!lookupUrl) return [];

  const response = await fetch(lookupUrl, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  });
  const body = await response.json().catch(() => []);
  if (!Array.isArray(body)) return [];

  return body
    .map((entry) => {
      const state = entry?.state_json?.value;
      if (!Array.isArray(state) || state.length < 6) return null;
      const actualHash = normalizeHex(
        Buffer.from(String(state[4]?.value || ''), 'base64').toString('hex')
      );
      if (actualHash !== attestationHash) return null;
      return {
        source: 'neo_n3_feed',
        txid: entry.txid || null,
        block_index: entry.block_index || null,
        pair: decodeBase64Utf8(state[0]?.value),
        round_id: String(state[1]?.value || ''),
        price: String(state[2]?.value || ''),
        timestamp: String(state[3]?.value || ''),
        attestation_hash: `0x${actualHash}`,
      };
    })
    .filter(Boolean);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const attestationHash = normalizeHex(url.searchParams.get('attestation_hash'));
  const networkKey = resolveSelectedNetworkKey(
    url.searchParams.get('network') || getSelectedNetworkKey()
  );
  if (!attestationHash) {
    return Response.json({ error: 'attestation_hash query param is required' }, { status: 400 });
  }

  let operationMatches: unknown[] = [];
  let feedMatches: unknown[] = [];
  let lookupError: string | null = null;

  try {
    [operationMatches, feedMatches] = await Promise.all([
      lookupOperationLogs(attestationHash, networkKey),
      lookupFeedNotifications(attestationHash, networkKey),
    ]);
  } catch (error) {
    lookupError = error instanceof Error ? error.message : String(error);
  }

  const firstVerifierInput =
    (operationMatches as Array<{ verifier_input?: Record<string, unknown> }>).find(
      (entry) => entry?.verifier_input
    )?.verifier_input || null;

  const body = {
    ok: !lookupError,
    network: networkKey,
    attestation_hash: `0x${attestationHash}`,
    found: Boolean(firstVerifierInput || (feedMatches as unknown[]).length > 0),
    verifier_input: firstVerifierInput,
    operation_log_matches: operationMatches,
    onchain_feed_matches: feedMatches,
    error: lookupError,
  };

  await recordOperationLog({
    route: '/api/attestation/lookup',
    method: 'GET',
    category: 'attestation',
    requestPayload: Object.fromEntries(url.searchParams.entries()),
    responsePayload: body,
    httpStatus: lookupError ? 500 : 200,
    error: lookupError,
  });

  return Response.json(body, { status: lookupError ? 500 : 200 });
}
