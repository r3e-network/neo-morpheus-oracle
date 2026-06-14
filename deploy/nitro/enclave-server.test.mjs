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
import { createHash } from 'node:crypto';

import neonPkg, { wallet as neoWallet } from '@cityofzion/neon-js';
import { ethers } from 'ethers';

const { sc, tx, u } = neonPkg;

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

// Test-only updater key (the feed signer). Unpinned (allowed via the flag above).
const UPDATER_ACCOUNT = new neoWallet.Account(neoWallet.generatePrivateKey());
process.env.MORPHEUS_UPDATER_NEO_N3_PRIVATE_KEY_TESTNET = UPDATER_ACCOUNT.privateKey;

// Pin the N3 magic the feed tx is signed under so the server + the independent
// test recompute use the SAME magic (default 860833102; explicit for clarity).
process.env.FEED_MAGIC = '860833102';

// feed-pusher.mjs runs a live cycle on import unless this is set — pin it before
// either the server OR this test imports it (both import planFeedUpdate from it).
process.env.FEED_PUSHER_SKIP_MAIN = '1';

// Deterministic test-only EVM verifier key.
const NEOX_VERIFIER_PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const NEOX_VERIFIER_WALLET = new ethers.Wallet(NEOX_VERIFIER_PK);
process.env.MORPHEUS_NEOX_VERIFIER_PRIVATE_KEY = NEOX_VERIFIER_PK;

// Worker auth token so the (stubbed) compute path is consistent; the stub does not
// check it, but the server attaches it — set it so a non-stubbed path would work too.
process.env.NITRO_API_TOKEN = 'enclave-test-token';

// The sensitive endpoints (/oracle/fulfill, /feed/sign, /sign/payload, /provision)
// require the provisioned bearer token, exactly as the production relayer/feed
// callers send it. NITRO_API_TOKEN above seeds the enclave's trusted-token set, so
// dispatch calls to those routes carry AUTH; /health + /attestation stay open.
const AUTH = { authorization: 'Bearer ' + process.env.NITRO_API_TOKEN };

// Imported after env is set.
const enclave = await import('./enclave-server.mjs');
const {
  dispatch,
  __setWorkerHandlerForTests,
  __resetWorkerHandlerForTests,
  handleHealth,
  __setPriceFetcherForTests,
  __resetPriceFetcherForTests,
  __setFeedTxParamsProviderForTests,
  __resetFeedTxParamsProviderForTests,
  __setAttestRunnerForTests,
  __resetAttestRunnerForTests,
} = enclave;

// Import planFeedUpdate from the feed-pusher INDEPENDENTLY (the SAME decision the
// server imports) so the /feed/sign golden vector recomputes the planned arrays
// with the canonical function, not a copy.
const { planFeedUpdate } = await import('../feed-pusher/feed-pusher.mjs');

// Feed contract constants — MIRRORED from feed-pusher.mjs pushNeoN3 so the test's
// independent tx build matches the server's. If feed-pusher.mjs changes these the
// test (correctly) breaks alongside the server.
const FEED_N3_CONTRACT = '03013f49c42a14546c8bbe58f9d434c3517fccab';
const FEED_N3_MAGIC = Number(process.env.FEED_MAGIC);

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

  const { status, body } = await dispatch('POST', '/oracle/fulfill', AUTH, JSON.stringify(req));
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

  const { status, body } = await dispatch('POST', '/oracle/fulfill', AUTH, JSON.stringify(req));
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

  const { status, body } = await dispatch('POST', '/oracle/fulfill', AUTH, JSON.stringify(req));
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

  const { status, body } = await dispatch('POST', '/oracle/fulfill', AUTH, JSON.stringify(req));
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

  const { status, body } = await dispatch('POST', '/oracle/fulfill', AUTH, JSON.stringify(req));
  assert.equal(status, 200);
  assert.equal(body.trust_tier, 'host-unattested');
  assert.equal(body.signature, null);
  assert.equal(body.fulfillment_digest_hex, null);
});

// ---------------------------------------------------------------------------
// /feed/sign — golden vector: the signed updateFeeds message is byte-identical to
// what feed-pusher.mjs pushNeoN3 signs today, and the signature verifies.
// ---------------------------------------------------------------------------

