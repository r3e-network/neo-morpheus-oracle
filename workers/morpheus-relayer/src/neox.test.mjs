import test from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import {
  hasNeoXRelayerConfig,
  resolveResultBytesHex,
  buildNeoXDigest,
  signNeoXFulfillment,
  normalizeNeoXRevert,
  decodeConfidentialEnvelope,
  getNeoXConfirmTimeoutMs,
  scanNeoXOracleRequestsById,
  waitForNeoXReceipt,
} from './neox.js';
import {
  classifyError,
  isAlreadyFulfilledError,
  isTerminalConfigurationError,
} from './fulfillment.js';

// Deterministic throwaway test key (not used anywhere live).
const TEST_PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const TEST_ADDR = new ethers.Wallet(TEST_PK).address;

const baseConfig = {
  neox: {
    chainId: 47763,
    oracleContract: '0xeCFC1C652B5cCdBfe3E9314a83156787D92a3fD2',
    updaterPrivateKey: TEST_PK,
  },
};

test('hasNeoXRelayerConfig requires rpc, oracle, and updater key', () => {
  assert.equal(hasNeoXRelayerConfig({}), false);
  assert.equal(hasNeoXRelayerConfig({ neox: { rpcUrl: 'x', oracleContract: 'y' } }), false);
  assert.equal(
    hasNeoXRelayerConfig({ neox: { rpcUrl: 'x', oracleContract: 'y', updaterPrivateKey: 'z' } }),
    true
  );
});

test('resolveResultBytesHex prefers compact bytes, falls back to utf8', () => {
  // 32-byte VRF randomness as base64 -> 0x + 64 hex chars
  const randomness = Buffer.from('a'.repeat(64), 'hex');
  const b64 = randomness.toString('base64');
  assert.equal(resolveResultBytesHex('', b64), `0x${randomness.toString('hex')}`);
  // No compact bytes -> utf8 encode of the result string
  assert.equal(
    resolveResultBytesHex('hello', ''),
    `0x${Buffer.from('hello', 'utf8').toString('hex')}`
  );
  // Empty -> 0x
  assert.equal(resolveResultBytesHex('', ''), '0x');
});

test('buildNeoXDigest matches the contract ABI encoding spec', () => {
  const fulfillment = {
    requestId: '7',
    appId: 'vrf-e2e',
    moduleId: 'random.generate',
    operation: 'random',
    success: true,
    error: '',
  };
  const resultHex = `0x${'ab'.repeat(32)}`;
  const digest = buildNeoXDigest(baseConfig, fulfillment, resultHex);

  // Independent reference computation of MorpheusOracleEVM.fulfillmentDigest.
  const ref = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      [
        'string',
        'uint256',
        'address',
        'uint256',
        'bytes32',
        'bytes32',
        'bytes32',
        'bool',
        'bytes32',
        'bytes32',
      ],
      [
        'morpheus-evm-fulfillment-v1',
        47763n,
        '0xeCFC1C652B5cCdBfe3E9314a83156787D92a3fD2',
        7n,
        ethers.keccak256(ethers.toUtf8Bytes('vrf-e2e')),
        ethers.keccak256(ethers.toUtf8Bytes('random.generate')),
        ethers.keccak256(ethers.toUtf8Bytes('random')),
        true,
        ethers.keccak256(resultHex),
        ethers.keccak256(ethers.toUtf8Bytes('')),
      ]
    )
  );
  assert.equal(digest, ref);
});

test('signNeoXFulfillment produces an EIP-191 signature recoverable to the verifier', async () => {
  const fulfillment = {
    requestId: '7',
    appId: 'vrf-e2e',
    moduleId: 'random.generate',
    operation: 'random',
    success: true,
    result: '',
    result_bytes_base64: Buffer.from('cd'.repeat(32), 'hex').toString('base64'),
    error: '',
  };
  const out = await signNeoXFulfillment(baseConfig, fulfillment);
  assert.equal(out.source, 'relayer_local_evm');
  assert.equal(out.address, TEST_ADDR);

  // Recompute the digest exactly as the contract would and verify EIP-191 recovery.
  const resultHex = resolveResultBytesHex(fulfillment.result, fulfillment.result_bytes_base64);
  const digest = buildNeoXDigest(baseConfig, fulfillment, resultHex);
  const recovered = ethers.verifyMessage(ethers.getBytes(digest), out.signature);
  assert.equal(recovered, TEST_ADDR);
});

