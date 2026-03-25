import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';

import { recordOperationLog } from '@/lib/operation-logs';
import { createRateLimitedHandler } from '@/lib/rate-limit';
import {
  getServerSupabaseClient,
  resolveProjectIdBySlug,
  resolveSupabaseNetwork,
} from '@/lib/server-supabase';

type EncryptedSecretInsertRow = {
  project_id: string | null;
  network: string;
  name: string;
  target_chain: string;
  encryption_algorithm: string;
  key_version: number;
  ciphertext: string;
  metadata: Record<string, unknown>;
};

type EncryptedSecretInsertResult = {
  id: string;
  name: string;
  target_chain: string;
  encryption_algorithm: string;
  created_at: string | null;
};

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeHash160(value: unknown) {
  const raw = trimString(value).replace(/^0x/i, '').toLowerCase();
  return /^[0-9a-f]{40}$/.test(raw) ? `0x${raw}` : '';
}

const handlePost = createRateLimitedHandler(
async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const ciphertext = trimString(body?.ciphertext);
  const targetChain = trimString(body?.target_chain || body?.targetChain || 'neo_n3');
  const network = resolveSupabaseNetwork(String(body?.network || body?.morpheus_network || ''));
  const projectSlug = trimString(body?.project_slug || body?.projectSlug || '');
  const name = trimString(body?.name || '') || `cipher-ref:${randomUUID()}`;
  const algorithm = trimString(
    body?.encryption_algorithm || body?.algorithm || 'client-supplied-ciphertext'
  );
  const metadata = typeof body?.metadata === 'object' && body?.metadata ? body.metadata : {};
  const boundRequester = normalizeHash160(body?.requester || body?.requester_script_hash);
  const boundCallbackContract = normalizeHash160(body?.callback_contract || body?.callbackContract);

  if (!ciphertext) {
    return NextResponse.json({ error: 'ciphertext is required' }, { status: 400 });
  }
  if (targetChain !== 'neo_n3') {
    return NextResponse.json({ error: 'target_chain must be neo_n3' }, { status: 400 });
  }

  const supabase = getServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase server client is not configured' },
      { status: 500 }
    );
  }

  try {
    const projectId = projectSlug
      ? await resolveProjectIdBySlug(supabase, projectSlug, network)
      : null;
    const row: EncryptedSecretInsertRow = {
      project_id: projectId,
      network,
      name,
      target_chain: targetChain,
      encryption_algorithm: algorithm,
      key_version: 1,
      ciphertext,
      metadata: {
        source: 'api.confidential.store',
        network,
        ...(boundRequester ? { bound_requester: boundRequester } : {}),
        ...(boundCallbackContract ? { bound_callback_contract: boundCallbackContract } : {}),
        ...metadata,
      },
    };

    const encryptedSecrets = supabase.from('morpheus_encrypted_secrets') as any;
    const { data, error } = await encryptedSecrets
      .insert(row)
      .select('id,name,target_chain,encryption_algorithm,created_at')
      .single();
    if (error) throw error;
    const inserted = data as EncryptedSecretInsertResult;

    const responsePayload = {
      secret_ref: inserted.id,
      network,
      name: inserted.name,
      target_chain: inserted.target_chain,
      encryption_algorithm: inserted.encryption_algorithm,
      created_at: inserted.created_at,
      ...(boundRequester ? { bound_requester: boundRequester } : {}),
      ...(boundCallbackContract ? { bound_callback_contract: boundCallbackContract } : {}),
    };

    await recordOperationLog({
      route: '/api/confidential/store',
      method: 'POST',
      category: 'system',
      requestPayload: {
        project_slug: projectSlug || null,
        network,
        target_chain: targetChain,
        ciphertext,
      },
      responsePayload,
      httpStatus: 200,
      metadata: {
        secret_name: inserted.name,
        secret_ref: inserted.id,
      },
    });

    return NextResponse.json(responsePayload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordOperationLog({
      route: '/api/confidential/store',
      method: 'POST',
      category: 'system',
      requestPayload: {
        project_slug: projectSlug || null,
        network,
        target_chain: targetChain,
        ciphertext,
      },
      responsePayload: { error: message },
      httpStatus: 500,
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
},
{ scope: 'confidential_store', maxRequests: 20, windowMs: 60_000 }
);

export async function POST(request: Request) {
  return handlePost(request);
}