// Independently rebuild the EXACT updateFeeds tx feed-pusher.mjs pushNeoN3 builds
// (sc.createScript + tx.Transaction + getMessageForSigning), using raw neon-js —
// NOT the server's builder. Equality proves the server reproduced the on-chain
// message byte-for-byte. This mirrors pushNeoN3 lines 300-336 precisely.
// txParams must include the EXACT nonce the server used (tx.Transaction otherwise
// assigns a random nonce, making getMessageForSigning non-deterministic). The
// server returns its nonce as body.tx_nonce so the broadcaster — and this test —
// rebuild the identical tx.
function feedPusherTxMessage(planned, txParams, updaterPublicKey) {
  const { P, R, PX, TS, AH, SS } = planned;
  const script = sc.createScript({
    scriptHash: FEED_N3_CONTRACT,
    operation: 'updateFeeds',
    args: [
      sc.ContractParam.array(...P.map((x) => sc.ContractParam.string(x))),
      sc.ContractParam.array(...R.map((x) => sc.ContractParam.integer(x))),
      sc.ContractParam.array(...PX.map((x) => sc.ContractParam.integer(x))),
      sc.ContractParam.array(...TS.map((x) => sc.ContractParam.integer(x))),
      sc.ContractParam.array(...AH.map((x) => sc.ContractParam.byteArray(x))),
      sc.ContractParam.array(...SS.map((x) => sc.ContractParam.integer(x))),
    ],
  });
  const updaterScriptHash = neoWallet.getScriptHashFromPublicKey(updaterPublicKey);
  const txn = new tx.Transaction({
    nonce: txParams.nonce,
    signers: [{ account: updaterScriptHash, scopes: tx.WitnessScope.CalledByEntry }],
    validUntilBlock: txParams.blockCount + 500,
    script,
  });
  txn.systemFee = u.BigInteger.fromNumber(txParams.systemFee);
  txn.networkFee = u.BigInteger.fromNumber(txParams.networkFee);
  return txn.getMessageForSigning(FEED_N3_MAGIC);
}

