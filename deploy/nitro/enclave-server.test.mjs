// Golden-vector consensus gate for deploy/nitro/enclave-server.mjs.
//
// PROVES the enclave-server's /oracle/fulfill produces a fulfillment digest +
// result envelope that are BYTE-IDENTICAL to the canonical relayer builders, and
// a signature that verifies against the returned public key — across neo_n3
// (with appId), legacy neo_n3 (no appId), and neox.
//
// How compute is made deterministic: the worker `handler` is STUBBED via the
// test-only seam __setWorkerHandlerForTests so each lane returns a FIXED result
// body (a fixed price string, a fixed 32-byte VRF randomness). The worker source
// is never touched. This isolates the test to the digest/envelope/signature
// pipeline — the consensus-critical part — instead of live price data.
//
// How byte-exactness is proven: the test feeds the SAME {ok, status, body}
// workerResponse the server's stub returned into the IMPORTED builders
// (encodeFulfillmentResult, buildOnchainResultEnvelope, buildFulfillmentDigestBytes
// / buildNeoXDigest) independently, and asserts the server's
// fulfillment_digest_hex + verification equal the independently-recomputed values.
// Because the server uses those exact imported builders, equality proves it did
// NOT re-derive the digest.

import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { wallet as neoWallet } from '@cityofzion/neon-js';
import { ethers } from 'ethers';

import {
  buildFulfillmentDigestBytes,
  buildOnchainResultEnvelope,
  encodeFulfillmentResult,
  resolveKernelIntent,
} from '../../workers/morpheus-relayer/src/router.js';
import { buildNeoXDigest, resolveResultBytesHex } from '../../workers/morpheus-relayer/src/neox.js';

// ---------------------------------------------------------------------------
// Test-only keys + env (injected BEFORE importing the server so resolveNetwork /
// signer resolution see them). MORPHEUS_ALLOW_UNPINNED_SIGNERS lets us use a
// freshly-generated oracle_verifier key without matching the committed pinned
// identity (test-only — never use in production).
// ---------------------------------------------------------------------------
process.env.MORPHEUS_NETWORK = 'testnet';
process.env.MORPHEUS_ALLOW_UNPINNED_SIGNERS = '1';

const ORACLE_VERIFIER_ACCOUNT = new neoWallet.Account(neoWallet.generatePrivateKey());
process.env.MORPHEUS_ORACLE_VERIFIER_PRIVATE_KEY_TESTNET = ORACLE_VERIFIER_ACCOUNT.privateKey;

// Deterministic test-only EVM verifier key.
const NEOX_VERIFIER_PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const NEOX_VERIFIER_WALLET = new ethers.Wallet(NEOX_VERIFIER_PK);
process.env.MORPHEUS_NEOX_VERIFIER_PRIVATE_KEY = NEOX_VERIFIER_PK;

// Worker auth token so the (stubbed) compute path is consistent; the stub does not
// check it, but the server attaches it — set it so a non-stubbed path would work too.
process.env.NITRO_API_TOKEN = 'enclave-test-token';

// Imported after env is set.
const enclave = await import('./enclave-server.mjs');
const { dispatch, __setWorkerHandlerForTests, __resetWorkerHandlerForTests, handleHealth } = enclave;

// ---------------------------------------------------------------------------
// Deterministic worker-handler stub. Returns a fixed Response per route so the
// pipeline (encode -> envelope -> digest -> sign) is exercised against a known
// body. The body shapes mirror the real worker lanes:
//   - /oracle/query, /oracle/feed: a price/oracle result body
//   - /vrf/random: { randomness } (fixed 32 bytes)
//   - /oracle/decrypt: { plaintext } -> but encodeFulfillmentResult for decrypt is
//     handled by the relayer's special-case; here the generic encode is exercised
//     for query/feed/vrf which is sufficient for the digest pipeline proof.
// ---------------------------------------------------------------------------

const FIXED_PRICE_BODY = {
  mode: 'oracle',
  result: '65000.12345678',
  extracted_value: '65000.12345678',
  price: '65000.12345678',
  symbol: 'BTC/USD',
  decimals: 8,
  timestamp: 1718352000,
  sources: ['twelvedata'],
  verification: {
    output_hash: 'a'.repeat(64),
    attestation_hash: 'b'.repeat(64),
    signature: 'c'.repeat(128),
    public_key: 'd'.repeat(66),
    signer_address: 'NTEST',
    signer_script_hash: '0x' + 'e'.repeat(40),
  },
};

