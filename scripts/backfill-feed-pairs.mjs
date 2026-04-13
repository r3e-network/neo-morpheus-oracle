#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { parseConfiguredFeedPairs, parseDotEnv } from './lib-feed-freshness.mjs';

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseArgs(argv = process.argv.slice(2)) {
  const parsed = {
    network: 'mainnet',
    symbols: [],
    batchSize: 5,
    retries: 3,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === '--network') {
      parsed.network = trimString(argv[index + 1] || parsed.network).toLowerCase();
      index += 1;
    } else if (current === '--symbols') {
      parsed.symbols = String(argv[index + 1] || '')
        .split(',')
        .map((entry) => trimString(entry))
        .filter(Boolean);
      index += 1;
    } else if (current === '--batch-size') {
      parsed.batchSize = Number(argv[index + 1] || parsed.batchSize);
      index += 1;
    } else if (current === '--retries') {
      parsed.retries = Number(argv[index + 1] || parsed.retries);
      index += 1;
    }
  }
  return parsed;
}

function chunk(values, size) {
  const out = [];
  for (let index = 0; index < values.length; index += size) {
    out.push(values.slice(index, index + size));
  }
  return out;
}

async function main() {
  const args = parseArgs();
  const network = args.network === 'testnet' ? 'testnet' : 'mainnet';
  const envPath = path.resolve('deploy', 'phala', `morpheus.${network}.env`);
  const env = parseDotEnv(await fs.readFile(envPath, 'utf8'));
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
  }

  const runtimeConfig = JSON.parse(trimString(env.MORPHEUS_RUNTIME_CONFIG_JSON || '{}'));
  const configuredPairs = parseConfiguredFeedPairs(runtimeConfig);
  const targetPairs =
    args.symbols.length > 0
      ? args.symbols.map((entry) => (entry.includes(':') ? entry : `TWELVEDATA:${entry}`))
      : configuredPairs;

  const { handleOracleFeed } = await import('../workers/phala-worker/src/oracle/feeds.js');

  const results = [];
  for (const symbols of chunk(targetPairs, Math.max(Number(args.batchSize) || 5, 1))) {
    let attempts = 0;
    while (attempts < Math.max(Number(args.retries) || 3, 1)) {
      attempts += 1;
      try {
        const response = await handleOracleFeed({
          network,
          target_chain: 'neo_n3',
          provider: 'twelvedata',
          symbols,
          wait: true,
        });
        const body = JSON.parse(await response.text());
        results.push({
          symbols,
          attempts,
          batch_submitted: body.batch_submitted,
          batch_count: body.batch_count,
          tx_hash: body.batch_tx?.tx_hash || null,
          submitted: (body.sync_results || [])
            .filter((entry) => entry.relay_status === 'submitted')
            .map((entry) => entry.storage_pair),
          skipped: (body.sync_results || [])
            .filter((entry) => entry.relay_status === 'skipped')
            .map((entry) => ({
              pair: entry.storage_pair,
              reason: entry.skip_reason,
              change_bps: entry.change_bps,
            })),
          errors: body.errors || [],
        });
        break;
      } catch (error) {
        if (attempts >= Math.max(Number(args.retries) || 3, 1)) {
          results.push({
            symbols,
            attempts,
            error: error instanceof Error ? error.message : String(error),
          });
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  console.log(JSON.stringify({ network, total_symbols: targetPairs.length, results }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
