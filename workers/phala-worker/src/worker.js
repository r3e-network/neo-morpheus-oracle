import { json } from './platform/core.js';
import { requireAuth } from './platform/auth.js';
import { buildDstackAttestation, getDerivedKeySummary, getDstackInfo } from './platform/dstack.js';
import {
  buildOracleResponse,
  ensureOracleKeyMaterial,
  handleFeedsPrice,
  handleOracleFeed,
  handleVrf,
  listFeedSymbols,
} from './oracle/index.js';
import { handleProvidersList } from './oracle/providers.js';
import {
  handleComputeExecute,
  handleComputeFunctions,
  handleComputeJobs,
} from './compute/index.js';
import { handleRelayTransaction, handleSignPayload, handleTxProxyInvoke } from './chain/index.js';
import { handlePaymasterAuthorize } from './paymaster/index.js';
import {
  handleNeoDidActionTicket,
  handleNeoDidBind,
  handleNeoDidProviders,
  handleNeoDidRecoveryTicket,
  handleNeoDidRuntime,
  handleNeoDidZkLoginTicket,
} from './neodid/index.js';
import { acquireOverloadSlot, snapshotOverloadState } from './platform/overload-guard.js';
import { applyRequestGuards, persistGuardResult } from './platform/request-guards.js';

function resolveActiveTargetChains() {
  const raw = String(process.env.MORPHEUS_ACTIVE_CHAINS || '').trim();
  if (!raw) return ['neo_n3'];
  const chains = raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry === 'neo_n3' || entry === 'neo_x');
  return chains.length > 0 ? chains : ['neo_n3'];
}

function handleHealth() {
  const targetChains = resolveActiveTargetChains();
  return json(200, {
    status: 'ok',
    runtime: 'phala-worker',
    oracle: {
      privacy_oracle: true,
      target_chains: targetChains,
      pricefeed_chain: 'neo_n3',
      compute_merged_into_oracle: true,
    },
    features: [
      'providers',
      'info',
      'attestation',
      'keys/derived',
      'oracle/public-key',
      'oracle/query',
      'oracle/smart-fetch',
      'oracle/feed',
      'feeds/price/:symbol',
      'feeds/catalog',
      'vrf/random',
      'txproxy/invoke',
      'sign/payload',
      'relay/transaction',
      'paymaster/authorize',
      'compute/functions',
      'compute/execute',
      'neodid/providers',
      'neodid/runtime',
      'neodid/bind',
      'neodid/action-ticket',
      'neodid/recovery-ticket',
      'neodid/zklogin-ticket',
    ],
  });
}

export default async function handler(request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, '');
  const payload =
    request.method === 'GET'
      ? Object.fromEntries(url.searchParams.entries())
      : await request.json().catch(() => ({}));

  try {
    if (path.endsWith('/health')) return handleHealth();
    if (path.endsWith('/info')) {
      return json(200, {
        dstack: await getDstackInfo({ required: false }),
        overload: snapshotOverloadState(),
      });
    }
    if (path.endsWith('/attestation')) {
      const reportData =
        payload.report_data ||
        payload.reportData ||
        payload.output_hash ||
        payload.message ||
        'morpheus-attestation';
      return json(200, {
        attestation: await buildDstackAttestation(reportData, { required: false }),
      });
    }

    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const guards = await applyRequestGuards({ request, path, payload });
    if (!guards.ok) return guards.response;
    const overload = acquireOverloadSlot(path);
    if (!overload.ok) return overload.response;

    let response;
    try {
      if (path.endsWith('/keys/derived')) {
        const role =
          typeof payload.role === 'string' && payload.role.trim() ? payload.role.trim() : 'worker';
        response = json(200, { derived: await getDerivedKeySummary(role) });
        await persistGuardResult(guards, response);
        return response;
      }

      if (path.endsWith('/neodid/providers')) response = handleNeoDidProviders();
      else if (path.endsWith('/neodid/runtime')) response = await handleNeoDidRuntime(payload);
      else if (path.endsWith('/neodid/bind')) response = await handleNeoDidBind(payload);
      else if (path.endsWith('/neodid/action-ticket')) response = await handleNeoDidActionTicket(payload);
      else if (path.endsWith('/neodid/recovery-ticket')) response = await handleNeoDidRecoveryTicket(payload);
      else if (path.endsWith('/neodid/zklogin-ticket')) response = await handleNeoDidZkLoginTicket(payload);

      else if (path.endsWith('/providers')) response = await handleProvidersList();

      else if (path.endsWith('/oracle/public-key')) {
        const keyMaterial = await ensureOracleKeyMaterial(payload);
        response = json(200, {
          algorithm: keyMaterial.algorithm,
          public_key: keyMaterial.publicKeyRaw,
          public_key_format: keyMaterial.key_format,
          key_source: keyMaterial.source,
          recommended_payload_encryption: keyMaterial.algorithm,
          supported_payload_encryption: [keyMaterial.algorithm],
        });
      }

      else if (path.endsWith('/oracle/query')) response = json(200, await buildOracleResponse(payload, 'query'));

      else if (path.endsWith('/oracle/smart-fetch')) response = json(200, await buildOracleResponse(payload, 'smart-fetch'));

      else if (path.endsWith('/feeds/catalog')) {
        response = json(200, { pairs: listFeedSymbols() });
      } else if (/\/feeds\/price\/.+/.test(path)) {
        response = await handleFeedsPrice(
          decodeURIComponent(path.split('/').pop() || 'NEO-USD'),
          Object.fromEntries(url.searchParams.entries())
        );
      } else if (path.endsWith('/feeds/price')) {
        response = await handleFeedsPrice(url.searchParams.get('symbol') || payload.symbol || 'NEO-USD', {
          ...Object.fromEntries(url.searchParams.entries()),
          ...payload,
        });
      }

      else if (path.endsWith('/vrf/random')) response = await handleVrf(payload);
      else if (path.endsWith('/oracle/feed') || payload.action === 'oracle_feed')
        response = await handleOracleFeed(payload);
      else if (path.endsWith('/txproxy/invoke')) response = await handleTxProxyInvoke(payload);
      else if (path.endsWith('/sign/payload') || payload.action === 'sign_payload')
        response = await handleSignPayload(payload);
      else if (path.endsWith('/relay/transaction') || payload.action === 'relay_transaction')
        response = await handleRelayTransaction(payload);
      else if (path.endsWith('/paymaster/authorize')) response = await handlePaymasterAuthorize(payload);
      else if (path.endsWith('/compute/functions')) response = handleComputeFunctions();
      else if (path.endsWith('/compute/execute')) response = await handleComputeExecute(payload);
      else if (/\/compute\/jobs\/.+/.test(path)) response = handleComputeJobs(path.split('/').pop() || null);
      else if (path.endsWith('/compute/jobs')) response = handleComputeJobs();
      else response = json(404, { error: 'not found', path });

      await persistGuardResult(guards, response);
      return response;
    } finally {
      overload.release();
    }
  } catch (error) {
    return json(400, { error: error instanceof Error ? error.message : String(error) });
  }
}