test('normalizeNeoXRevert maps decoded custom errors to the classifier vocabulary', () => {
  // ethers surfaces a decoded custom error as error.revert.name (needs error
  // fragments in the ABI, which neox.js now includes for the staticCall path).
  const notPending = normalizeNeoXRevert({
    revert: { name: 'RequestNotPending' },
    shortMessage: 'execution reverted',
  });
  assert.ok(
    isAlreadyFulfilledError(notPending.message),
    'RequestNotPending -> already fulfilled (settled)'
  );
  assert.equal(classifyError(notPending), 'settled');

  const badSig = normalizeNeoXRevert({
    revert: { name: 'BadSignature' },
    shortMessage: 'execution reverted',
  });
  assert.ok(isTerminalConfigurationError(badSig.message), 'BadSignature -> terminal config');
  assert.equal(classifyError(badSig), 'permanent');

  const notUpdater = normalizeNeoXRevert({ revert: { name: 'NotUpdater' } });
  assert.equal(classifyError(notUpdater), 'permanent');

  // Fallback: name absent but present in the message text still classifies.
  const textOnly = normalizeNeoXRevert({ message: 'execution reverted: RequestNotPending()' });
  assert.equal(classifyError(textOnly), 'settled');
});

test('signNeoXFulfillment honours a separate verifier key', async () => {
  const verifierPk = '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba';
  const cfg = { neox: { ...baseConfig.neox, verifierPrivateKey: verifierPk } };
  const out = await signNeoXFulfillment(cfg, {
    requestId: '1',
    appId: 'a',
    moduleId: 'random.generate',
    operation: 'random',
    success: true,
    result: '',
    result_bytes_base64: '',
    error: '',
  });
  assert.equal(out.address, new ethers.Wallet(verifierPk).address);
});

test('decodeConfidentialEnvelope recovers the base64 envelope from abi.encode(id,bytes)', () => {
  // MiniAppMessageEVM.requestReveal submits abi.encode(uint256 id, bytes envelope);
  // the envelope itself is the base64 of the X25519 confidential JSON.
  const envelopeB64 = Buffer.from(
    JSON.stringify({
      v: 2,
      alg: 'X25519-HKDF-SHA256-AES-256-GCM',
      epk: 'e',
      iv: 'i',
      ct: 'c',
      tag: 't',
    })
  ).toString('base64');
  const payload = ethers.AbiCoder.defaultAbiCoder().encode(
    ['uint256', 'bytes'],
    [4, ethers.toUtf8Bytes(envelopeB64)]
  );
  assert.equal(decodeConfidentialEnvelope(payload), envelopeB64);
});

test('decodeConfidentialEnvelope falls back to utf8 for a raw (non-abi) payload', () => {
  // A payload that is itself the utf8 of the envelope string (not abi.encode-wrapped)
  // must still decode to that string rather than throwing.
  const raw = 'plain-base64-envelope-string';
  const payload = `0x${Buffer.from(raw, 'utf8').toString('hex')}`;
  assert.equal(decodeConfidentialEnvelope(payload), raw);
});

// Still-pending getRequest record in the shape ethers decodes from the kernel ABI.
function pendingNeoXRecord(id) {
  return {
    id: BigInt(id),
    appId: 'vrf-e2e',
    moduleId: 'random.generate',
    operation: 'random',
    payload: '0x',
    requester: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    callbackContract: ethers.ZeroAddress,
    status: 1,
    createdAt: 1n,
    fulfilledAt: 0n,
    success: false,
    resultBytes: '0x',
    errorText: '',
  };
}

test('scanNeoXOracleRequestsById skips ids that revert with CALL_EXCEPTION', async () => {
  const stub = {
    getRequest: async (id) => {
      if (id === 2) {
        throw Object.assign(new Error('could not decode result data'), {
          code: 'CALL_EXCEPTION',
        });
      }
      return pendingNeoXRecord(id);
    },
  };
  const events = await scanNeoXOracleRequestsById(baseConfig, 1, 3, stub);
  assert.deepEqual(
    events.map((event) => event.requestId),
    ['1', '3']
  );
});

