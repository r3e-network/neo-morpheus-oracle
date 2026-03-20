import path from 'node:path';
import { loadDotEnv } from './lib-env.mjs';
import {
  jsonPretty,
  repoRoot,
  reportDateStamp,
  writeValidationArtifacts,
} from '../examples/scripts/common.mjs';

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveNetwork() {
  return trimString(process.env.MORPHEUS_NETWORK || 'testnet') === 'mainnet' ? 'mainnet' : 'testnet';
}

function resolveControlPlaneUrl(network) {
  const explicit = trimString(
    process.env.MORPHEUS_CONTROL_PLANE_URL || process.env.NEXT_PUBLIC_MORPHEUS_CONTROL_PLANE_URL || ''
  );
  if (explicit) return explicit.replace(/\/$/, '');
  const defaultDomain = trimString(process.env.MORPHEUS_CONTROL_PLANE_DOMAIN || '');
  if (defaultDomain) return `https://${defaultDomain.replace(/\/$/, '')}`;
  throw new Error('MORPHEUS_CONTROL_PLANE_URL is required');
}

function resolveControlPlaneToken() {
  return trimString(
    process.env.MORPHEUS_CONTROL_PLANE_API_KEY ||
      process.env.MORPHEUS_PROVIDER_CONFIG_API_KEY ||
      process.env.MORPHEUS_OPERATOR_API_KEY ||
      process.env.ADMIN_CONSOLE_API_KEY ||
      ''
  );
}

async function callControlPlane(baseUrl, network, token, routePath, payload) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (token) {
    headers.set('authorization', `Bearer ${token}`);
    headers.set('x-admin-api-key', token);
  }
  const response = await fetch(`${baseUrl}/${network}${routePath}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  return {
    status: response.status,
    body,
  };
}

async function fetchJobStatus(baseUrl, network, jobId, token) {
  const headers = new Headers();
  if (token) {
    headers.set('authorization', `Bearer ${token}`);
    headers.set('x-admin-api-key', token);
  }
  const response = await fetch(`${baseUrl}/${network}/jobs/${jobId}`, {
    method: 'GET',
    headers,
  });
  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  return {
    status: response.status,
    body,
  };
}

async function waitForTerminalJob(baseUrl, network, jobId, token, timeoutMs = 180000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const current = await fetchJobStatus(baseUrl, network, jobId, token);
    const status = trimString(current.body?.status || '');
    if (['succeeded', 'failed', 'dead_lettered', 'cancelled'].includes(status)) {
      return current;
    }
    await sleep(3000);
  }
  throw new Error(`timed out waiting for terminal control-plane job ${jobId}`);
}

const network = resolveNetwork();
await loadDotEnv(path.resolve(repoRoot, '.env'), { override: false });
await loadDotEnv(path.resolve(repoRoot, 'deploy', 'phala', `morpheus.${network}.env`), {
  override: false,
});

const controlPlaneUrl = resolveControlPlaneUrl(network);
const controlPlaneToken = resolveControlPlaneToken();
const queryPayload = {
  provider: 'twelvedata',
  symbol: 'TWELVEDATA:NEO-USD',
  json_path: 'price',
  target_chain: 'neo_n3',
  project_slug: trimString(process.env.MORPHEUS_FEED_PROJECT_SLUG || 'demo'),
  dedupe_key: `smoke-control-plane-${network}-${Date.now()}`,
};

const accepted = await callControlPlane(
  controlPlaneUrl,
  network,
  controlPlaneToken,
  '/oracle/query',
  queryPayload
);

if (accepted.status !== 202 || !trimString(accepted.body?.id || '')) {
  throw new Error(`control plane did not accept job: ${accepted.status} ${JSON.stringify(accepted.body)}`);
}

const terminal = await waitForTerminalJob(
  controlPlaneUrl,
  network,
  accepted.body.id,
  controlPlaneToken
);

const generatedAt = new Date().toISOString();
const jsonReport = {
  generated_at: generatedAt,
  network,
  control_plane_url: controlPlaneUrl,
  route: '/oracle/query',
  accepted,
  terminal,
};

const markdownReport = [
  '# Control Plane Smoke',
  '',
  `Date: ${generatedAt}`,
  '',
  '## Scope',
  '',
  'Submit a single `/oracle/query` job through the Cloudflare control plane and wait for the durable job state to reach a terminal status.',
  '',
  '## Result',
  '',
  `- Network: \`${network}\``,
  `- Control plane: \`${controlPlaneUrl}\``,
  `- Accepted status: \`${accepted.status}\``,
  `- Job id: \`${trimString(accepted.body?.id || '')}\``,
  `- Terminal status: \`${trimString(terminal.body?.status || '')}\``,
  '',
].join('\n');

const artifacts = await writeValidationArtifacts({
  baseName: 'control-plane-smoke',
  network,
  generatedAt,
  jsonReport,
  markdownReport,
});

console.log(
  jsonPretty({
    ...artifacts,
    job_id: trimString(accepted.body?.id || ''),
    accepted_status: accepted.status,
    terminal_status: trimString(terminal.body?.status || ''),
  })
);
