import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '..');

function writeEnvFile(filePath, values) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n',
    'utf8'
  );
}

function parseEnv(raw) {
  return Object.fromEntries(
    raw
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index), line.slice(index + 1)];
      })
  );
}

test('render-phala-hub-env propagates heartbeat URLs and network-scoped signer material', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'render-phala-hub-env-'));
  const deployDir = path.join(workDir, 'deploy/phala');
  const outputPath = path.join(deployDir, 'morpheus.hub.env');
  const shared = {
    MORPHEUS_PHALA_WORKER_IMAGE: 'worker:test',
    MORPHEUS_RELAYER_IMAGE: 'relayer:test',
    PHALA_SHARED_SECRET: 'shared-secret',
    SUPABASE_URL: 'https://supabase.example',
    SUPABASE_SECRET_KEY: 'supabase-secret',
  };

  writeEnvFile(path.join(deployDir, 'morpheus.mainnet.env'), {
    ...shared,
    MORPHEUS_BETTERSTACK_RELAYER_HEARTBEAT_URL: 'https://heartbeat.example/request',
    MORPHEUS_BETTERSTACK_RELAYER_FEED_HEARTBEAT_URL: 'https://heartbeat.example/feed',
    MORPHEUS_BETTERSTACK_RELAYER_FAILURE_URL: 'https://heartbeat.example/failure',
    MORPHEUS_RUNTIME_CONFIG_JSON: JSON.stringify({
      MORPHEUS_NETWORK: 'mainnet',
      PHALA_NEO_N3_WIF: 'mainnet-feed-wif',
      PHALA_NEO_N3_PRIVATE_KEY: 'mainnet-feed-private-key',
      MORPHEUS_RELAYER_NEO_N3_WIF: 'mainnet-request-wif',
      MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY: 'mainnet-request-private-key',
      MORPHEUS_UPDATER_NEO_N3_WIF: 'mainnet-updater-wif',
      MORPHEUS_UPDATER_NEO_N3_PRIVATE_KEY: 'mainnet-updater-private-key',
    }),
  });
  writeEnvFile(path.join(deployDir, 'morpheus.testnet.env'), {
    ...shared,
    MORPHEUS_RUNTIME_CONFIG_JSON: JSON.stringify({
      MORPHEUS_NETWORK: 'testnet',
      PHALA_NEO_N3_WIF: 'testnet-feed-wif',
      PHALA_NEO_N3_PRIVATE_KEY: 'testnet-feed-private-key',
      MORPHEUS_RELAYER_NEO_N3_WIF: 'testnet-request-wif',
      MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY: 'testnet-request-private-key',
      MORPHEUS_UPDATER_NEO_N3_WIF: 'testnet-updater-wif',
      MORPHEUS_UPDATER_NEO_N3_PRIVATE_KEY: 'testnet-updater-private-key',
    }),
  });

  const result = spawnSync(
    process.execPath,
    [path.join(repoRoot, 'scripts/render-phala-hub-env.mjs'), '--output', outputPath],
    {
      cwd: workDir,
      encoding: 'utf8',
      env: { PATH: process.env.PATH },
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const rendered = parseEnv(fs.readFileSync(outputPath, 'utf8'));

  assert.equal(
    rendered.MORPHEUS_BETTERSTACK_RELAYER_HEARTBEAT_URL,
    'https://heartbeat.example/request'
  );
  assert.equal(
    rendered.MORPHEUS_BETTERSTACK_RELAYER_FEED_HEARTBEAT_URL,
    'https://heartbeat.example/feed'
  );
  assert.equal(
    rendered.MORPHEUS_BETTERSTACK_RELAYER_FAILURE_URL,
    'https://heartbeat.example/failure'
  );
  assert.equal(rendered.PHALA_NEO_N3_WIF_MAINNET, 'mainnet-feed-wif');
  assert.equal(rendered.PHALA_NEO_N3_PRIVATE_KEY_MAINNET, 'mainnet-feed-private-key');
  assert.equal(rendered.PHALA_NEO_N3_WIF_TESTNET, 'testnet-feed-wif');
  assert.equal(rendered.PHALA_NEO_N3_PRIVATE_KEY_TESTNET, 'testnet-feed-private-key');
  assert.equal(rendered.MORPHEUS_RELAYER_NEO_N3_WIF_MAINNET, 'mainnet-request-wif');
  assert.equal(rendered.MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY_MAINNET, 'mainnet-request-private-key');
  assert.equal(rendered.MORPHEUS_UPDATER_NEO_N3_WIF_MAINNET, 'mainnet-updater-wif');
  assert.equal(rendered.MORPHEUS_UPDATER_NEO_N3_PRIVATE_KEY_MAINNET, 'mainnet-updater-private-key');
  assert.equal(rendered.MORPHEUS_RELAYER_NEO_N3_WIF_TESTNET, 'testnet-request-wif');
  assert.equal(rendered.MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY_TESTNET, 'testnet-request-private-key');
  assert.equal(rendered.MORPHEUS_UPDATER_NEO_N3_WIF_TESTNET, 'testnet-updater-wif');
  assert.equal(rendered.MORPHEUS_UPDATER_NEO_N3_PRIVATE_KEY_TESTNET, 'testnet-updater-private-key');
});

