import { json } from './platform/core.js';
import { getDerivedKeySummary } from './platform/dstack.js';
import {
  ensureOracleKeyMaterial,
  buildOracleResponse,
  handleOracleFeed,
  handleFeedsPrice,
  listFeedSymbols,
  handleVrf,
} from './oracle/index.js';
import {
  handleComputeExecute,
  handleComputeFunctions,
  handleComputeJobs,
} from './compute/index.js';
import { handleSignPayload, handleRelayTransaction, handleTxProxyInvoke } from './chain/index.js';
import {
  handleNeoDidProviders,
  handleNeoDidRuntime,
  handleNeoDidBind,
  handleNeoDidActionTicket,
  handleNeoDidRecoveryTicket,
  handleNeoDidZkLoginTicket,
} from './neodid/index.js';
import { handlePaymasterAuthorize } from './paymaster/index.js';
import { handleProvidersList, getProviderHealth } from './oracle/providers.js';

// ---------------------------------------------------------------------------
// Thin wrapper handlers for inline logic previously in worker.js
// ---------------------------------------------------------------------------

async function handleKeysDerived({ payload }) {
  const role =
    typeof payload.role === 'string' && payload.role.trim() ? payload.role.trim() : 'worker';
  return json(200, { derived: await getDerivedKeySummary(role) });
}

async function handleOraclePublicKey({ payload }) {
  const keyMaterial = await ensureOracleKeyMaterial(payload);
  return json(200, {
    algorithm: keyMaterial.algorithm,
    public_key: keyMaterial.publicKeyRaw,
    public_key_format: keyMaterial.key_format,
    key_source: keyMaterial.source,
    recommended_payload_encryption: keyMaterial.algorithm,
    supported_payload_encryption: [keyMaterial.algorithm],
  });
}

function handleFeedsCatalog() {
  return json(200, { pairs: listFeedSymbols() });
}

function handleFeedsPriceByPath({ path, url }) {
  return handleFeedsPrice(
    decodeURIComponent(path.split('/').pop() || 'NEO-USD'),
    Object.fromEntries(url.searchParams.entries())
  );
}

async function handleFeedsPriceByQuery({ url, payload }) {
  return handleFeedsPrice(url.searchParams.get('symbol') || payload.symbol || 'NEO-USD', {
    ...Object.fromEntries(url.searchParams.entries()),
    ...payload,
  });
}

function handleComputeJobsById({ path }) {
  return handleComputeJobs(path.split('/').pop() || null);
}

async function handleOracleQuery({ payload }) {
  return json(200, await buildOracleResponse(payload, 'query'));
}

async function handleOracleSmartFetch({ payload }) {
  return json(200, await buildOracleResponse(payload, 'smart-fetch'));
}

async function handleOracleHeartbeat() {
  const providers = getProviderHealth();
  return json(200, {
    status: 'ok',
    providers,
    timestamp: Math.floor(Date.now() / 1000),
  });
}

// ---------------------------------------------------------------------------
// Capability registry
//
// Each capability: { id, paths, actions?, featurePath, handler }
//   paths: [{ match } | { pattern }] — match is path.endsWith(), pattern is RegExp.test()
//   actions: payload.action values that also trigger this capability
//   featurePath: human-readable path for the health/features endpoint
//   handler: async ({ path, url, payload, request }) => Response
//
// Order matters: more specific patterns (regex) MUST precede general exact
// matches within the same domain so the resolver picks the right one.
// ---------------------------------------------------------------------------

