import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
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

export function classifyFeedFreshness(timestampSeconds, nowMs = Date.now(), staleMinutes = 180) {
  const tsMs = Number(timestampSeconds) * 1000;
  if (!Number.isFinite(tsMs) || tsMs <= 0) {
    return {
      iso: null,
      age_min: null,
      stale: true,
    };
  }
  const ageMin = Math.round((nowMs - tsMs) / 60000);
  return {
    iso: new Date(tsMs).toISOString(),
    age_min: ageMin,
    stale: ageMin > staleMinutes,
  };
}

export async function buildFeedFreshnessReport({
  repoRoot,
  network,
  staleMinutes = 180,
}) {
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
      ...classifyFeedFreshness(timestamp || '0', Date.now(), staleMinutes),
    });
  }

  const stalePairs = rows.filter((entry) => entry.stale);
  return {
    network,
    total: rows.length,
    fresh: rows.length - stalePairs.length,
    stale: stalePairs.length,
    stale_minutes: staleMinutes,
    stale_pairs: stalePairs,
    rows,
  };
}