test('render-phala-hub-env lets secure local signer injection override packed runtime gaps', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'render-phala-hub-env-local-'));
  const deployDir = path.join(workDir, 'deploy/phala');
  const outputPath = path.join(deployDir, 'morpheus.hub.env');
  const shared = {
    MORPHEUS_PHALA_WORKER_IMAGE: 'worker:test',
    MORPHEUS_RELAYER_IMAGE: 'relayer:test',
    PHALA_SHARED_SECRET: 'shared-secret',
    SUPABASE_URL: 'https://supabase.example',
    SUPABASE_SECRET_KEY: 'supabase-secret',
  };

  writeEnvFile(path.join(workDir, '.env.local'), {
    MORPHEUS_RELAYER_NEO_N3_WIF_MAINNET: 'local-mainnet-request-wif',
    MORPHEUS_UPDATER_NEO_N3_WIF_MAINNET: 'local-mainnet-updater-wif',
  });
  writeEnvFile(path.join(deployDir, 'morpheus.mainnet.env'), {
    ...shared,
    MORPHEUS_RUNTIME_CONFIG_JSON: JSON.stringify({
      MORPHEUS_NETWORK: 'mainnet',
      MORPHEUS_RELAYER_NEO_N3_WIF: '',
      MORPHEUS_UPDATER_NEO_N3_WIF: '',
    }),
  });
  writeEnvFile(path.join(deployDir, 'morpheus.testnet.env'), {
    ...shared,
    MORPHEUS_RUNTIME_CONFIG_JSON: JSON.stringify({
      MORPHEUS_NETWORK: 'testnet',
    }),
  });

  const result = spawnSync(
    process.execPath,
    [path.join(repoRoot, 'scripts/render-phala-hub-env.mjs'), '--output', outputPath],
    {
      cwd: workDir,
      encoding: 'utf8',
      env: { PATH: process.env.PATH },
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const rendered = parseEnv(fs.readFileSync(outputPath, 'utf8'));

  assert.equal(rendered.MORPHEUS_RELAYER_NEO_N3_WIF_MAINNET, 'local-mainnet-request-wif');
  assert.equal(rendered.MORPHEUS_UPDATER_NEO_N3_WIF_MAINNET, 'local-mainnet-updater-wif');
});

test('render-phala-hub-env never promotes unscoped local signer material into scoped hub keys', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'render-phala-hub-env-unscoped-'));
  const deployDir = path.join(workDir, 'deploy/phala');
  const outputPath = path.join(deployDir, 'morpheus.hub.env');
  const shared = {
    MORPHEUS_PHALA_WORKER_IMAGE: 'worker:test',
    MORPHEUS_RELAYER_IMAGE: 'relayer:test',
    PHALA_SHARED_SECRET: 'shared-secret',
    SUPABASE_URL: 'https://supabase.example',
    SUPABASE_SECRET_KEY: 'supabase-secret',
  };

  writeEnvFile(path.join(workDir, '.env.local'), {
    PHALA_NEO_N3_PRIVATE_KEY: 'local-generic-worker-private-key',
    MORPHEUS_ORACLE_VERIFIER_PUBLIC_KEY: 'local-generic-verifier-public-key',
  });
  writeEnvFile(path.join(deployDir, 'morpheus.mainnet.env'), {
    ...shared,
    MORPHEUS_RUNTIME_CONFIG_JSON: JSON.stringify({
      MORPHEUS_NETWORK: 'mainnet',
      PHALA_NEO_N3_PRIVATE_KEY: 'mainnet-worker-private-key',
      MORPHEUS_ORACLE_VERIFIER_PUBLIC_KEY: 'mainnet-verifier-public-key',
    }),
  });
  writeEnvFile(path.join(deployDir, 'morpheus.testnet.env'), {
    ...shared,
    MORPHEUS_RUNTIME_CONFIG_JSON: JSON.stringify({
      MORPHEUS_NETWORK: 'testnet',
      PHALA_NEO_N3_PRIVATE_KEY: 'testnet-worker-private-key',
      MORPHEUS_ORACLE_VERIFIER_PUBLIC_KEY: 'testnet-verifier-public-key',
    }),
  });

  const result = spawnSync(
    process.execPath,
    [path.join(repoRoot, 'scripts/render-phala-hub-env.mjs'), '--output', outputPath],
    {
      cwd: workDir,
      encoding: 'utf8',
      env: { PATH: process.env.PATH },
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const rendered = parseEnv(fs.readFileSync(outputPath, 'utf8'));

  assert.equal(rendered.PHALA_NEO_N3_PRIVATE_KEY_MAINNET, 'mainnet-worker-private-key');
  assert.equal(rendered.PHALA_NEO_N3_PRIVATE_KEY_TESTNET, 'testnet-worker-private-key');
  assert.equal(rendered.MORPHEUS_ORACLE_VERIFIER_PUBLIC_KEY_MAINNET, 'mainnet-verifier-public-key');
  assert.equal(rendered.MORPHEUS_ORACLE_VERIFIER_PUBLIC_KEY_TESTNET, 'testnet-verifier-public-key');
});
