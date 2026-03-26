#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wallet } from '@cityofzion/neon-js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const oracleRoot = path.resolve(moduleDir, '..');
const workspaceRoot = path.resolve(oracleRoot, '..');
const miniappsRoot = path.resolve(workspaceRoot, 'neo-miniapps-platform');
const aaRoot = path.resolve(workspaceRoot, 'neo-abstract-account');

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function dequoteEnvValue(raw) {
  let value = trimString(raw);
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return value;
}

function parseDotEnv(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    const out = {};
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const index = trimmed.indexOf('=');
      out[trimmed.slice(0, index)] = dequoteEnvValue(trimmed.slice(index + 1));
    }
    return out;
  } catch {
    return {};
  }
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resolveRuntimeUrl({ network, morpheusEnv, morpheusLocalEnv }) {
  if (network === 'mainnet') {
    if (trimString(morpheusEnv.MORPHEUS_MAINNET_RUNTIME_URL)) {
      return trimString(morpheusEnv.MORPHEUS_MAINNET_RUNTIME_URL);
    }
  } else if (trimString(morpheusEnv.MORPHEUS_TESTNET_RUNTIME_URL)) {
    return trimString(morpheusEnv.MORPHEUS_TESTNET_RUNTIME_URL);
  }

  if (trimString(morpheusEnv.MORPHEUS_RUNTIME_URL)) {
    return trimString(morpheusEnv.MORPHEUS_RUNTIME_URL);
  }

  const customDomainKey =
    network === 'mainnet'
      ? 'MORPHEUS_MAINNET_CUSTOM_DOMAIN'
      : 'MORPHEUS_TESTNET_CUSTOM_DOMAIN';
  const customDomain = trimString(morpheusLocalEnv[customDomainKey]);
  if (customDomain) {
    return /^https?:\/\//i.test(customDomain) ? customDomain : `https://${customDomain}`;
  }

  return trimString(morpheusEnv.PHALA_API_URL);
}

function resolveRuntimeToken(morpheusEnv) {
  return (
    trimString(morpheusEnv.MORPHEUS_RUNTIME_TOKEN) ||
    trimString(morpheusEnv.PHALA_API_TOKEN) ||
    trimString(morpheusEnv.PHALA_SHARED_SECRET) ||
    ''
  );
}

function derivePrivateKeyFromWif(wif) {
  const normalized = trimString(wif);
  if (!normalized) return '';
  try {
    const account = new wallet.Account(normalized);
    return account.privateKey || '';
  } catch {
    return '';
  }
}

function resolveActorWif(key, miniappsEnv) {
  return trimString(miniappsEnv[key] || '');
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const normalized = trimString(value);
    if (normalized) return normalized;
  }
  return '';
}

function deriveWifFromPrivateKey(privateKey) {
  const normalized = trimString(privateKey);
  if (!normalized) return '';
  try {
    const account = new wallet.Account(normalized);
    return account.WIF || '';
  } catch {
    return '';
  }
}

function resolveCandidateValue(morpheusEnv, candidate) {
  const normalized = trimString(candidate);
  if (!normalized) return '';
  return Object.prototype.hasOwnProperty.call(morpheusEnv, normalized)
    ? trimString(morpheusEnv[normalized])
    : normalized;
}

function resolveNetworkSignerMaterial({ network, morpheusEnv, wifKeys, privateKeyKeys }) {
  const privateKey = firstNonEmpty(
    ...privateKeyKeys.map((candidate) => resolveCandidateValue(morpheusEnv, candidate))
  );
  const wif = firstNonEmpty(
    ...wifKeys.map((candidate) => resolveCandidateValue(morpheusEnv, candidate)),
    deriveWifFromPrivateKey(privateKey)
  );
  return {
    wif,
    private_key: firstNonEmpty(privateKey, derivePrivateKeyFromWif(wif)),
  };
}