test('feed/sign: updateFeeds tx message byte-identical to feed-pusher + signature verifies', async () => {
  // Deterministic price set (the stubbed in-enclave fetch), fixed clock, and the
  // on-chain state the relayer/feed-pusher would read on the host.
  const FIXED_NOW = 1_780_000_000;
  const SYMBOLS = ['NEO-USD', 'GAS-USD', 'BTC-USD'];
  const STUB_PRICES = { 'NEO-USD': 5.25, 'GAS-USD': 2.1, 'BTC-USD': 65000.123456 };
  const ONCHAIN_STATE = {
    // NEO/BTC will push (price move / no prior record); GAS is unchanged+recent → skipped.
    'NEO-USD': { round: FIXED_NOW - 60, price: 5.0, timestamp: FIXED_NOW - 60 },
    'GAS-USD': { round: FIXED_NOW - 60, price: 2.1, timestamp: FIXED_NOW - 60 },
    'BTC-USD': { round: 0, price: 0, timestamp: 0 },
  };
  // Pin the tx nonce so the message is deterministic (tx.Transaction otherwise
  // randomizes it). The server echoes it back as body.tx_nonce.
  const TX_PARAMS = { block_count: 1234567, system_fee: 1234567, network_fee: 234567, nonce: 777 };

  __setPriceFetcherForTests(async (syms) => {
    const out = {};
    for (const s of syms) if (s in STUB_PRICES) out[s] = STUB_PRICES[s];
    return out;
  });

  const req = {
    chain: 'neo_n3',
    symbols: SYMBOLS,
    onchain_state: ONCHAIN_STATE,
    now: FIXED_NOW,
    tx_params: TX_PARAMS,
    nonce: 'cafe',
  };

  const { status, body } = await dispatch('POST', '/feed/sign', AUTH, JSON.stringify(req));
  assert.equal(status, 200, `dispatch failed: ${JSON.stringify(body)}`);
  assert.equal(body.status, 'ok');
  assert.equal(body.trust_tier, 'enclave-attested');
  assert.equal(body.nonce, 'cafe');

  // Independently recompute the planned arrays using the IMPORTED planFeedUpdate +
  // the SAME scaling/attestation-hash feed-pusher.mjs uses.
  const planned = { P: [], R: [], PX: [], TS: [], AH: [], SS: [] };
  for (const s of SYMBOLS) {
    if (!(s in STUB_PRICES)) continue;
    const cur = {
      round: ONCHAIN_STATE[s].round,
      price: ONCHAIN_STATE[s].price,
      ts: ONCHAIN_STATE[s].timestamp,
    };
    const px = Math.round(STUB_PRICES[s] * 1e6);
    const plan = planFeedUpdate(cur, STUB_PRICES[s], FIXED_NOW);
    if (!plan.push) continue;
    planned.P.push('TWELVEDATA:' + s);
    planned.R.push(plan.round);
    planned.PX.push(px);
    planned.TS.push(plan.ts);
    planned.AH.push(createHash('sha256').update(`${s}|${px}|${plan.ts}`).digest('hex').slice(0, 32));
    planned.SS.push(0);
  }

  // GAS-USD is skipped (recent + unchanged); only NEO + BTC are signed.
  assert.deepEqual(body.pairs, ['TWELVEDATA:NEO-USD', 'TWELVEDATA:BTC-USD']);
  assert.deepEqual(body.prices_scaled, planned.PX);
  assert.deepEqual(body.rounds, planned.R);
  assert.deepEqual(body.timestamps, planned.TS);
  assert.deepEqual(body.attestation_hashes, planned.AH);
  assert.deepEqual(body.source_set_ids, planned.SS);
  assert.ok(
    body.skipped.some((e) => e.symbol === 'GAS-USD'),
    'GAS-USD must be reported skipped (recent + unchanged)'
  );

  // The server returns the nonce it used; rebuilding with it must reproduce the
  // signed message byte-for-byte. (Also assert the server honoured our pin.)
  assert.equal(body.tx_nonce, TX_PARAMS.nonce, 'server must honour the supplied tx nonce');
  assert.equal(body.valid_until_block, TX_PARAMS.block_count + 500);

  // The load-bearing assertion: the server's signed message === the message
  // feed-pusher.mjs would sign, recomputed independently from raw neon-js using
  // the SAME nonce the server returned.
  const expectedMessage = feedPusherTxMessage(planned, {
    blockCount: TX_PARAMS.block_count,
    systemFee: TX_PARAMS.system_fee,
    networkFee: TX_PARAMS.network_fee,
    nonce: body.tx_nonce,
  }, UPDATER_ACCOUNT.publicKey);
  assert.equal(
    body.tx_message_hex,
    expectedMessage,
    'feed tx message must be byte-identical to feed-pusher.mjs'
  );

  // The signer is the updater, and the signature verifies over that message.
  assert.equal(
    body.public_key.toLowerCase(),
    UPDATER_ACCOUNT.publicKey.toLowerCase(),
    'feed signer must be the updater'
  );
  assert.equal(
    neoWallet.verify(body.tx_message_hex, body.signature, body.public_key),
    true,
    'feed signature must verify over the tx message'
  );

  // Sanity: a Witness built from this signature is the witness feed-pusher.mjs
  // attaches (tx.Witness.fromSignature(sig, pub)) — proves the signature is in the
  // form the broadcast path consumes.
  const witness = tx.Witness.fromSignature(body.signature, body.public_key);
  assert.ok(witness.invocationScript.toString().length > 0);

  __resetPriceFetcherForTests();
});

test('feed/sign: no symbol clears the push decision → no-update (no signature)', async () => {
  const FIXED_NOW = 1_780_000_000;
  __setPriceFetcherForTests(async () => ({ 'NEO-USD': 5.0 }));
  const req = {
    chain: 'neo_n3',
    symbols: ['NEO-USD'],
    // recent + unchanged → planFeedUpdate returns push:false
    onchain_state: { 'NEO-USD': { round: FIXED_NOW - 60, price: 5.0, timestamp: FIXED_NOW - 60 } },
    now: FIXED_NOW,
  };
  const { status, body } = await dispatch('POST', '/feed/sign', AUTH, JSON.stringify(req));
  assert.equal(status, 200);
  assert.equal(body.status, 'no-update');
  assert.equal(body.tx_message_hex, null);
  assert.equal(body.signature, null);
  assert.deepEqual(body.pairs, []);
  __resetPriceFetcherForTests();
});

