import test from 'node:test';
import assert from 'node:assert/strict';

process.env.PHALA_SHARED_SECRET = 'runtime-matrix-test-secret';
process.env.PHALA_API_TOKEN = 'runtime-matrix-test-secret';
process.env.PHALA_NEO_N3_PRIVATE_KEY =
  '1111111111111111111111111111111111111111111111111111111111111111';
process.env.NEO_RPC_URL = 'https://neo-rpc.test';
process.env.MORPHEUS_ALLOW_EPHEMERAL_KEY = 'true';
process.env.MORPHEUS_ALLOW_UNPINNED_SIGNERS = 'true';

const { RUNTIME_SERVICE_MATRIX, __resolveBaseUrlCandidatesForTests } =
  await import('./runtime-service-matrix.mjs');
const { listCapabilityFeatures } = await import('../workers/phala-worker/src/capabilities.js');
const { listBuiltinComputeFunctions } =
  await import('../workers/phala-worker/src/compute/index.js');

test('runtime service matrix covers every worker capability feature', () => {
  const coveredFeatures = new Set(
    RUNTIME_SERVICE_MATRIX.map((entry) => entry.capabilityFeature).filter(Boolean)
  );
  const missing = listCapabilityFeatures().filter((feature) => !coveredFeatures.has(feature));
  assert.deepEqual(missing, []);
});

test('runtime service matrix covers every builtin privacy compute function', () => {
  const coveredBuiltins = new Set(
    RUNTIME_SERVICE_MATRIX.map((entry) => entry.computeFunction).filter(Boolean)
  );
  const missing = listBuiltinComputeFunctions()
    .map((entry) => entry.name)
    .filter((name) => !coveredBuiltins.has(name));
  assert.deepEqual(missing, []);
});

test('runtime service matrix includes positive probes for key Morpheus service classes', () => {
  const serviceClasses = new Set(RUNTIME_SERVICE_MATRIX.map((entry) => entry.serviceClass));
  assert.ok(serviceClasses.has('runtime'));
  assert.ok(serviceClasses.has('privacy_oracle'));
  assert.ok(serviceClasses.has('privacy_compute'));
  assert.ok(serviceClasses.has('randomness'));
  assert.ok(serviceClasses.has('datafeed'));
  assert.ok(serviceClasses.has('neodid'));
  assert.ok(serviceClasses.has('paymaster'));
  assert.ok(serviceClasses.has('chain_signing'));

  const positiveIds = new Set(
    RUNTIME_SERVICE_MATRIX.filter((entry) => entry.expectation !== 'fail_closed').map(
      (entry) => entry.id
    )
  );
  for (const id of [
    'oracle:query',
    'oracle:smart-fetch',
    'oracle:confidential-query',
    'compute:privacy.mask',
    'compute:fhe.noise_budget_estimate',
    'compute:zkp.zerc20.single_withdraw.verify',
    'vrf:random',
    'neodid:bind',
    'paymaster:authorize',
  ]) {
    assert.ok(positiveIds.has(id), `missing positive probe ${id}`);
  }
});

test('runtime service matrix keeps feed publication on the non-blocking path', () => {
  const feedProbe = RUNTIME_SERVICE_MATRIX.find((entry) => entry.id === 'oracle:feed');
  assert.ok(feedProbe, 'missing oracle:feed probe');
  assert.equal(feedProbe.payload.wait, false);
  assert.equal(feedProbe.payload.refresh_onchain_baseline, false);
});

test('runtime service matrix keeps registry fallback behind local custom domains', async () => {
  const candidates = await __resolveBaseUrlCandidatesForTests({
    network: 'mainnet',
    localEnvOverride: {
      MORPHEUS_MAINNET_CUSTOM_DOMAIN: 'morpheus-mainnet.meshmini.app',
    },
  });
  assert.equal(candidates[0], 'https://morpheus-mainnet.meshmini.app');
  assert.ok(candidates.includes('https://oracle.meshmini.app/mainnet'));
});
