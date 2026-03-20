import { buildRelayerExecutionConfig, trimString } from '@/lib/control-plane-execution';
import { isAuthorizedControlPlaneRequest } from '@/lib/control-plane-auth';
import { resolveSupabaseNetwork } from '@/lib/server-supabase';

export const runtime = 'nodejs';

function badRequest(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export async function POST(request: Request) {
  if (!isAuthorizedControlPlaneRequest(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!isPlainObject(body)) return badRequest('invalid JSON body');

  const network = resolveSupabaseNetwork(trimString(body.network || 'testnet'));
  const targetChain = trimString(body.target_chain || body.chain || '');
  const requestId = trimString(body.request_id || '');
  const verificationSignature = trimString(
    body.verification_signature || body.signature || body.oracle_verifier_signature || ''
  );
  const errorText = trimString(body.error || '');
  const resultText =
    body.result === null || body.result === undefined ? '' : String(body.result);
  const resultBytesBase64 = trimString(body.result_bytes_base64 || '');

  if (!requestId) return badRequest('request_id is required');
  if (!verificationSignature) return badRequest('verification_signature is required');
  if (targetChain !== 'neo_n3' && targetChain !== 'neo_x') {
    return badRequest('target_chain must be neo_n3 or neo_x');
  }

  const success =
    typeof body.success === 'boolean'
      ? body.success
      : trimString(body.success).toLowerCase() === 'true';

  const config = await buildRelayerExecutionConfig(network);
  const neoN3ModulePath = '../../../../../../../workers/morpheus-relayer/src/neo-n3.js';
  const neoXModulePath = '../../../../../../../workers/morpheus-relayer/src/neo-x.js';
  const neoN3 = (await import(neoN3ModulePath)) as {
    fulfillNeoN3Request: (
      config: unknown,
      requestId: string,
      success: boolean,
      result: string,
      error: string,
      verificationSignature: string,
      resultBytesBase64?: string
    ) => Promise<unknown>;
  };
  const neoX = (await import(neoXModulePath)) as {
    fulfillNeoXRequest: (
      config: unknown,
      requestId: string,
      success: boolean,
      result: string,
      error: string,
      verificationSignature: string,
      resultBytesBase64?: string
    ) => Promise<unknown>;
  };
  const result =
    targetChain === 'neo_x'
      ? await neoX.fulfillNeoXRequest(
          config,
          requestId,
          success,
          resultText,
          errorText,
          verificationSignature,
          resultBytesBase64
        )
      : await neoN3.fulfillNeoN3Request(
          config,
          requestId,
          success,
          resultText,
          errorText,
          verificationSignature,
          resultBytesBase64
        );

  return Response.json({
    ok: true,
    network,
    target_chain: targetChain,
    request_id: requestId,
    broadcast: result,
  });
}
