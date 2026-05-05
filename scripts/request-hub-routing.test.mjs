import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function extractCloudflareDefaultNetwork(source) {
  const match = source.match(
    /if\s*\(path === '\/' \|\| path === ''\)\s*\{\s*return\s*\{\s*network:\s*'([^']+)'/s
  );
  assert.ok(match, 'could not find Cloudflare default network');
  return match[1];
}

function extractBareCaddyNetwork(source) {
  const match = source.match(
    /handle\s*\{\s*reverse_proxy request-worker:8080\s*\{\s*header_up X-Morpheus-Network ([a-z]+)\s*\}\s*\}/s
  );
  assert.ok(match, 'could not find request-hub bare Caddy route');
  return match[1];
}

test('request-hub bare routes stay aligned with the edge default network', () => {
  const edgeWorker = readRepoFile('deploy/cloudflare/morpheus-edge-gateway/worker.mjs');
  const standaloneCaddy = readRepoFile('deploy/phala/Caddyfile.request-hub');
  const inlineCompose = readRepoFile('deploy/phala/docker-compose.request-hub.yml');

  const defaultNetwork = extractCloudflareDefaultNetwork(edgeWorker);
  assert.equal(defaultNetwork, 'testnet');
  assert.equal(extractBareCaddyNetwork(standaloneCaddy), defaultNetwork);
  assert.equal(extractBareCaddyNetwork(inlineCompose), defaultNetwork);
});

function extractServiceBlock(source, serviceName) {
  const match = source.match(new RegExp(`\\n  ${serviceName}:\\n([\\s\\S]*?)(?=\\n  [a-z0-9-]+:\\n|\\nvolumes:)`));
  assert.ok(match, `could not find ${serviceName} service block`);
  return match[1];
}

for (const [composePath, services] of [
  [
    'deploy/phala/docker-compose.request-hub.yml',
    ['mainnet-request-relayer', 'testnet-request-relayer'],
  ],
  ['deploy/phala/docker-compose.feed-hub.yml', ['mainnet-feed-relayer', 'testnet-feed-relayer']],
]) {
  test(`${composePath} relayers expose tick-freshness healthchecks`, () => {
    const source = readRepoFile(composePath);
    for (const service of services) {
      const block = extractServiceBlock(source, service);
      assert.match(block, /healthcheck:/, `${service} should have a healthcheck`);
      assert.match(
        block,
        /workers\/morpheus-relayer\/src\/healthcheck\.js/,
        `${service} healthcheck should use the relayer freshness checker`
      );
    }
  });
}