const FIXED_VRF_RANDOMNESS = '11'.repeat(32); // fixed 32-byte randomness

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function installDeterministicWorker() {
  __setWorkerHandlerForTests(async (request) => {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '');
    if (path.endsWith('/vrf/random')) {
      return jsonResponse(200, { request_id: '1', randomness: FIXED_VRF_RANDOMNESS });
    }
    if (path.endsWith('/oracle/query') || path.endsWith('/oracle/feed')) {
      return jsonResponse(200, { ...FIXED_PRICE_BODY });
    }
    // default: echo a generic oracle body
    return jsonResponse(200, { ...FIXED_PRICE_BODY });
  });
}

before(() => {
  installDeterministicWorker();
});

beforeEach(() => {
  installDeterministicWorker();
});

// Recompute the workerResponse the stub produced for a given route, so the test
// can drive the imported builders INDEPENDENTLY of the server.
function expectedWorkerResponse(requestType) {
  const intent = resolveKernelIntent(requestType);
  if (intent.moduleId === 'random.generate') {
    return { ok: true, status: 200, body: { request_id: '1', randomness: FIXED_VRF_RANDOMNESS } };
  }
  return { ok: true, status: 200, body: { ...FIXED_PRICE_BODY } };
}

// ---------------------------------------------------------------------------
// neo_n3 (with appId) — full kernel envelope digest, deployment-bound.
// ---------------------------------------------------------------------------

test('neo_n3 (with appId): digest + envelope + signature byte-exact', async () => {
  const requestType = 'oracle_query';
  const requestId = '4242';
  const contractScriptHash = '0x' + '1f'.repeat(20);
  const networkMagic = 894710606; // Neo N3 testnet
  const appId = 'demo.app';
  const moduleId = resolveKernelIntent(requestType).moduleId;
  const operation = resolveKernelIntent(requestType).operation;

  const req = {
    chain: 'neo_n3',
    request_type: requestType,
    request_id: requestId,
    payload: { symbol: 'BTC/USD', requester: '0x' + 'aa'.repeat(20) },
    fulfillment_context: {
      app_id: appId,
      module_id: moduleId,
      operation,
      contract_script_hash: contractScriptHash,
      network_magic: networkMagic,
    },
    nonce: 'deadbeef',
  };

  const { status, body } = await dispatch('POST', '/oracle/fulfill', {}, JSON.stringify(req));
  assert.equal(status, 200, `dispatch failed: ${JSON.stringify(body)}`);
  assert.equal(body.status, 'ok');
  assert.equal(body.trust_tier, 'enclave-attested');
  assert.equal(body.success, true);
  assert.equal(body.nonce, 'deadbeef');

  // Independently recompute from the SAME workerResponse the stub returned.
  const workerResponse = expectedWorkerResponse(requestType);
  const fulfillment = encodeFulfillmentResult(requestType, workerResponse);
  const expectedEnvelope = buildOnchainResultEnvelope(requestType, workerResponse);
  const expectedDigest = buildFulfillmentDigestBytes(
    requestId,
    requestType,
    fulfillment.success,
    fulfillment.result || '',
    fulfillment.error || '',
    fulfillment.result_bytes_base64 || '',
    {
      chain: 'neo_n3',
      appId,
      moduleId,
      operation,
      contractScriptHash,
      networkMagic,
    }
  ).toString('hex');

  // Byte-exactness: server digest === independently-recomputed canonical digest.
  assert.equal(body.fulfillment_digest_hex, expectedDigest, 'fulfillment digest must be byte-exact');
  // Result + envelope match the canonical encoding.
  assert.equal(body.result, fulfillment.result || '');
  assert.deepEqual(body.verification, expectedEnvelope);

  // Negative control: a digest WITHOUT the deployment binding (a common
  // re-derivation mistake) must NOT match — proving the server actually appended
  // the contract script hash + network magic via the canonical builder.
  const digestNoBinding = buildFulfillmentDigestBytes(
    requestId,
    requestType,
    fulfillment.success,
    fulfillment.result || '',
    fulfillment.error || '',
    fulfillment.result_bytes_base64 || '',
    { chain: 'neo_n3', appId, moduleId, operation } // no contractScriptHash/networkMagic
  ).toString('hex');
  assert.notEqual(
    body.fulfillment_digest_hex,
    digestNoBinding,
    'digest must include the deployment binding (script hash + magic)'
  );

  // Signature verifies against the returned public_key over the digest (secp256r1).
  assert.equal(
    body.public_key.toLowerCase(),
    ORACLE_VERIFIER_ACCOUNT.publicKey.toLowerCase(),
    'public_key must be the oracle_verifier'
  );
  assert.equal(
    neoWallet.verify(body.fulfillment_digest_hex, body.signature, body.public_key),
    true,
    'signature must verify over the digest'
  );
});

