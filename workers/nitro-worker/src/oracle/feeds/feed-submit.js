import { trimString } from '../../platform/core.js';
import { relayNeoN3Invocation } from '../../chain/index.js';
import { decimalToIntegerString } from './decimal.js';
import { clampFeedTimestampSec } from './shared.js';
import {
  resolveFeedSubmissionWait,
  resolveFeedSubmissionWaitTimeoutMs,
} from './sync-policy.js';

// Resolve the on-chain submission timestamp for a single-feed updateFeed call.
// Prefer an already-clamped value (computed in the batch path against the
// previous on-chain timestamp); otherwise clamp the quote's own timestamp so a
// standalone caller is still protected from anchoring a future-dated value that
// would permanently stall the strictly-monotonic MorpheusDataFeed (B9).
function resolveSubmitTimestampSec(quote, explicitTimestampSec) {
  if (explicitTimestampSec !== undefined && explicitTimestampSec !== null) {
    const explicit = Number(explicitTimestampSec);
    if (Number.isFinite(explicit)) return Math.floor(explicit);
  }
  const parsed = Date.parse(quote?.timestamp);
  const nowSec = Math.floor(Date.now() / 1000);
  const upstreamSec = Number.isFinite(parsed) ? Math.floor(parsed / 1000) : nowSec;
  return clampFeedTimestampSec({ upstreamSec, prevTs: 0, nowSec });
}

export function buildNeoN3RelaySigningPayload(payload = {}) {
  const signingKey = trimString(payload.private_key || payload.signing_key);
  const wif = trimString(payload.wif);
  return {
    ...(signingKey ? { private_key: signingKey } : {}),
    ...(wif ? { wif } : {}),
  };
}

export async function submitQuoteToN3(
  dataFeedHash,
  neoContext,
  payload,
  quote,
  storagePair,
  roundId,
  sourceSetId,
  timestampSec
) {
  const invokeResult = await relayNeoN3Invocation({
    request_id: trimString(payload.request_id) || `pricefeed:${storagePair}:${Date.now()}`,
    network: payload.network,
    contract_hash: dataFeedHash,
    method: 'updateFeed',
    params: [
      { type: 'String', value: storagePair },
      { type: 'Integer', value: roundId },
      { type: 'Integer', value: decimalToIntegerString(quote.price, quote.decimals) },
      // Provider observation timestamp, clamped against the strictly-monotonic
      // MorpheusDataFeed (B9) so a future-dated value cannot stall the feed.
      {
        type: 'Integer',
        value: String(resolveSubmitTimestampSec(quote, timestampSec)),
      },
      { type: 'ByteArray', value: quote.attestation_hash },
      { type: 'Integer', value: String(sourceSetId) },
    ],
    wait: resolveFeedSubmissionWait(payload),
    timeout_ms: resolveFeedSubmissionWaitTimeoutMs(payload),
    rpc_url: neoContext.rpcUrl,
    network_magic: neoContext.networkMagic,
    ...buildNeoN3RelaySigningPayload(payload),
  });
  if (invokeResult.status >= 400) {
    throw new Error(invokeResult.body?.error || 'Neo N3 feed submit failed');
  }
  return invokeResult.body;
}

async function submitQuotesToN3(dataFeedHash, neoContext, payload, updates) {
  const invokeResult = await relayNeoN3Invocation({
    request_id: trimString(payload.request_id) || `pricefeed:batch:${Date.now()}`,
    network: payload.network,
    contract_hash: dataFeedHash,
    method: 'updateFeeds',
    params: [
      {
        type: 'Array',
        value: updates.map((entry) => ({ type: 'String', value: entry.storagePair })),
      },
      { type: 'Array', value: updates.map((entry) => ({ type: 'Integer', value: entry.roundId })) },
      {
        type: 'Array',
        value: updates.map((entry) => ({
          type: 'Integer',
          value: decimalToIntegerString(entry.quote.price, entry.quote.decimals),
        })),
      },
      {
        type: 'Array',
        value: updates.map((entry) => ({ type: 'Integer', value: String(entry.timestampSec) })),
      },
      {
        type: 'Array',
        value: updates.map((entry) => ({ type: 'ByteArray', value: entry.quote.attestation_hash })),
      },
      {
        type: 'Array',
        value: updates.map((entry) => ({ type: 'Integer', value: String(entry.sourceSetId) })),
      },
    ],
    wait: resolveFeedSubmissionWait(payload),
    timeout_ms: resolveFeedSubmissionWaitTimeoutMs(payload),
    rpc_url: neoContext.rpcUrl,
    network_magic: neoContext.networkMagic,
    ...buildNeoN3RelaySigningPayload(payload),
  });
  if (invokeResult.status >= 400) {
    throw new Error(invokeResult.body?.error || 'Neo N3 batch feed submit failed');
  }
  return invokeResult.body;
}

function toNeoN3BatchUpdateFailureMessage(error) {
  return trimString(error instanceof Error ? error.message : String(error)).toLowerCase();
}

export function isMissingNeoN3BatchUpdateMethod(error) {
  const message = toNeoN3BatchUpdateFailureMessage(error);
  if (!message) return false;
  return (
    message.includes('method not found: updatefeeds/6') ||
    /method\s+["']?updatefeeds["']?\s+with\s+6\s+parameter\(s\)\s+doesn['’]?t\s+exist/.test(
      message
    ) ||
    /method\s+["']?updatefeeds["']?.*doesn['’]?t\s+exist/.test(message)
  );
}

function isUnauthorizedNeoN3BatchUpdate(error) {
  const message = toNeoN3BatchUpdateFailureMessage(error);
  if (!message) return false;
  return (
    message.includes('abortmsg is executed. reason: unauthorized') || message === 'unauthorized'
  );
}

export function getRecoverableNeoN3BatchUpdateFailureReason(error) {
  if (isMissingNeoN3BatchUpdateMethod(error)) return 'neo_n3_updatefeeds_missing';
  if (isUnauthorizedNeoN3BatchUpdate(error)) return 'neo_n3_updatefeeds_unauthorized';
  return null;
}

export function isRecoverableNeoN3BatchUpdateFailure(error) {
  return Boolean(getRecoverableNeoN3BatchUpdateFailureReason(error));
}

export async function submitQuotesToN3WithFallback(dataFeedHash, neoContext, payload, updates) {
  try {
    return await submitQuotesToN3(dataFeedHash, neoContext, payload, updates);
  } catch (error) {
    const fallbackReason = getRecoverableNeoN3BatchUpdateFailureReason(error);
    if (!fallbackReason) {
      throw error;
    }

    const txs = [];
    for (const entry of updates) {
      const tx = await submitQuoteToN3(
        dataFeedHash,
        neoContext,
        payload,
        entry.quote,
        entry.storagePair,
        entry.roundId,
        entry.sourceSetId,
        entry.timestampSec
      );
      txs.push({
        storage_pair: entry.storagePair,
        tx,
      });
    }

    return {
      mode: 'single_fallback',
      reason: fallbackReason,
      txs,
    };
  }
}