const CAPABILITIES = [
  {
    id: 'keys_derived',
    paths: [{ match: '/keys/derived' }],
    featurePath: 'keys/derived',
    handler: handleKeysDerived,
  },
  {
    id: 'neodid_providers',
    paths: [{ match: '/neodid/providers' }],
    featurePath: 'neodid/providers',
    handler: () => handleNeoDidProviders(),
  },
  {
    id: 'neodid_runtime',
    paths: [{ match: '/neodid/runtime' }],
    featurePath: 'neodid/runtime',
    handler: async ({ payload }) => handleNeoDidRuntime(payload),
  },
  {
    id: 'neodid_bind',
    paths: [{ match: '/neodid/bind' }],
    featurePath: 'neodid/bind',
    handler: async ({ payload }) => handleNeoDidBind(payload),
  },
  {
    id: 'neodid_action_ticket',
    paths: [{ match: '/neodid/action-ticket' }],
    featurePath: 'neodid/action-ticket',
    handler: async ({ payload }) => handleNeoDidActionTicket(payload),
  },
  {
    id: 'neodid_recovery_ticket',
    paths: [{ match: '/neodid/recovery-ticket' }],
    featurePath: 'neodid/recovery-ticket',
    handler: async ({ payload }) => handleNeoDidRecoveryTicket(payload),
  },
  {
    id: 'neodid_zklogin_ticket',
    paths: [{ match: '/neodid/zklogin-ticket' }],
    featurePath: 'neodid/zklogin-ticket',
    handler: async ({ payload }) => handleNeoDidZkLoginTicket(payload),
  },
  {
    id: 'providers',
    paths: [{ match: '/providers' }],
    featurePath: 'providers',
    handler: async () => handleProvidersList(),
  },
  {
    id: 'oracle_public_key',
    paths: [{ match: '/oracle/public-key' }],
    featurePath: 'oracle/public-key',
    handler: handleOraclePublicKey,
  },
  {
    id: 'oracle_heartbeat',
    paths: [{ match: '/oracle/heartbeat' }],
    featurePath: 'oracle/heartbeat',
    handler: () => handleOracleHeartbeat(),
  },
  {
    id: 'oracle_query',
    paths: [{ match: '/oracle/query' }],
    featurePath: 'oracle/query',
    handler: handleOracleQuery,
  },
  {
    id: 'oracle_smart_fetch',
    paths: [{ match: '/oracle/smart-fetch' }],
    featurePath: 'oracle/smart-fetch',
    handler: handleOracleSmartFetch,
  },
  {
    id: 'feeds_catalog',
    paths: [{ match: '/feeds/catalog' }],
    featurePath: 'feeds/catalog',
    handler: handleFeedsCatalog,
  },
  {
    id: 'feeds_price_symbol',
    paths: [{ pattern: /\/feeds\/price\/.+/ }],
    featurePath: 'feeds/price/:symbol',
    handler: handleFeedsPriceByPath,
  },
  {
    id: 'feeds_price',
    paths: [{ match: '/feeds/price' }],
    featurePath: 'feeds/price',
    handler: handleFeedsPriceByQuery,
  },
  {
    id: 'vrf_random',
    paths: [{ match: '/vrf/random' }],
    featurePath: 'vrf/random',
    handler: async ({ payload }) => handleVrf(payload),
  },
  {
    id: 'oracle_feed',
    paths: [{ match: '/oracle/feed' }],
    actions: ['oracle_feed'],
    featurePath: 'oracle/feed',
    handler: async ({ payload }) => handleOracleFeed(payload),
  },
  {
    id: 'txproxy_invoke',
    paths: [{ match: '/txproxy/invoke' }],
    featurePath: 'txproxy/invoke',
    handler: async ({ payload }) => handleTxProxyInvoke(payload),
  },
  {
    id: 'sign_payload',
    paths: [{ match: '/sign/payload' }],
    actions: ['sign_payload'],
    featurePath: 'sign/payload',
    handler: async ({ payload }) => handleSignPayload(payload),
  },
  {
    id: 'relay_transaction',
    paths: [{ match: '/relay/transaction' }],
    actions: ['relay_transaction'],
    featurePath: 'relay/transaction',
    handler: async ({ payload }) => handleRelayTransaction(payload),
  },
  {
    id: 'paymaster_authorize',
    paths: [{ match: '/paymaster/authorize' }],
    featurePath: 'paymaster/authorize',
    handler: async ({ payload }) => handlePaymasterAuthorize(payload),
  },
  {
    id: 'compute_functions',
    paths: [{ match: '/compute/functions' }],
    featurePath: 'compute/functions',
    handler: () => handleComputeFunctions(),
  },
  {
    id: 'compute_execute',
    paths: [{ match: '/compute/execute' }],
    featurePath: 'compute/execute',
    handler: async ({ payload }) => handleComputeExecute(payload),
  },
  {
    id: 'compute_jobs_id',
    paths: [{ pattern: /\/compute\/jobs\/.+/ }],
    featurePath: 'compute/jobs/:id',
    handler: handleComputeJobsById,
  },
  {
    id: 'compute_jobs',
    paths: [{ match: '/compute/jobs' }],
    featurePath: 'compute/jobs',
    handler: () => handleComputeJobs(),
  },
];

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

/**
 * Resolve a capability by path first, then by payload.action fallback.
 * Returns { capability, matchedBy } or null.
 */
export function resolveCapability(path, payload = {}) {
  // Phase 1: path-based matching (first match wins)
  for (const cap of CAPABILITIES) {
    for (const route of cap.paths) {
      if (route.pattern && route.pattern.test(path)) {
        return { capability: cap, matchedBy: 'path' };
      }
      if (route.match && path.endsWith(route.match)) {
        return { capability: cap, matchedBy: 'path' };
      }
    }
  }

  // Phase 2: action-based fallback
  const action = payload.action;
  if (action) {
    for (const cap of CAPABILITIES) {
      if (cap.actions && cap.actions.includes(action)) {
        return { capability: cap, matchedBy: 'action' };
      }
    }
  }

  return null;
}

/**
 * Resolve a route name for rate-limiting / overload-guard purposes.
 * Returns the capability id string or '' if not found.
 */
export function resolveRouteName(path, payload = {}) {
  const result = resolveCapability(path, payload);
  return result ? result.capability.id : '';
}

/**
 * Return the list of feature paths for the /health endpoint.
 */
export function listCapabilityFeatures() {
  return CAPABILITIES.map((cap) => cap.featurePath);
}