test('feed/sign: tx params come from the provider seam when not supplied in the request', async () => {
  const FIXED_NOW = 1_780_000_000;
  __setPriceFetcherForTests(async () => ({ 'NEO-USD': 7.0 }));
  // No tx_params in the request → the server pulls them from the provider seam
  // (in production: an RPC read via the egress lane). Pin a nonce so the rebuild
  // is deterministic.
  __setFeedTxParamsProviderForTests(async () => ({
    blockCount: 9000000,
    systemFee: 555,
    networkFee: 666,
  }));
  const req = {
    chain: 'neo_n3',
    symbols: ['NEO-USD'],
    onchain_state: { 'NEO-USD': { round: FIXED_NOW - 60, price: 5.0, timestamp: FIXED_NOW - 60 } },
    now: FIXED_NOW,
    tx_nonce: 4242,
  };
  const { status, body } = await dispatch('POST', '/feed/sign', AUTH, JSON.stringify(req));
  assert.equal(status, 200, `dispatch failed: ${JSON.stringify(body)}`);
  assert.equal(body.status, 'ok');
  assert.equal(body.valid_until_block, 9000000 + 500, 'valid_until_block must come from the provider');
  assert.equal(body.tx_nonce, 4242);

  // Rebuild independently with the provider's params + returned nonce.
  const px = Math.round(7.0 * 1e6);
  const plan = planFeedUpdate({ round: FIXED_NOW - 60, price: 5.0, ts: FIXED_NOW - 60 }, 7.0, FIXED_NOW);
  const planned = {
    P: ['TWELVEDATA:NEO-USD'],
    R: [plan.round],
    PX: [px],
    TS: [plan.ts],
    AH: [createHash('sha256').update(`NEO-USD|${px}|${plan.ts}`).digest('hex').slice(0, 32)],
    SS: [0],
  };
  const expectedMessage = feedPusherTxMessage(
    planned,
    { blockCount: 9000000, systemFee: 555, networkFee: 666, nonce: body.tx_nonce },
    UPDATER_ACCOUNT.publicKey
  );
  assert.equal(body.tx_message_hex, expectedMessage, 'provider-param tx message must be byte-exact');
  assert.equal(neoWallet.verify(body.tx_message_hex, body.signature, body.public_key), true);

  __resetFeedTxParamsProviderForTests();
  __resetPriceFetcherForTests();
});

test('feed/sign: missing tx params (no request params, default provider) surfaces 503', async () => {
  const FIXED_NOW = 1_780_000_000;
  // 5.0 -> 5.5 is a 10% move: past the bps threshold, well under the 50%
  // deviation ceiling, so the symbol pushes and the provider IS reached.
  __setPriceFetcherForTests(async () => ({ 'NEO-USD': 5.5 }));
  __resetFeedTxParamsProviderForTests(); // default provider throws 503
  const req = {
    chain: 'neo_n3',
    symbols: ['NEO-USD'],
    onchain_state: { 'NEO-USD': { round: FIXED_NOW - 60, price: 5.0, timestamp: FIXED_NOW - 60 } },
    now: FIXED_NOW,
  };
  const { status, body } = await dispatch('POST', '/feed/sign', AUTH, JSON.stringify(req));
  assert.equal(status, 503, `expected 503, got ${status}: ${JSON.stringify(body)}`);
  assert.match(body.error, /tx network params/);
  __resetPriceFetcherForTests();
});

test('feed/sign: a symbol missing from the price fetch is reported, not signed', async () => {
  const FIXED_NOW = 1_780_000_000;
  __setPriceFetcherForTests(async () => ({ 'NEO-USD': 6.0 })); // GAS-USD missing
  const req = {
    chain: 'neo_n3',
    symbols: ['NEO-USD', 'GAS-USD'],
    onchain_state: {
      'NEO-USD': { round: FIXED_NOW - 60, price: 5.0, timestamp: FIXED_NOW - 60 },
      'GAS-USD': { round: FIXED_NOW - 60, price: 2.0, timestamp: FIXED_NOW - 60 },
    },
    now: FIXED_NOW,
    tx_params: { block_count: 100, system_fee: 1, network_fee: 1 },
  };
  const { status, body } = await dispatch('POST', '/feed/sign', AUTH, JSON.stringify(req));
  assert.equal(status, 200);
  assert.equal(body.status, 'ok');
  assert.deepEqual(body.pairs, ['TWELVEDATA:NEO-USD']);
  assert.deepEqual(body.missing, ['GAS-USD']);
  __resetPriceFetcherForTests();
});