// ---------------------------------------------------------------------------
// legacy neo_n3 (no appId) — legacy digest domain, requestType-based.
// ---------------------------------------------------------------------------

test('legacy neo_n3 (no appId): legacy digest + signature byte-exact', async () => {
  const requestType = 'oracle_query';
  const requestId = '7';

  const req = {
    chain: 'legacy',
    request_type: requestType,
    request_id: requestId,
    payload: { symbol: 'BTC/USD' },
    fulfillment_context: {}, // no appId -> legacy domain
    nonce: '',
  };

  const { status, body } = await dispatch('POST', '/oracle/fulfill', {}, JSON.stringify(req));
  assert.equal(status, 200, `dispatch failed: ${JSON.stringify(body)}`);
  assert.equal(body.trust_tier, 'enclave-attested');

  const workerResponse = expectedWorkerResponse(requestType);
  const fulfillment = encodeFulfillmentResult(requestType, workerResponse);
  const expectedEnvelope = buildOnchainResultEnvelope(requestType, workerResponse);
  const expectedDigest = buildFulfillmentDigestBytes(
    requestId,
    requestType,
    fulfillment.success,
    fulfillment.result || '',
    fulfillment.error || '',
    fulfillment.result_bytes_base64 || '',
    { chain: 'legacy', appId: '', moduleId: '', operation: '' }
  ).toString('hex');

  assert.equal(body.fulfillment_digest_hex, expectedDigest, 'legacy digest must be byte-exact');
  assert.deepEqual(body.verification, expectedEnvelope);
  assert.equal(
    neoWallet.verify(body.fulfillment_digest_hex, body.signature, body.public_key),
    true,
    'legacy signature must verify over the digest'
  );
});

// ---------------------------------------------------------------------------
// neo_n3 VRF (with FIXED randomness) — compact callback bytes lane.
// ---------------------------------------------------------------------------

test('neo_n3 vrf (fixed randomness): compact callback digest + signature byte-exact', async () => {
  const requestType = 'random';
  const requestId = '99';
  const appId = 'dice.app';
  const moduleId = resolveKernelIntent(requestType).moduleId; // random.generate
  const operation = resolveKernelIntent(requestType).operation;
  const contractScriptHash = '0x' + '2c'.repeat(20);
  const networkMagic = 894710606;

  const req = {
    chain: 'neo_n3',
    request_type: requestType,
    request_id: requestId,
    payload: {},
    fulfillment_context: {
      app_id: appId,
      module_id: moduleId,
      operation,
      contract_script_hash: contractScriptHash,
      network_magic: networkMagic,
    },
  };

  const { status, body } = await dispatch('POST', '/oracle/fulfill', {}, JSON.stringify(req));
  assert.equal(status, 200, `dispatch failed: ${JSON.stringify(body)}`);

  const workerResponse = expectedWorkerResponse(requestType);
  const fulfillment = encodeFulfillmentResult(requestType, workerResponse);
  // VRF -> compact 32-byte randomness as result_bytes_base64, empty result string.
  assert.equal(fulfillment.result, '');
  assert.ok(fulfillment.result_bytes_base64, 'vrf must produce compact callback bytes');
  assert.equal(
    body.result_bytes_base64,
    fulfillment.result_bytes_base64,
    'server must return the compact callback bytes'
  );
  // The compact bytes must decode to the fixed randomness.
  assert.equal(
    Buffer.from(body.result_bytes_base64, 'base64').toString('hex'),
    FIXED_VRF_RANDOMNESS,
    'compact callback bytes must equal the fixed VRF randomness'
  );

  const expectedDigest = buildFulfillmentDigestBytes(
    requestId,
    requestType,
    fulfillment.success,
    fulfillment.result || '',
    fulfillment.error || '',
    fulfillment.result_bytes_base64 || '',
    { chain: 'neo_n3', appId, moduleId, operation, contractScriptHash, networkMagic }
  ).toString('hex');

  assert.equal(body.fulfillment_digest_hex, expectedDigest, 'vrf digest must be byte-exact');
  assert.equal(
    neoWallet.verify(body.fulfillment_digest_hex, body.signature, body.public_key),
    true,
    'vrf signature must verify over the digest'
  );
});

// ---------------------------------------------------------------------------
// neox (EVM) — keccak digest + EIP-191 signature.
// ---------------------------------------------------------------------------

