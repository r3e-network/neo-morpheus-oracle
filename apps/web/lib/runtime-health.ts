import { getSelectedNetwork, getSelectedNetworkKey } from './networks';
import { trimString } from '@neo-morpheus-oracle/shared/utils';

// The attested in-TEE enclave server exposes /health publicly (unauthenticated).
// This is the real liveness source for the public status surface — NOT the retired
// runtime proxy (oracle.meshmini.app, which serves the emergency stub).
const DEFAULT_BOX_HEALTH_URL = 'https://runtime.meshmini.app/health';

export function resolveBoxHealthUrl(): string {
  return trimString(process.env.MORPHEUS_BOX_HEALTH_URL) || DEFAULT_BOX_HEALTH_URL;
}

export interface RuntimeProbe {
  ok: boolean;
  status: number;
  body: unknown;
}

export async function fetchBoxHealth(): Promise<RuntimeProbe> {
  try {
    const response = await fetch(resolveBoxHealthUrl(), {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    const text = await response.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = text || null;
    }
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: { error: error instanceof Error ? error.message : String(error) },
    };
  }
}

// The box does not serve /info publicly (nginx 404s it), and the dstack
// app_id/compose_hash are not on-chain. Serve the CONFIGURED enclave identity so the
// status surface stays populated. This is configured metadata, not a live attestation
// read (live attestation verification still requires the enclave directly).
export function buildStaticRuntimeInfo(version: string | null, networkOverride?: string | null) {
  const selected = getSelectedNetwork(networkOverride) as { nitro?: Record<string, unknown> };
  const nitro = selected.nitro || {};
  const appId = trimString(nitro.cvm_id) || null;
  return {
    runtime: {
      status: 'operational',
      mode: 'nitro-enclave',
      network: getSelectedNetworkKey(networkOverride),
      tee_attestation_available: true,
      origin: 'aws-nitro',
    },
    app_id: appId,
    cvm_name: trimString(nitro.cvm_name) || null,
    version: version || null,
    source: 'config',
    dstack: { available: false, reason: 'metadata_served_from_config', app_id: appId },
  };
}
