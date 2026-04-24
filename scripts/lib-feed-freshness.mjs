import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import {
  fetchPriceQuote,
  decimalToIntegerString,
} from '../workers/phala-worker/src/oracle/index.js';

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const CONTINUOUS_FEED_PAIRS = new Set([
  'TWELVEDATA:NEO-USD',
  'TWELVEDATA:GAS-USD',
  'TWELVEDATA:FLM-USD',
  'TWELVEDATA:BTC-USD',
  'TWELVEDATA:ETH-USD',
  'TWELVEDATA:SOL-USD',
  'TWELVEDATA:TRX-USD',
  'TWELVEDATA:PAXG-USD',
  'TWELVEDATA:USDT-USD',
  'TWELVEDATA:USDC-USD',
  'TWELVEDATA:BNB-USD',
  'TWELVEDATA:XRP-USD',
  'TWELVEDATA:DOGE-USD',
]);

export function classifyFeedCadence(pair) {
  const normalized = normalizeFeedStoragePair(pair);
  if (!normalized) return 'continuous';
  if (CONTINUOUS_FEED_PAIRS.has(normalized)) return 'continuous';
  return 'market_hours';
}

function inferProviderId(pair) {
  const normalized = normalizeFeedStoragePair(pair);
  if (normalized.startsWith('TWELVEDATA:')) return 'twelvedata';
  if (normalized.startsWith('BINANCE-SPOT:')) return 'binance-spot';
  if (normalized.startsWith('COINBASE-SPOT:')) return 'coinbase-spot';
  return 'twelvedata';
}

function computeChangeBps(previousUnits, nextUnits) {
  const previous = Number(previousUnits);
  const next = Number(nextUnits);
  if (!Number.isFinite(previous) || !Number.isFinite(next) || previous <= 0)
    return Number.POSITIVE_INFINITY;
  return Math.abs((next - previous) / previous) * 10_000;
}