test('neox: keccak digest + envelope + EIP-191 signature byte-exact', async () => {
  const requestType = 'oracle_query';
  const requestId = '123';
  const appId = 'evm.app';
  const moduleId = resolveKernelIntent(requestType).moduleId;
  const operation = resolveKernelIntent(requestType).operation;
  const chainId = 12227332; // Neo X testnet
  const oracleContract = '0xeCFC1C652B5cCdBfe3E9314a83156787D92a3fD2';

  const req = {
    chain: 'neox',
    request_type: requestType,
    request_id: requestId,
    payload: { symbol: 'BTC/USD' },
    fulfillment_context: {
      app_id: appId,
      module_id: moduleId,
      operation,
      chain_id: chainId,
      oracle_contract: oracleContract,
    },
  };

  const { status, body } = await dispatch('POST', '/oracle/fulfill', {}, JSON.stringify(req));
  assert.equal(status, 200, `dispatch failed: ${JSON.stringify(body)}`);
  assert.equal(body.trust_tier, 'enclave-attested');

  const workerResponse = expectedWorkerResponse(requestType);
  const fulfillment = encodeFulfillmentResult(requestType, workerResponse);
  const expectedEnvelope = buildOnchainResultEnvelope(requestType, workerResponse);

  const neoxConfig = { neox: { chainId, oracleContract, verifierPrivateKey: NEOX_VERIFIER_PK } };
  const evmFulfillment = {
    requestId,
    appId,
    moduleId,
    operation,
    success: fulfillment.success,
    result: fulfillment.result || '',
    result_bytes_base64: fulfillment.result_bytes_base64 || '',
    error: fulfillment.error || '',
  };
  const resultBytesHex = resolveResultBytesHex(
    evmFulfillment.result,
    evmFulfillment.result_bytes_base64
  );
  const expectedDigest = buildNeoXDigest(neoxConfig, evmFulfillment, resultBytesHex);

  assert.equal(body.fulfillment_digest_hex, expectedDigest, 'neox keccak digest must be byte-exact');
  assert.deepEqual(body.verification, expectedEnvelope);

  // EIP-191 personal-sign recovery: recovered address == verifier wallet address.
  assert.equal(
    body.public_key.toLowerCase(),
    NEOX_VERIFIER_WALLET.signingKey.publicKey.toLowerCase()
  );
  const recovered = ethers.verifyMessage(ethers.getBytes(body.fulfillment_digest_hex), body.signature);
  assert.equal(
    recovered.toLowerCase(),
    NEOX_VERIFIER_WALLET.address.toLowerCase(),
    'neox signature must recover to the verifier address over the digest'
  );
});

// ---------------------------------------------------------------------------
// Host-unattested lane: arbitrary-URL smart-fetch is NOT signed in-enclave.
// ---------------------------------------------------------------------------

test('arbitrary-url smart-fetch is host-unattested (no in-enclave signature)', async () => {
  const req = {
    chain: 'neo_n3',
    request_type: 'privacy_oracle', // -> oracle.fetch -> /oracle/smart-fetch
    request_id: '5',
    payload: { url: 'https://example.com/data' },
    fulfillment_context: { app_id: 'x' },
  };
  // smart-fetch is the host-tier lane.
  assert.equal(resolveKernelIntent('privacy_oracle').workerRoute, '/oracle/smart-fetch');

  const { status, body } = await dispatch('POST', '/oracle/fulfill', {}, JSON.stringify(req));
  assert.equal(status, 200);
  assert.equal(body.trust_tier, 'host-unattested');
  assert.equal(body.signature, null);
  assert.equal(body.fulfillment_digest_hex, null);
});

// ---------------------------------------------------------------------------
// /health
// ---------------------------------------------------------------------------

test('GET /health reports compute + signer readiness', async () => {
  const { status, body } = await dispatch('GET', '/health', {}, '');
  assert.equal(status, 200);
  assert.equal(body.ready, true);
  assert.equal(body.checks.compute, true);
  assert.equal(body.checks.signer, true);

  // handleHealth direct call agrees.
  const direct = handleHealth();
  assert.equal(direct.ready, true);
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

test('missing request_type / request_id returns 400', async () => {
  const noType = await dispatch(
    'POST',
    '/oracle/fulfill',
    {},
    JSON.stringify({ chain: 'neo_n3', request_id: '1' })
  );
  assert.equal(noType.status, 400);
  assert.match(noType.body.error, /request_type/);

  const noId = await dispatch(
    'POST',
    '/oracle/fulfill',
    {},
    JSON.stringify({ chain: 'neo_n3', request_type: 'oracle_query' })
  );
  assert.equal(noId.status, 400);
  assert.match(noId.body.error, /request_id/);
});

test('unknown route returns 404', async () => {
  const { status, body } = await dispatch('GET', '/nope', {}, '');
  assert.equal(status, 404);
  assert.equal(body.error, 'not found');
});

test('cleanup: reset stubbed worker handler', () => {
  __resetWorkerHandlerForTests();
  assert.ok(true);
});
