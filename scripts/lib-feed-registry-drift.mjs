import fs from 'node:fs/promises';
import path from 'node:path';

import {
  classifyFeedFreshness,
  decodeNeoStackItem,
  invokeNeoFunctionViaCurl,
  loadRuntimeConfigFromEnvFile,
  parseConfiguredFeedPairs,
} from './lib-feed-freshness.mjs';

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function parseOnchainFeedRecords(stackItem, nowMs = Date.now(), staleMinutes = 720) {
  const decoded = decodeNeoStackItem(stackItem);
  if (!Array.isArray(decoded)) return [];

  return decoded
    .filter((entry) => Array.isArray(entry) && entry.length >= 6)
    .map((entry) => {
      const [pair, roundId, price, timestamp, attestationHash, sourceSetId] = entry;
      return {
        pair: trimString(pair),
        round_id: String(roundId ?? '0'),
        price: String(price ?? '0'),
        timestamp: String(timestamp ?? '0'),
        attestation_hash: trimString(attestationHash),
        source_set_id: String(sourceSetId ?? '0'),
        ...classifyFeedFreshness(timestamp ?? '0', nowMs, staleMinutes, pair),
      };
    })
    .filter((entry) => entry.pair);
}

export function diffFeedRegistry(configuredPairs = [], onchainRecords = []) {
  const configured = [...new Set(configuredPairs.map((entry) => trimString(entry)).filter(Boolean))].sort();
  const onchainPairs = [...new Set(onchainRecords.map((entry) => trimString(entry?.pair)).filter(Boolean))].sort();
  const configuredSet = new Set(configured);
  const onchainSet = new Set(onchainPairs);

  return {
    configured_pairs: configured,
    onchain_pairs: onchainPairs,
    missing_onchain_pairs: configured.filter((pair) => !onchainSet.has(pair)),
    extra_onchain_pairs: onchainPairs.filter((pair) => !configuredSet.has(pair)),
  };
}

export async function buildFeedRegistryDriftReport({
  repoRoot,
  network,
  staleMinutes = 720,
}) {
  const networkConfig = JSON.parse(
    await fs.readFile(path.join(repoRoot, 'config', 'networks', `${network}.json`), 'utf8')
  );
  const runtimeConfig = await loadRuntimeConfigFromEnvFile(
    path.join(repoRoot, 'deploy', 'phala', `morpheus.${network}.env`)
  );
  const rpcUrl = trimString(networkConfig.neo_n3?.rpc_url || '');
  const datafeedHash = trimString(networkConfig.neo_n3?.contracts?.morpheus_datafeed || '');
  const configuredPairs = parseConfiguredFeedPairs(runtimeConfig);
  const result = invokeNeoFunctionViaCurl(rpcUrl, datafeedHash, 'getAllFeedRecords', []);
  const onchainRecords = parseOnchainFeedRecords(result.stack?.[0], Date.now(), staleMinutes);
  const drift = diffFeedRegistry(configuredPairs, onchainRecords);

  return {
    network,
    configured_pair_count: configuredPairs.length,
    onchain_pair_count: drift.onchain_pairs.length,
    missing_onchain_pairs: drift.missing_onchain_pairs,
    extra_onchain_pairs: drift.extra_onchain_pairs,
    extra_onchain_records: onchainRecords.filter((entry) => drift.extra_onchain_pairs.includes(entry.pair)),
    rows: onchainRecords,
  };
}
