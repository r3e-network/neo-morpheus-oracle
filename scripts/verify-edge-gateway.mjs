#!/usr/bin/env node

const baseUrl = String(process.env.MORPHEUS_EDGE_URL || 'https://morpheus.meshmini.app').trim().replace(/\/$/, '');

async function readJson(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body,
  };
}

async function main() {
  const health = await readJson('/health');
  const providers = await readJson('/providers');
  const paymasterDenied = await readJson('/paymaster/authorize', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      network: 'testnet',
      target_chain: 'neo_n3',
      account_id: '0x0c3146e78efc42bfb7d4cc2e06e3efd063c01c56',
      dapp_id: 'demo-dapp',
      target_contract: '0xe24d2980d17d2580ff4ee8dc5dddaa20e3caec38',
      method: 'executeUserOp',
      estimated_gas_units: 120000,
      operation_hash: '0x' + '11'.repeat(32),
    }),
  });

  console.log(JSON.stringify({
    baseUrl,
    health: {
      status: health.status,
      edge: health.headers['x-morpheus-edge'] || null,
      route: health.headers['x-morpheus-route'] || null,
      cacheControl: health.headers['cache-control'] || null,
    },
    providers: {
      status: providers.status,
      count: Array.isArray(providers.body?.providers) ? providers.body.providers.length : null,
      cacheControl: providers.headers['cache-control'] || null,
    },
    paymasterTurnstileProbe: {
      status: paymasterDenied.status,
      body: paymasterDenied.body,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
