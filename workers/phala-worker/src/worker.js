import { json, requestLog, sanitizeErrorMessage } from './platform/core.js';
import { requireAuth } from './platform/auth.js';
import { buildDstackAttestation, getDstackInfo } from './platform/dstack.js';
import { acquireOverloadSlot, snapshotOverloadState } from './platform/overload-guard.js';
import { applyRequestGuards, persistGuardResult } from './platform/request-guards.js';
import { resolveCapability, listCapabilityFeatures } from './capabilities.js';

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
    features: listCapabilityFeatures(),
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

    try {
      const resolved = resolveCapability(path, payload);
      let response;
      if (resolved) {
        const start = Date.now();
        requestLog('info', 'request', { capability: resolved.capability.id, method: request.method, path });
        response = await resolved.capability.handler({ path, url, payload, request });
        requestLog('info', 'response', {
          capability: resolved.capability.id,
          status: response.status,
          latency_ms: Date.now() - start,
        });
      } else {
        response = json(404, { error: 'not found', path });
      }
      await persistGuardResult(guards, response);
      return response;
    } finally {
      overload.release();
    }
  } catch (error) {
    return json(400, { error: sanitizeErrorMessage(error) });
  }
}