export function parseDotEnv(raw) {
  const out = {};
  for (const line of String(raw || '').split(/\r?\n/)) {
    const trimmed = trimString(line);
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const separatorIndex = trimmed.indexOf('=');
    const key = trimString(trimmed.slice(0, separatorIndex));
    let value = trimmed.slice(separatorIndex + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export async function loadRuntimeConfigFromEnvFile(filePath) {
  const env = parseDotEnv(await fs.readFile(filePath, 'utf8'));
  const runtimeConfigRaw = trimString(env.MORPHEUS_RUNTIME_CONFIG_JSON || '');
  if (!runtimeConfigRaw) {
    throw new Error(`MORPHEUS_RUNTIME_CONFIG_JSON is missing from ${filePath}`);
  }
  return JSON.parse(runtimeConfigRaw);
}

export function normalizeFeedStoragePair(value) {
  const normalized = trimString(value).toUpperCase();
  if (!normalized) return '';
  return normalized.includes(':') ? normalized : `TWELVEDATA:${normalized}`;
}

export function parseConfiguredFeedPairs(runtimeConfig = {}) {
  return String(runtimeConfig.MORPHEUS_FEED_SYMBOLS || '')
    .split(',')
    .map((entry) => normalizeFeedStoragePair(entry))
    .filter(Boolean);
}

export function decodeNeoStackItem(item) {
  if (!item || typeof item !== 'object') return null;
  const type = trimString(item.type).toLowerCase();
  switch (type) {
    case 'array':
    case 'struct':
      return Array.isArray(item.value) ? item.value.map((entry) => decodeNeoStackItem(entry)) : [];
    case 'integer':
      return String(item.value ?? '0');
    case 'boolean':
      return Boolean(item.value);
    case 'string':
    case 'hash160':
    case 'hash256':
      return String(item.value ?? '');
    case 'bytestring':
    case 'bytearray': {
      const bytes = Buffer.from(String(item.value || ''), 'base64');
      const text = bytes.toString('utf8');
      return /^[\x09\x0a\x0d\x20-\x7e]*$/.test(text) ? text : `0x${bytes.toString('hex')}`;
    }
    default:
      return item.value ?? null;
  }
}

export function invokeNeoFunctionViaCurl(rpcUrl, contractHash, operation, params = []) {
  const payload = {
    jsonrpc: '2.0',
    id: 1,
    method: 'invokefunction',
    params: [contractHash, operation, params],
  };
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = JSON.parse(
        execFileSync(
          'curl',
          ['-fsS', rpcUrl, '-H', 'Content-Type: application/json', '-d', JSON.stringify(payload)],
          { encoding: 'utf8' }
        )
      );
      if (response.error) {
        throw new Error(`rpc ${operation} failed: ${JSON.stringify(response.error)}`);
      }
      return response.result;
    } catch (error) {
      lastError = error;
      if (attempt >= 3) break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function classifyFeedFreshness(
  timestampSeconds,
  nowMs = Date.now(),
  staleMinutes = 180,
  pair = ''
) {
  const tsMs = Number(timestampSeconds) * 1000;
  const cadence = classifyFeedCadence(pair);
  const thresholdMinutes = cadence === 'continuous' ? staleMinutes : Math.max(staleMinutes, 1440);
  if (!Number.isFinite(tsMs) || tsMs <= 0) {
    return {
      iso: null,
      age_min: null,
      cadence,
      threshold_min: thresholdMinutes,
      stale: true,
    };
  }
  const ageMin = Math.round((nowMs - tsMs) / 60000);
  return {
    iso: new Date(tsMs).toISOString(),
    age_min: ageMin,
    cadence,
    threshold_min: thresholdMinutes,
    stale: ageMin > thresholdMinutes,
  };
}

export async function buildFeedFreshnessReport({ repoRoot, network, staleMinutes = 180 }) {
  const networkConfig = JSON.parse(
    await fs.readFile(path.join(repoRoot, 'config', 'networks', `${network}.json`), 'utf8')
  );
  const runtimeConfig = await loadRuntimeConfigFromEnvFile(
    path.join(repoRoot, 'deploy', 'phala', `morpheus.${network}.env`)
  );
  const rpcUrl = trimString(networkConfig.neo_n3?.rpc_url || '');
  const datafeedHash = trimString(networkConfig.neo_n3?.contracts?.morpheus_datafeed || '');
  const pairs = parseConfiguredFeedPairs(runtimeConfig);
  const rows = [];

  if (
    trimString(runtimeConfig.TWELVEDATA_API_KEY || '') &&
    !trimString(process.env.TWELVEDATA_API_KEY || '')
  ) {
    process.env.TWELVEDATA_API_KEY = trimString(runtimeConfig.TWELVEDATA_API_KEY);
  }

  for (const pair of pairs) {
    const response = invokeNeoFunctionViaCurl(rpcUrl, datafeedHash, 'getLatest', [
      { type: 'String', value: pair },
    ]);
    const decoded = decodeNeoStackItem(response.stack?.[0]) || [];
    const [, roundId, price, timestamp, attestationHash, sourceSetId] = decoded;
    rows.push({
      pair: decoded[0] || pair,
      round_id: roundId || '0',
      price: price || '0',
      timestamp: timestamp || '0',
      attestation_hash: attestationHash || '',
      source_set_id: sourceSetId || '0',
      ...classifyFeedFreshness(timestamp || '0', Date.now(), staleMinutes, decoded[0] || pair),
    });
  }

  const stalePairs = [];
  for (const row of rows) {
    if (!row.stale) continue;
    let staleReason = 'age_exceeded_threshold';
    let actionable = true;
    let providerQuote = null;
    let providerError = null;

    try {
      providerQuote = await fetchPriceQuote(row.pair, {
        network,
        provider: inferProviderId(row.pair),
      });
      const providerUnits = decimalToIntegerString(providerQuote.price, providerQuote.decimals);
      const changeBps = computeChangeBps(row.price, providerUnits);
      row.provider_quote = {
        price: providerQuote.price,
        timestamp: providerQuote.timestamp,
        price_units: providerUnits,
        change_bps: changeBps,
      };
      if (changeBps < 10) {
        staleReason = 'below_threshold';
        actionable = false;
      } else if (providerQuote.timestamp) {
        const providerAge = classifyFeedFreshness(
          Math.floor(new Date(providerQuote.timestamp).getTime() / 1000),
          Date.now(),
          staleMinutes,
          row.pair
        );
        row.provider_quote.age_min = providerAge.age_min;
        if (providerAge.stale) {
          staleReason = 'upstream_source_stale';
          actionable = false;
        }
      }
    } catch (error) {
      providerError = error instanceof Error ? error.message : String(error);
      row.provider_error = providerError;
    }

    row.stale_reason = staleReason;
    row.actionable = actionable;
    stalePairs.push(row);
  }
  return {
    network,
    total: rows.length,
    fresh: rows.length - stalePairs.length,
    stale: stalePairs.length,
    actionable_stale: stalePairs.filter((entry) => entry.actionable).length,
    benign_stale: stalePairs.filter((entry) => !entry.actionable).length,
    stale_minutes: staleMinutes,
    stale_pairs: stalePairs,
    rows,
  };
}