function main() {
  const network = trimString(process.argv[2] || process.env.MORPHEUS_NETWORK || 'testnet') === 'mainnet'
    ? 'mainnet'
    : 'testnet';

  const miniappsEnvFile = process.env.MINIAPP_ENV_FILE || path.join(miniappsRoot, '.env');
  const morpheusEnvFile = process.env.MORPHEUS_ENV_FILE || path.join(oracleRoot, '.env');
  const morpheusEnvLocalFile =
    process.env.MORPHEUS_ENV_LOCAL_FILE || path.join(oracleRoot, '.env.local');

  const miniappsEnv = parseDotEnv(miniappsEnvFile);
  const morpheusEnv = parseDotEnv(morpheusEnvFile);
  const morpheusLocalEnv = parseDotEnv(morpheusEnvLocalFile);
  const networkRegistry = loadJson(path.join(oracleRoot, 'config', 'networks', `${network}.json`));

  const neoTestnetWif = resolveActorWif('NEO_TESTNET_WIF', miniappsEnv);
  const flagshipLiveWif = resolveActorWif('FLAGSHIP_LIVE_WIF', miniappsEnv);
  const aaTestWif = resolveActorWif('AA_TEST_WIF', miniappsEnv) || neoTestnetWif;
  const oracleTestWif =
    resolveActorWif('ORACLE_TEST_WIF', miniappsEnv) ||
    aaTestWif ||
    flagshipLiveWif ||
    neoTestnetWif;
  const runtimeRelayer = resolveNetworkSignerMaterial({
    network,
    morpheusEnv,
    wifKeys:
      network === 'mainnet'
        ? [
            'MORPHEUS_RELAYER_NEO_N3_WIF_MAINNET',
            'MORPHEUS_RELAYER_NEO_N3_WIF',
            'PHALA_NEO_N3_WIF_MAINNET',
            'PHALA_NEO_N3_WIF',
          ]
        : [
            'MORPHEUS_RELAYER_NEO_N3_WIF_TESTNET',
            'MORPHEUS_RELAYER_NEO_N3_WIF',
            'PHALA_NEO_N3_WIF_TESTNET',
            'PHALA_NEO_N3_WIF',
          ],
    privateKeyKeys:
      network === 'mainnet'
        ? [
            'MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY_MAINNET',
            'MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY',
            'PHALA_NEO_N3_PRIVATE_KEY_MAINNET',
            'PHALA_NEO_N3_PRIVATE_KEY',
          ]
        : [
            'MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY_TESTNET',
            'MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY',
            'PHALA_NEO_N3_PRIVATE_KEY_TESTNET',
            'PHALA_NEO_N3_PRIVATE_KEY',
          ],
  });
  const runtimeUpdater = resolveNetworkSignerMaterial({
    network,
    morpheusEnv,
    wifKeys:
      network === 'mainnet'
        ? [
            'MORPHEUS_UPDATER_NEO_N3_WIF_MAINNET',
            'MORPHEUS_UPDATER_NEO_N3_WIF',
            'MORPHEUS_RELAYER_NEO_N3_WIF_MAINNET',
            'MORPHEUS_RELAYER_NEO_N3_WIF',
            'PHALA_NEO_N3_WIF_MAINNET',
            'PHALA_NEO_N3_WIF',
          ]
        : [
            'MORPHEUS_UPDATER_NEO_N3_WIF_TESTNET',
            'MORPHEUS_UPDATER_NEO_N3_WIF',
            'MORPHEUS_RELAYER_NEO_N3_WIF_TESTNET',
            'MORPHEUS_RELAYER_NEO_N3_WIF',
            'PHALA_NEO_N3_WIF_TESTNET',
            'PHALA_NEO_N3_WIF',
          ],
    privateKeyKeys:
      network === 'mainnet'
        ? [
            'MORPHEUS_UPDATER_NEO_N3_PRIVATE_KEY_MAINNET',
            'MORPHEUS_UPDATER_NEO_N3_PRIVATE_KEY',
            'MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY_MAINNET',
            'MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY',
            'PHALA_NEO_N3_PRIVATE_KEY_MAINNET',
            'PHALA_NEO_N3_PRIVATE_KEY',
          ]
        : [
            'MORPHEUS_UPDATER_NEO_N3_PRIVATE_KEY_TESTNET',
            'MORPHEUS_UPDATER_NEO_N3_PRIVATE_KEY',
            'MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY_TESTNET',
            'MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY',
            'PHALA_NEO_N3_PRIVATE_KEY_TESTNET',
            'PHALA_NEO_N3_PRIVATE_KEY',
          ],
  });
  const runtimeOracleVerifier = resolveNetworkSignerMaterial({
    network,
    morpheusEnv,
    wifKeys:
      network === 'mainnet'
        ? [
            'MORPHEUS_ORACLE_VERIFIER_WIF_MAINNET',
            'PHALA_ORACLE_VERIFIER_WIF_MAINNET',
            'MORPHEUS_ORACLE_VERIFIER_WIF',
            'PHALA_ORACLE_VERIFIER_WIF',
            runtimeUpdater.wif,
          ]
        : [
            'MORPHEUS_ORACLE_VERIFIER_WIF_TESTNET',
            'PHALA_ORACLE_VERIFIER_WIF_TESTNET',
            'MORPHEUS_ORACLE_VERIFIER_WIF',
            'PHALA_ORACLE_VERIFIER_WIF',
            runtimeUpdater.wif,
          ],
    privateKeyKeys:
      network === 'mainnet'
        ? [
            'MORPHEUS_ORACLE_VERIFIER_PRIVATE_KEY_MAINNET',
            'PHALA_ORACLE_VERIFIER_PRIVATE_KEY_MAINNET',
            'MORPHEUS_ORACLE_VERIFIER_PRIVATE_KEY',
            'PHALA_ORACLE_VERIFIER_PRIVATE_KEY',
            runtimeUpdater.private_key,
          ]
        : [
            'MORPHEUS_ORACLE_VERIFIER_PRIVATE_KEY_TESTNET',
            'PHALA_ORACLE_VERIFIER_PRIVATE_KEY_TESTNET',
            'MORPHEUS_ORACLE_VERIFIER_PRIVATE_KEY',
            'PHALA_ORACLE_VERIFIER_PRIVATE_KEY',
            runtimeUpdater.private_key,
          ],
  });

  const paymasterAppId =
    trimString(process.env.MORPHEUS_PAYMASTER_APP_ID) ||
    trimString(networkRegistry?.phala?.cvm_id) ||
    'ddff154546fe22d15b65667156dd4b7c611e6093';

  const context = {
    network,
    roots: {
      oracle: oracleRoot,
      aa: aaRoot,
      miniapps: miniappsRoot,
    },
    files: {
      miniapps_env: miniappsEnvFile,
      morpheus_env: morpheusEnvFile,
      morpheus_env_local: morpheusEnvLocalFile,
    },
    actors: {
      neo_testnet_wif: neoTestnetWif,
      neo_testnet_private_key: derivePrivateKeyFromWif(neoTestnetWif),
      flagship_live_wif: flagshipLiveWif,
      aa_test_wif: aaTestWif,
      oracle_test_wif: oracleTestWif,
      oracle_test_private_key: derivePrivateKeyFromWif(oracleTestWif),
      oracle_runtime_relayer_wif: runtimeRelayer.wif,
      oracle_runtime_relayer_private_key: runtimeRelayer.private_key,
      oracle_runtime_updater_wif: runtimeUpdater.wif,
      oracle_runtime_updater_private_key: runtimeUpdater.private_key,
      oracle_runtime_verifier_wif: runtimeOracleVerifier.wif,
      oracle_runtime_verifier_private_key: runtimeOracleVerifier.private_key,
    },
    morpheus: {
      runtime_url: resolveRuntimeUrl({
        network,
        morpheusEnv,
        morpheusLocalEnv,
      }),
      runtime_token: resolveRuntimeToken(morpheusEnv),
      control_plane_url:
        trimString(networkRegistry?.phala?.control_plane_url) || 'https://control.meshmini.app',
      oracle_hash: trimString(networkRegistry?.neo_n3?.contracts?.morpheus_oracle || ''),
      callback_hash:
        trimString(networkRegistry?.neo_n3?.examples?.oracle_callback_consumer || '') ||
        trimString(networkRegistry?.neo_n3?.contracts?.oracle_callback_consumer || ''),
    },
    aa: {
      core_hash_testnet: trimString(networkRegistry?.neo_n3?.contracts?.abstract_account || ''),
      paymaster_app_id: paymasterAppId,
      paymaster_account_id:
        trimString(process.env.PAYMASTER_ACCOUNT_ID) ||
        '0x0c3146e78efc42bfb7d4cc2e06e3efd063c01c56',
    },
  };

  process.stdout.write(`${JSON.stringify(context, null, 2)}\n`);
}

main();