test('feed/sign: validation — symbols required, unsupported chain rejected', async () => {
  const noSymbols = await dispatch(
    'POST',
    '/feed/sign',
    AUTH,
    JSON.stringify({ chain: 'neo_n3', symbols: [] })
  );
  assert.equal(noSymbols.status, 400);
  assert.match(noSymbols.body.error, /symbols/);

  const badChain = await dispatch(
    'POST',
    '/feed/sign',
    AUTH,
    JSON.stringify({ chain: 'neox', symbols: ['NEO-USD'] })
  );
  assert.equal(badChain.status, 400);
  assert.match(badChain.body.error, /unsupported feed chain/);
});

// ---------------------------------------------------------------------------
// /attestation — nsm-attest passthrough via the stubbed seam. Asserts user_data
// binds sha256(fulfillment_digest) and the nonce is echoed.
// ---------------------------------------------------------------------------

test('attestation: user_data binds sha256(fulfillment_digest) + nonce echo (stubbed seam)', async () => {
  const fulfillmentDigest = 'ab'.repeat(32); // 32-byte digest hex
  const nonce = 'feed1234';
  const expectedUserData = createHash('sha256')
    .update(Buffer.from(fulfillmentDigest, 'hex'))
    .digest('hex');

  // Stub the attest runner: capture the args the server passes, return a fake doc.
  let capturedArgs = null;
  __setAttestRunnerForTests((args) => {
    capturedArgs = args;
    return { ok: true, attestation_b64: 'ZmFrZS1jb3NlLWRvYw==', document_len: 11 };
  });

  const req = { fulfillment_digest_hex: fulfillmentDigest, nonce };
  const { status, body } = await dispatch('POST', '/attestation', {}, JSON.stringify(req));
  assert.equal(status, 200, `dispatch failed: ${JSON.stringify(body)}`);
  assert.equal(body.status, 'ok');
  assert.equal(body.trust_tier, 'enclave-attested');

  // user_data is the SINGLE 32-byte commit sha256(digest_bytes) — the §5 binding.
  assert.equal(body.user_data_hex, expectedUserData);
  assert.equal(body.user_data_hex.length, 64, 'user_data must be a single 32-byte commit');
  assert.equal(body.nonce, nonce, 'nonce must be echoed');
  assert.equal(body.attestation_document, 'ZmFrZS1jb3NlLWRvYw==');

  // The binary actually received --user-data <sha256(digest)>, --nonce <nonce>,
  // and --public-key <oracle_verifier pubkey>.
  const argMap = {};
  for (let i = 0; i < capturedArgs.length; i += 2) argMap[capturedArgs[i]] = capturedArgs[i + 1];
  assert.equal(argMap['--user-data'], expectedUserData);
  assert.equal(argMap['--nonce'], nonce);
  assert.equal(
    argMap['--public-key'].toLowerCase(),
    ORACLE_VERIFIER_ACCOUNT.publicKey.toLowerCase(),
    '--public-key must bind the oracle_verifier signer'
  );

  __resetAttestRunnerForTests();
});

test('attestation: GET liveness probe with no binding emits no user_data', async () => {
  __setAttestRunnerForTests((args) => {
    // No --user-data when no binding is supplied.
    assert.equal(args.includes('--user-data'), false);
    return { ok: true, attestation_b64: 'bGl2ZW5lc3M=', document_len: 8 };
  });
  const { status, body } = await dispatch('GET', '/attestation', {}, '');
  assert.equal(status, 200);
  assert.equal(body.user_data_hex, null);
  assert.equal(body.attestation_document, 'bGl2ZW5lc3M=');
  __resetAttestRunnerForTests();
});

test('attestation: a {ok:false} nsm helper surfaces a 503 with its error', async () => {
  __setAttestRunnerForTests(() => ({ ok: false, error: 'open /dev/nsm: not in an enclave' }));
  const { status, body } = await dispatch(
    'POST',
    '/attestation',
    {},
    JSON.stringify({ fulfillment_digest_hex: 'cc'.repeat(32) })
  );
  assert.equal(status, 503);
  assert.match(body.error, /\/dev\/nsm/);
  __resetAttestRunnerForTests();
});

