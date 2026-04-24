import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildWorkspaceValidationData } from './lib-workspace-validation-context.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');

function createTempEnvFiles() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-context-'));
  const miniappsEnvFile = path.join(tempDir, 'miniapps.env');
  const morpheusEnvFile = path.join(tempDir, 'morpheus.env');
  const morpheusEnvLocalFile = path.join(tempDir, 'morpheus.local.env');

  fs.writeFileSync(
    miniappsEnvFile,
    [
      'NEO_TESTNET_WIF=top-secret-testnet-wif',
      'AA_TEST_WIF=aa-secret-wif',
      'ORACLE_TEST_WIF=oracle-secret-wif',
    ].join('\n') + '\n',
    'utf8'
  );
  fs.writeFileSync(
    morpheusEnvFile,
    [
      'MORPHEUS_RUNTIME_TOKEN=runtime-token-secret',
      'MORPHEUS_RELAYER_NEO_N3_WIF_TESTNET=relayer-secret-wif',
      'MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY_TESTNET=relayer-secret-private-key',
    ].join('\n') + '\n',
    'utf8'
  );
  fs.writeFileSync(morpheusEnvLocalFile, '', 'utf8');

  return { tempDir, miniappsEnvFile, morpheusEnvFile, morpheusEnvLocalFile };
}

test('workspace validation context omits secrets from stdout by default', () => {
  const files = createTempEnvFiles();
  const result = spawnSync(
    process.execPath,
    ['scripts/resolve-workspace-validation-context.mjs', 'testnet'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        MINIAPP_ENV_FILE: files.miniappsEnvFile,
        MORPHEUS_ENV_FILE: files.morpheusEnvFile,
        MORPHEUS_ENV_LOCAL_FILE: files.morpheusEnvLocalFile,
      },
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const context = JSON.parse(result.stdout);

  assert.equal(context.actors?.neo_testnet_wif, undefined);
  assert.equal(context.actors?.oracle_runtime_relayer_private_key, undefined);
  assert.equal(context.morpheus?.runtime_token, undefined);
});

test('workspace validation context can materialize secrets into a private env file', () => {
  const files = createTempEnvFiles();
  const secretsEnvFile = path.join(files.tempDir, 'workspace-secrets.env');
  const result = spawnSync(
    process.execPath,
    [
      'scripts/resolve-workspace-validation-context.mjs',
      'testnet',
      '--write-secret-env-file',
      secretsEnvFile,
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        MINIAPP_ENV_FILE: files.miniappsEnvFile,
        MORPHEUS_ENV_FILE: files.morpheusEnvFile,
        MORPHEUS_ENV_LOCAL_FILE: files.morpheusEnvLocalFile,
      },
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const context = JSON.parse(result.stdout);
  assert.equal(context.secretsEnvFile, secretsEnvFile);
  const secretsFileText = fs.readFileSync(secretsEnvFile, 'utf8');

  assert.match(secretsFileText, /^NEO_TESTNET_WIF=top-secret-testnet-wif$/m);
  assert.match(secretsFileText, /^PHALA_API_TOKEN=runtime-token-secret$/m);
  assert.match(secretsFileText, /^ORACLE_RUNTIME_RELAYER_PRIVATE_KEY=relayer-secret-private-key$/m);
  assert.match(secretsFileText, /^ORACLE_RUNTIME_UPDATER_WIF=relayer-secret-wif$/m);
  assert.match(
    secretsFileText,
    /^ORACLE_RUNTIME_VERIFIER_PRIVATE_KEY=relayer-secret-private-key$/m
  );
  assert.doesNotMatch(secretsFileText, /'runtime-token-secret'/);
  assert.doesNotMatch(
    secretsFileText,
    /^ORACLE_RUNTIME_UPDATER_WIF=MORPHEUS_UPDATER_NEO_N3_WIF_TESTNET$/m
  );
  assert.doesNotMatch(
    secretsFileText,
    /^ORACLE_RUNTIME_VERIFIER_PRIVATE_KEY=MORPHEUS_ORACLE_VERIFIER_PRIVATE_KEY_TESTNET$/m
  );
});

test('workspace validation defaults resolve sibling worktrees while reading env files from canonical repo roots', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-roots-'));
  const workspaceRoot = path.join(tempDir, 'git');
  const oracleCanonicalRoot = path.join(workspaceRoot, 'neo-morpheus-oracle');
  const oracleWorktreeRoot = path.join(oracleCanonicalRoot, '.worktrees', 'cross-repo-hardening');
  const miniappsCanonicalRoot = path.join(workspaceRoot, 'neo-miniapps-platform');
  const miniappsWorktreeRoot = path.join(
    miniappsCanonicalRoot,
    '.worktrees',
    'cross-repo-hardening'
  );
  const aaCanonicalRoot = path.join(workspaceRoot, 'neo-abstract-account');
  const aaWorktreeRoot = path.join(aaCanonicalRoot, '.worktrees', 'cross-repo-hardening');
  const oracleNetworkConfigDir = path.join(oracleWorktreeRoot, 'config', 'networks');
  const sourceNetworkConfig = path.join(repoRoot, 'config', 'networks', 'testnet.json');

  fs.mkdirSync(oracleNetworkConfigDir, { recursive: true });
  fs.mkdirSync(miniappsWorktreeRoot, { recursive: true });
  fs.mkdirSync(aaWorktreeRoot, { recursive: true });
  fs.copyFileSync(sourceNetworkConfig, path.join(oracleNetworkConfigDir, 'testnet.json'));
  fs.writeFileSync(
    path.join(miniappsCanonicalRoot, '.env'),
    ['NEO_TESTNET_WIF=canonical-miniapps-wif', 'AA_TEST_WIF=canonical-aa-wif'].join('\n') + '\n',
    'utf8'
  );
  fs.writeFileSync(
    path.join(oracleCanonicalRoot, '.env'),
    'MORPHEUS_RUNTIME_TOKEN=canonical-runtime-token\n',
    'utf8'
  );
  fs.writeFileSync(path.join(oracleCanonicalRoot, '.env.local'), '', 'utf8');

  const { publicContext, secretEnv } = buildWorkspaceValidationData({
    network: 'testnet',
    oracleRoot: oracleWorktreeRoot,
  });

  assert.equal(publicContext.roots.oracle, oracleWorktreeRoot);
  assert.equal(publicContext.roots.miniapps, miniappsWorktreeRoot);
  assert.equal(publicContext.roots.aa, aaWorktreeRoot);
  assert.equal(publicContext.files.miniapps_env, path.join(miniappsCanonicalRoot, '.env'));
  assert.equal(publicContext.files.morpheus_env, path.join(oracleCanonicalRoot, '.env'));
  assert.equal(
    publicContext.files.morpheus_env_local,
    path.join(oracleCanonicalRoot, '.env.local')
  );
  assert.equal(secretEnv.NEO_TESTNET_WIF, 'canonical-miniapps-wif');
  assert.equal(secretEnv.AA_TEST_WIF, 'canonical-aa-wif');
  assert.equal(secretEnv.MORPHEUS_RUNTIME_TOKEN, 'canonical-runtime-token');
});