test('scanNeoXOracleRequestsById rethrows transport errors so the cursor tick aborts', async () => {
  // A transient RPC failure mid-range must abort the scan: the caller only
  // advances last_request_id after a successful scan, so the failed id (and the
  // rest of the range) is rescanned next tick instead of being orphaned.
  // concurrency: 1 pins the batched scan to the exact sequential behavior this
  // test has always asserted (stop issuing reads after the failed id).
  const seen = [];
  const stub = {
    getRequest: async (id) => {
      seen.push(id);
      if (id === 2) throw new Error('ECONNRESET');
      return pendingNeoXRecord(id);
    },
  };
  await assert.rejects(
    scanNeoXOracleRequestsById({ ...baseConfig, concurrency: 1 }, 1, 4, stub),
    /ECONNRESET/
  );
  assert.deepEqual(seen, [1, 2]);
});

test('scanNeoXOracleRequestsById batched scan is equivalent to the sequential path', async () => {
  // Equivalence gate for the bounded-concurrency scan (OR-W2-04): the same
  // stubbed provider is scanned sequentially (concurrency 1) and concurrently;
  // both must produce identical, ascending-id event lists. The stub delays
  // earlier ids longer than later ids so out-of-order completion would surface
  // as a reordered result if index ordering ever regressed.
  const makeStub = () => ({
    getRequest: async (id) => {
      await new Promise((resolve) => setTimeout(resolve, (6 - id) * 5));
      if (id === 2) {
        throw Object.assign(new Error('could not decode result data'), {
          code: 'CALL_EXCEPTION',
        });
      }
      if (id === 4) return { ...pendingNeoXRecord(id), status: 2 }; // already settled
      return pendingNeoXRecord(id);
    },
  });
  const sequential = await scanNeoXOracleRequestsById(
    { ...baseConfig, concurrency: 1 },
    1,
    5,
    makeStub()
  );
  const batched = await scanNeoXOracleRequestsById(
    { ...baseConfig, concurrency: 4 },
    1,
    5,
    makeStub()
  );
  assert.deepEqual(batched, sequential);
  assert.deepEqual(
    batched.map((event) => event.requestId),
    ['1', '3', '5']
  );
});

test('scanNeoXOracleRequestsById stops pulling new ids once a transport error fails the scan', async () => {
  // Fail-fast under concurrency: ids beyond the in-flight window must never be
  // fetched after the failure surfaces.
  const seen = [];
  const stub = {
    getRequest: async (id) => {
      seen.push(id);
      if (id === 1) throw new Error('ECONNRESET');
      await new Promise((resolve) => setTimeout(resolve, 5));
      return pendingNeoXRecord(id);
    },
  };
  await assert.rejects(
    scanNeoXOracleRequestsById({ ...baseConfig, concurrency: 2 }, 1, 20, stub),
    /ECONNRESET/
  );
  // Workers stop pulling after the failure: at most the two in-flight ids plus
  // one follow-up pulled before the rejection propagated.
  assert.ok(seen.length <= 4, `expected fail-fast, scanned ${seen.length} ids`);
});

test('waitForNeoXReceipt rejects within the deadline when wait() never settles', async () => {
  const startedAt = Date.now();
  await assert.rejects(
    waitForNeoXReceipt({ hash: '0xdead', wait: () => new Promise(() => {}) }, 50),
    /timed out/
  );
  assert.ok(Date.now() - startedAt < 5000);
  // The timeout error must classify as transient so the fulfillment is retried.
  try {
    await waitForNeoXReceipt({ hash: '0xdead', wait: () => new Promise(() => {}) }, 50);
    assert.fail('expected waitForNeoXReceipt to reject');
  } catch (error) {
    assert.equal(classifyError(error), 'transient');
  }
});

test('waitForNeoXReceipt resolves with the receipt when wait settles in time', async () => {
  const receipt = { status: 1 };
  assert.equal(await waitForNeoXReceipt({ hash: '0x1', wait: async () => receipt }, 1000), receipt);
});

test('getNeoXConfirmTimeoutMs honours the config knob and defaults to 45s', () => {
  assert.equal(getNeoXConfirmTimeoutMs({}), 45_000);
  assert.equal(getNeoXConfirmTimeoutMs({ neox: { confirmTimeoutMs: 12_000 } }), 12_000);
  assert.equal(getNeoXConfirmTimeoutMs({ neox: { confirmTimeoutMs: 0 } }), 45_000);
});