test('attestation: a throwing nsm helper (spawn failure) surfaces a wrapped 503', async () => {
  __setAttestRunnerForTests(() => {
    throw new Error('spawn ENOENT');
  });
  const { status, body } = await dispatch(
    'POST',
    '/attestation',
    {},
    JSON.stringify({ fulfillment_digest_hex: 'dd'.repeat(32) })
  );
  assert.equal(status, 503);
  assert.match(body.error, /nsm attestation helper failed/);
  __resetAttestRunnerForTests();
});

test('attestation: a malformed (odd-length) binding hex is rejected with 400', async () => {
  const { status, body } = await dispatch(
    'POST',
    '/attestation',
    {},
    JSON.stringify({ fulfillment_digest_hex: 'abc' }) // odd length
  );
  assert.equal(status, 400);
  assert.match(body.error, /even-length hex/);
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
    AUTH,
    JSON.stringify({ chain: 'neo_n3', request_id: '1' })
  );
  assert.equal(noType.status, 400);
  assert.match(noType.body.error, /request_type/);

  const noId = await dispatch(
    'POST',
    '/oracle/fulfill',
    AUTH,
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

// ---------------------------------------------------------------------------
// Auth + provisioning + signer surface (the folded-in signer endpoints that make
// this enclave a strict superset of nitro-signer-server.mjs).
// ---------------------------------------------------------------------------

test('sensitive routes require the bearer token; health + attestation stay open', async () => {
  // No/incorrect auth on a signing route -> 401 (checked before any validation).
  const noAuth = await dispatch('POST', '/oracle/fulfill', {}, JSON.stringify({}));
  assert.equal(noAuth.status, 401);
  const wrongAuth = await dispatch(
    'POST',
    '/feed/sign',
    { authorization: 'Bearer wrong' },
    JSON.stringify({ chain: 'neo_n3', symbols: ['BTC-USD'] })
  );
  assert.equal(wrongAuth.status, 401);
  // Open endpoints don't require a token.
  const health = await dispatch('GET', '/health', {}, '');
  assert.ok(health.status === 200 || health.status === 503);
});

test('sign/payload signs data_hex with the pinned role key', async () => {
  const dataHex = createHash('sha256').update('enclave-sign-payload-test').digest('hex');
  const { status, body } = await dispatch(
    'POST',
    '/sign/payload',
    AUTH,
    JSON.stringify({ role: 'oracle_verifier', data_hex: dataHex })
  );
  assert.equal(status, 200);
  assert.equal(body.role, 'oracle_verifier');
  assert.equal(body.public_key, ORACLE_VERIFIER_ACCOUNT.publicKey);
  // The signature must verify against the returned public key over the data.
  assert.equal(neoWallet.verify(dataHex, body.signature, body.public_key), true);
});

test('keys/derived returns a pinned role identity (no secret)', async () => {
  const { status, body } = await dispatch(
    'POST',
    '/keys/derived',
    AUTH,
    JSON.stringify({ role: 'updater' })
  );
  assert.equal(status, 200);
  assert.equal(body.role, 'updater');
  assert.equal(body.neo_n3.public_key, UPDATER_ACCOUNT.publicKey);
});

test('provision applies env keys at runtime and reports role health', async () => {
  // Provision a benign extra key + re-affirm the network; the keys are already set
  // at module load, so roles should report ok. (Bootstrap-open is not exercised
  // here because NITRO_API_TOKEN already seeds a trusted token.)
  const { status, body } = await dispatch(
    'POST',
    '/provision',
    AUTH,
    JSON.stringify({ env: { MORPHEUS_NETWORK: 'testnet', TD_KEY: 'provisioned-td-key' } })
  );
  assert.equal(status, 200);
  assert.equal(body.provisioned, true);
  assert.equal(body.network, 'testnet');
  assert.ok(body.env_keys.includes('TD_KEY'));
  assert.equal(process.env.TD_KEY, 'provisioned-td-key');
  const verifier = body.roles.find((r) => r.role === 'oracle_verifier');
  assert.equal(verifier.ok, true);
});

test('cleanup: reset stubbed worker handler', () => {
  __resetWorkerHandlerForTests();
  delete process.env.TD_KEY;
  assert.ok(true);
});
